"use strict";

import _module from "module";
import { resolve } from "path";
import vm from "vm";

function hasPrefix(text: string, prefix: string): boolean {
    return (text.substring(0, prefix.length) === prefix);
}

export type Line = {
    classes: Array<string>,
    content: string
};

class EvalEmitter {
    errorLineNo: number;
    private lastLineNo: number;
    private errorType: string;
    private inBlock: boolean;

    readonly lines: ReadonlyArray<string>;

    private readonly _output: Array<Line>;

    readonly inspect: (value: any) => string;

    constructor(code: string, inspect: (value: any) => string) {
        this.inspect = inspect;

        this.errorLineNo = 0;
        this.lastLineNo = 0;
        this.errorType = "ok";
        this.inBlock = false;

        this.lines = Object.freeze(code.split("\n"));

        this._output = [ ];
    }

    _fill(lineNo: number): void {
        this.lines.slice(this.lastLineNo, lineNo).map((content) => {
            const classes = [ ];
            if (hasPrefix(content.trim(), "/\/")) { classes.push("comment"); }
            this._output.push({ content, classes });
        });
    }

    emit(value: any, lineNo: number, type: string): void {
        this._fill(lineNo)
        this.lastLineNo = lineNo + 1;
        if (type === "verbatim") {
            this._output.push({ content: value, classes: [ ] });
        } else {
            const classes = [ "result", type ];
            this.inspect(value).split("\n").forEach((line) => {
                this._output.push({ content: `/\/ ${ line }`, classes: classes.slice() });
            });
        }
    }

    async flush(): Promise<Array<Line>> {
        await (new Promise((resolve) => {
            setTimeout(() => {
                resolve(null);
            }, 10);
        }));
        this._fill(undefined);
        this.lastLineNo = this.lines.length;
        return this.output;
    }

    get output(): Array<Line> {
        if (this.lastLineNo !== this.lines.length) {
            throw new Error("not fully executed");
        }

        const output = this._output.filter((line) => (!hasPrefix(line.content, "/\/_")));

        while (output.length > 0 && output[0].content.trim() === "") {
            output.splice(0, 1);
        }

        while (output.length > 0 && output[output.length - 1].content.trim() === "") {
            output.splice(output.length - 1, 1);
        }

        return output;
    }

    get annotatedCode(): string {
        const lines = [ ];
        lines.push("(async function() {");
        lines.push("  let _ = undefined");

        this.lines.forEach((line, lineNo) => {
            if (hasPrefix(line, "/\/_hide:")) {
                lines.push(" " + line.substring(8));

            } else if (hasPrefix(line, "/\/_verbatim:")) {
                let output = line.substring(line.indexOf(":") + 1);
                lines.push(`  _emitter.emit(${ output }, ${ lineNo }, "verbatim");`)

            } else if (hasPrefix(line, "/\/_log:") || hasPrefix(line, "/\/_null:")) {
                let output = line.substring(line.indexOf(":") + 1);
                if (output.trim() == "") { output = "_"; }

                let cleanup = null;
                if (this.errorType === "error") {
                    lines.push("    throw new Error('__FAILED_TO_THROW__');");
                    lines.push("  } catch (_) {");
                    lines.push(`    if (_.message === '__FAILED_TO_THROW__') { const e = new Error('Error block at line ${ lineNo } failed to throw as expected'); e._flatworm = true; throw e; }`);
                    cleanup = "  }";
                } else {
                    cleanup = "  ;";
                }

                if (hasPrefix(line, "/\/_log:")) {
                    lines.push(`  _emitter.emit(${ output }, ${ lineNo }, ${ JSON.stringify(this.errorType) });`)
                }
                if (cleanup) { lines.push(cleanup); }

                this.errorType = "ok";
                this.inBlock = false;

            } else if (hasPrefix(line, "/\/_result:")) {
                if (this.inBlock) {
                    throw new Error(`nesting _result: in a ${ (this.errorType === "error") ? "_throws:": "_result:" } not allowed`);
                }
                lines.push(`  ; _emitter.errorLineNo = ${ lineNo }; _ =`);
                this.errorType = "ok";
                this.inBlock = true;

            } else if (hasPrefix(line, "/\/_throws:")) {
                if (this.inBlock) {
                    throw new Error(`nesting _throws: in a ${ (this.errorType === "error") ? "_throws:": "_result:" } not allowed`);
                }
                lines.push("  try {");
                this.errorType = "error";
                this.inBlock = true;

            } else if (hasPrefix(line, "/\/_")) {
                throw new Error(`invalid flatworm eval operation: ${ line }`);

            } else {
                lines.push("  " + line);
            }
        });

        lines.push("  return _emitter.flush(); /* return the result */");
        lines.push("})()");
        return lines.join("\n")
    }
}

export class Script {
    readonly codeRoot: string;
    readonly contextify: (context: any) => void;

    readonly _require: (name: string) => any;

    private _pageContext: Record<string, any>;

    constructor(codeRoot: string, contextify?: (context: any) => void) {
        this.codeRoot = codeRoot;
        this.contextify = contextify;
        this._require = _module.createRequire(resolve(codeRoot, "demo.js"))

        this.resetPageContext();
    }

    resetPageContext(): void {
        this._pageContext = { };
    }

    async run(filename: string, code: string): Promise<Array<Line>> {
        filename = resolve(filename);

        const contextObject: Record<string, any> = {
            _inspect: function(result: any) {
                if (result instanceof Error) {
                    return `Error: ${ result.message }`;
                }
                return JSON.stringify(result);
            },
            console: console,
            require: this._require,
            _page: this._pageContext,
        };

        const context = vm.createContext(contextObject);
        if (this.contextify) { this.contextify(contextObject); }

        const _emitter = new EvalEmitter(code, contextObject._inspect);
        contextObject._emitter = _emitter;

        const compiled = _emitter.annotatedCode;

        // Debug; dump generated code
        //compiled.split("\n").forEach((line, index) => {
        //    console.log(`${ index }: ${ line }`);
        //});

        const script = new vm.Script(compiled, {
            filename: (filename || "demo.js")
        });

        try {
            return await script.runInContext(context, { });
        } catch (e) {
            if (e._flatworm) {
                delete e._flatworm;
                throw e;
            }

            const error: any = new Error(`Result block at line ${ _emitter.errorLineNo + 1} threw ${ JSON.stringify(e.message) }`);
            error.error = e;
            throw error;
        }
    }

    async _runMethod(name: string): Promise<void> {
        const contextObject: Record<string, any> = {
            _inspect: function(result: any) {
                if (result instanceof Error) {
                    return `Error: ${ result.message }`;
                }
                return JSON.stringify(result);
            },
            console: console,
            require: this._require,
            _page: { }
        };

        if (this.contextify) { this.contextify(contextObject); }

        const method: any = contextObject[name];

        if (typeof(method) === "function") { await method(); }
    }

    async startup(): Promise<void> {
        await this._runMethod("_startup");
    }

    async shutdown(): Promise<void> {
        await this._runMethod("_shutdown");
    }
}

