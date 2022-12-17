import babel from "@babel/core";

import { inspect } from "util";
import vm from "vm";

import type { Config } from "./config2.js";

export type ScriptLineType = "code" | "comment" | "result" | "error" |
    "placeholder" | "hidden" | "unknown";

export type ScriptLine = { line: string, type: ScriptLineType, lineNo: number };

export type ScriptReader = (line: ScriptLine) => void;

type ExecResult = Array<{ type: "error" | "result" | "code", value: any, sync: boolean }>;

const ExecHeader = `
const _output = [ ];

const _emitError = async (func) => {
    let sync = true;
    try {
        const value = func();
        if (value && typeof(value.then) === "function") {
            sync = false;
            await value;
        }
        throw new Error("missing error 2");
    } catch (error) {
        _output.push({ value: error, type: "error", sync });
    }
}

const _emit = async (value, type) => {
    _output.push({ value, type, sync: true });
}

const _emitResult = async (value) => {
    if (value && value.then) {
        try {
            value = await value;
            _output.push({ value, type: "result", sync: false });
        } catch (error) {
            throw new Error("unexpected error");
        }
    } else {
        _output.push({ value, type: "result", sync: true });
    }
};

(async function() {
`;

const ExecFooter = `
    return _output;
})();
`;


function execTransform(code: string, type: "error" | "result"): string {
    let count = 0;
    let foundCount = -1;

    const id = (name: string) => babel.types.identifier(name);
    //const str = (value: string) => babel.types.stringLiteral(value);
    const call = (name: string, ...args: Array<babel.types.Expression>) =>
        babel.types.callExpression(id(name), args);
    //const stmnt = (expr: babel.types.Expression) => babel.types.expressionStatement(expr);

    const TransformWrap = {
        exit(path: any) {
            count++;
            if (foundCount >= 0) {
                if (count == foundCount) {
                    path.skip();

                    // The call with the result is only called on non-error
                    let node: babel.types.Node;

                    // Add a try...catch to things we expect to throw
                    if (type === "error") {
                        const block = babel.types.blockStatement([
                            babel.types.returnStatement(path.node) //call("_emit", path.node, str()))
                        ]);
                        const arrow = babel.types.arrowFunctionExpression([ ],
                            block
                        );
                        node = call("_emitError", arrow);
                        /*

                        const handler = babel.types.catchClause(
                            id("error"),
                            babel.types.blockStatement([
                                stmnt(
                                    babel.types.callExpression(id("_emit"), [
                                        id("error"), str("error")
                                    ])
                                )
                            ])
                         );

                        node = babel.types.tryStatement(block, handler);
                        */
                    } else {
                        node = call("_emitResult", path.node);;
//                        node = babel.types.awaitExpression(node);
                    }

                    path.replaceWith(babel.types.awaitExpression(node));
                }
            }
        }
    };

    // First time through, we just count the number of expressions
    babel.transformSync(code, {
        plugins: [ { visitor: { Expression: TransformWrap } } ]
    });
    foundCount = count;
    count = 0;

    const transformed = babel.transformSync(code, {
        plugins: [ { visitor: { Expression: TransformWrap } } ]
    }).code;

    return transformed;
}

export class Script {
    readonly language: string;

    readonly filename: string;
    readonly lineOffset: number;

    readonly #lines: Array<string>;
    #result: null | Array<{ type: ScriptLineType, line: string }>;

    //#context: null | any;

    constructor(source: string, language: string, filename?: string, lineOffset?: number) {
        this.language = language;

        this.filename = filename || "%unknown%";
        this.lineOffset = (lineOffset != null) ? lineOffset: 0

        const lines = source.split("\n");

        // Remove all leading and trailing new lines
        while (lines.length && !lines[0].trim()) { lines.shift(); }
        while (lines.length && !lines[lines.length - 1].trim()) { lines.pop(); }

        // Remove common leading whitespace from each line
        let spaces = lines.reduce((accum, line) => {
            if (line.trim() === "") { return accum; }
            const spaces = line.match(/^(\s*)/)[1].length;
            if (accum == -1 || spaces < accum) { return spaces; }
            return accum;
        }, -1);

        this.#lines = lines.map((l) => l.substring(spaces));
        this.#result = null;
    }

    get source(): string { return this.#lines.join("\n"); }

    isEvaluated(): boolean { return this.#result != null; }

    async evaluate(config: Config): Promise<void> {
        if (this.isEvaluated()) { return; }
        const result: Array<{ type: ScriptLineType, line: string }> = [ ];

        if (this.language === "javascript") {
            for (const { type, line } of await this.#execute(config)) {
                result.push({ line, type });
            }

        } else if (this.language === "script") {
            for (const line of this.#lines) {
                const type = line.trim().startsWith("/\/") ? "comment": "code";
                result.push({ line, type });
            }

        } else if (this.language === "shell") {
            for (const line of this.#lines) {
                const type = line.trim().startsWith("#") ? "comment": "code";
                result.push({ line, type });
            }

        } else {
            for (const line of this.#lines) {
                result.push({ line, type: "unknown" });
            }
        }

        this.#result = result;
    }

    forEach(func: ScriptReader): void {
        if (this.#result != null) {
            this.#result.forEach(({ line, type }, index) => {
                func({ line, type, lineNo: index });
            });
            return;
        }

        this.#lines.forEach((line, index) => {
            func({ line, type: "unknown", lineNo: index });
        });
    }

    async #execute(config: Config): Promise<Array<{ type: ScriptLineType, line: string }>> {

        const clumps: Array<{ type: ScriptLineType, code: Array<string> }> = [ ];
        {

            let code: Array<string> = [ ]
            for (let line of this.#lines) {
                if (line.trim().startsWith("/\/_")) {
                    line = line.trim();
                    const type = line.substring(3, line.indexOf(":"));
                    switch (type) {
                        case "result": case "error":
                            clumps.push({ code, type });
                            break;
                        case "setup":
                            clumps.push({ code, type: "code" }); //@TODO: remove
                            break;
                        default:
                            throw new Error(`unknown tag: ${ type }`);
                    }
                    code = [ ];

                } else {
                    code.push(line)
                }
            }

            if (code.join("").trim()) { clumps.push({ code, type: "code" }); }
        }

        const exec: Array<string> = [ ];

        exec.push(ExecHeader);
        for (const { code, type } of clumps) {
            exec.push(`_emit(${ JSON.stringify(code.join("\n")) }, "code");`)
            if (type === "error" || type === "result") {
                exec.push(`/\/ <Transformed>`);
                exec.push(execTransform(code.join("\n"), type) + ";");
                exec.push(`/\/ </Transformed>`);
            } else {
                exec.push(code.join("\n"));
            }
            //exec.push(`_emit(_, ${ JSON.stringify(type) });`);
        }
        exec.push(ExecFooter);

        //console.log("CODE", exec.join("\n"));

        const result: Array<{ type: ScriptLineType, line: string }> = [ ];

        // Setup the script context
        const contextObject: Record<string, any> = { console };
        const context = vm.createContext(contextObject);
        if (config.contextify) { config.contextify(context); }

        const script = new vm.Script(exec.join("\n"), { filename: "setup.js" });

        // Execute the example in a vm
        let emitted: ExecResult;
        try {
            emitted = await script.runInContext(context, { });
            //console.log("EMIT", emitted);
        } catch (error) {
            //console.log("ERROR", error);
            throw error;
        }

        for (const { type, value, sync } of emitted) {
            // Code was injected verbatim; commentify things
            if (type === "code") {
                for (const line of value.split("\n")) {
                    const type = line.trim().startsWith("/\/") ? "comment": "code";
                    result.push({ line, type });
                }
                continue;;
            }

            let output: string;
            if (type === "result") {
                output = inspect(value);

            } else {
                // Errors get pulled apart
                output = `Error(${ JSON.stringify(value.message.match(/(^([^(]*))/)[0].trim()) }`;
                const keys = Object.keys(value);
                if (keys.length !== 0) {
                    output += `, {\n`;
                    for (const key of keys) {
                       output += `  ${ key }: ${ JSON.stringify(value[key]) }\n`;
                    }
                    output += `}`;
                }
                output += `)`;
            }

            // If it was a promise, prefix it
            if (!sync) { output = `Promise<${ output }>`; }

            // Make it a comment
            for (let line of output.split("\n")) {
                line = "/\/ " + line;
                result.push({ line, type });
            }
        }

        return result;
    }


                /*
                code.forEach((line) => {
                    const type = line.trim().startsWith("/\/") ? "comment": "code";
                    result.push({ line, type });
                });
                const exec = await this.execute(setup + ";\n" + code.join("\n"), config);

                if (exec.type !== type) {
                    console.log("FOOBAR", { exec, type, code });
                    throw new Error(`expected mismatch: ${ type } !== ${ exec.type } ${ exec.value }`);
                }
                result.push({ line: exec.value, type: <ScriptLineType>type })
                */
/*
    async execute(code: string, config: Config): Promise<{ type: "error" | "result", value: string }> {

        // Setup the script context
        const contextObject: Record<string, any> = {
            console: console,
        };

        const context = vm.createContext(contextObject);
        if (config.contextify) { config.contextify(context); }

        const setup = new vm.Script(ExecSetup, { filename: "setup.js" });
        await setup.runInContext(context, { });

        console.log("CODE:", code);
        const transformed = babel.transform(code, {
            plugins: [ { visitor: Transformer } ]
        }).code;
        const exec = Exec.replace("<CODE>", transformed);
        console.log("EXEC:", exec);

        const script = new vm.Script(exec, {
            filename: (this.filename || "demo.js"),
        });

        let run: { sync: boolean, type: "error" | "result", value: any };
        try {
            run = await script.runInContext(context, { });
        } catch (error) {
            console.log("ERROR", error);
            throw error;
        }
        const { sync, type, value } = run;
        console.log("RESULT", { sync, type, value });

        let result: string;
        if (type === "result") {
            result = inspect(value);

        } else {
            // Errors get pulled apart
            result = `Error(${ JSON.stringify(value.message.match(/(^([^(]*))/)[0].trim()) }`;
            const keys = Object.keys(value);
            if (keys.length !== 0) {
                result += `, {\n`;
                for (const key of keys) {
                   result += `  ${ key }: ${ JSON.stringify(value[key]) }\n`;
                }
                result += `}`;
            }
            result += `)`;
        }

        // If it was a promise, prefix it
        if (!sync) { result = `Promise<${ result }>`; }

        // Make it a comment
        result = result.split("\n").map((l) => (`/\/ ${ l }`)).join("\n");

        return { type, value: result };
    }
    */
}
            /*

            let node;
            if (path.node.type === "MemberExpression") {
                node = babel.types.callExpression(callee, [ path.node, path.node.object ]);
            } else {
                node = babel.types.callExpression(callee, [ path.node ]);
            }
            path.replaceWith(node);
            */
