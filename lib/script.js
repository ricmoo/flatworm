var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Script_instances, _Script_lines, _Script_result, _Script_execute;
import babel from "@babel/core";
import { inspect } from "util";
import vm from "vm";
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
function execTransform(code, type) {
    let count = 0;
    let foundCount = -1;
    const id = (name) => babel.types.identifier(name);
    //const str = (value: string) => babel.types.stringLiteral(value);
    const call = (name, ...args) => babel.types.callExpression(id(name), args);
    //const stmnt = (expr: babel.types.Expression) => babel.types.expressionStatement(expr);
    const TransformWrap = {
        exit(path) {
            count++;
            if (foundCount >= 0) {
                if (count == foundCount) {
                    path.skip();
                    // The call with the result is only called on non-error
                    let node;
                    // Add a try...catch to things we expect to throw
                    if (type === "error") {
                        const block = babel.types.blockStatement([
                            babel.types.returnStatement(path.node) //call("_emit", path.node, str()))
                        ]);
                        const arrow = babel.types.arrowFunctionExpression([], block);
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
                    }
                    else {
                        node = call("_emitResult", path.node);
                        ;
                        //                        node = babel.types.awaitExpression(node);
                    }
                    path.replaceWith(babel.types.awaitExpression(node));
                }
            }
        }
    };
    // First time through, we just count the number of expressions
    babel.transformSync(code, {
        plugins: [{ visitor: { Expression: TransformWrap } }]
    });
    foundCount = count;
    count = 0;
    const transformed = babel.transformSync(code, {
        plugins: [{ visitor: { Expression: TransformWrap } }]
    }).code;
    return transformed;
}
export class Script {
    //#context: null | any;
    constructor(source, language, filename, lineOffset) {
        _Script_instances.add(this);
        _Script_lines.set(this, void 0);
        _Script_result.set(this, void 0);
        this.language = language;
        this.filename = filename || "%unknown%";
        this.lineOffset = (lineOffset != null) ? lineOffset : 0;
        const lines = source.split("\n");
        // Remove all leading and trailing new lines
        while (lines.length && !lines[0].trim()) {
            lines.shift();
        }
        while (lines.length && !lines[lines.length - 1].trim()) {
            lines.pop();
        }
        // Remove common leading whitespace from each line
        let spaces = lines.reduce((accum, line) => {
            if (line.trim() === "") {
                return accum;
            }
            const spaces = line.match(/^(\s*)/)[1].length;
            if (accum == -1 || spaces < accum) {
                return spaces;
            }
            return accum;
        }, -1);
        __classPrivateFieldSet(this, _Script_lines, lines.map((l) => l.substring(spaces)), "f");
        __classPrivateFieldSet(this, _Script_result, null, "f");
    }
    get source() { return __classPrivateFieldGet(this, _Script_lines, "f").join("\n"); }
    isEvaluated() { return __classPrivateFieldGet(this, _Script_result, "f") != null; }
    evaluate(config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isEvaluated()) {
                return;
            }
            const result = [];
            if (this.language === "javascript") {
                for (const { type, line } of yield __classPrivateFieldGet(this, _Script_instances, "m", _Script_execute).call(this, config)) {
                    result.push({ line, type });
                }
            }
            else if (this.language === "script" || this.language === "solidity") {
                for (const line of __classPrivateFieldGet(this, _Script_lines, "f")) {
                    if (line.trim().match(/^\/\/_(hide|result|error):/)) {
                        continue;
                    }
                    const type = line.trim().startsWith("/\/") ? "comment" : "code";
                    result.push({ line, type });
                }
                // Strip any leading and trailing empty lines
                while (result.length && !result[0].line.trim()) {
                    result.shift();
                }
                while (result.length && !result[result.length - 1].line.trim()) {
                    result.pop();
                }
            }
            else if (this.language === "shell") {
                for (const line of __classPrivateFieldGet(this, _Script_lines, "f")) {
                    const type = line.trim().startsWith("#") ? "comment" : "code";
                    result.push({ line, type });
                }
            }
            else {
                for (const line of __classPrivateFieldGet(this, _Script_lines, "f")) {
                    result.push({ line, type: "unknown" });
                }
            }
            __classPrivateFieldSet(this, _Script_result, result, "f");
        });
    }
    forEach(func) {
        if (__classPrivateFieldGet(this, _Script_result, "f") != null) {
            __classPrivateFieldGet(this, _Script_result, "f").forEach(({ line, type }, index) => {
                func({ line, type, lineNo: index });
            });
            return;
        }
        __classPrivateFieldGet(this, _Script_lines, "f").forEach((line, index) => {
            func({ line, type: "unknown", lineNo: index });
        });
    }
}
_Script_lines = new WeakMap(), _Script_result = new WeakMap(), _Script_instances = new WeakSet(), _Script_execute = function _Script_execute(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const clumps = [];
        {
            let code = [];
            for (let line of __classPrivateFieldGet(this, _Script_lines, "f")) {
                if (line.trim().startsWith("/\/_")) {
                    line = line.trim();
                    const colon = line.indexOf(":");
                    const type = line.substring(3, colon);
                    switch (type) {
                        case "hide": {
                            const hidden = line.substring(colon + 1).trim();
                            if (hidden) {
                                clumps.push({ code: [hidden], type: "hide" });
                            }
                            break;
                        }
                        case "result":
                        case "error":
                            clumps.push({ code, type });
                            break;
                        default:
                            throw new Error(`unknown tag: ${type}`);
                    }
                    code = [];
                }
                else {
                    if (clumps.length && clumps[clumps.length - 1].type === "hide") {
                        if (line.trim() === "") {
                            continue;
                        }
                    }
                    code.push(line);
                }
            }
            if (code.join("").trim()) {
                clumps.push({ code, type: "code" });
            }
        }
        const exec = [];
        exec.push(ExecHeader);
        for (const { code, type } of clumps) {
            if (type !== "hide") {
                exec.push(`_emit(${JSON.stringify(code.join("\n"))}, "code");`);
            }
            if (type === "error" || type === "result") {
                exec.push(`/\/ <Transformed>`);
                exec.push(execTransform(code.join("\n"), type) + ";");
                exec.push(`/\/ </Transformed>`);
            }
            else {
                exec.push(code.join("\n"));
            }
            //exec.push(`_emit(_, ${ JSON.stringify(type) });`);
        }
        exec.push(ExecFooter);
        //console.log("CODE", exec.join("\n"));
        const result = [];
        // Setup the script context
        const contextObject = { console };
        const context = vm.createContext(contextObject);
        if (config.contextify) {
            config.contextify(context);
        }
        const script = new vm.Script(exec.join("\n"), { filename: "setup.js" });
        // Execute the example in a vm
        let emitted;
        try {
            emitted = yield script.runInContext(context, {});
            //console.log("EMIT", emitted);
        }
        catch (error) {
            //console.log("ERROR", error);
            throw error;
        }
        for (const { type, value, sync } of emitted) {
            // Code was injected verbatim; commentify things
            if (type === "code") {
                for (const line of value.split("\n")) {
                    const type = line.trim().startsWith("/\/") ? "comment" : "code";
                    result.push({ line, type });
                }
                continue;
                ;
            }
            let output;
            if (type === "result") {
                output = inspect(value, { sorted: true });
            }
            else {
                // Errors get pulled apart
                output = `Error(${JSON.stringify(value.message.match(/(^([^(]*))/)[0].trim())}`;
                const keys = Object.keys(value);
                if (keys.length !== 0) {
                    output += `, {\n`;
                    for (const key of keys) {
                        output += `  ${key}: ${JSON.stringify(value[key])}\n`;
                    }
                    output += `}`;
                }
                output += `)`;
            }
            // If it was a promise, prefix it
            if (!sync) {
                output = `Promise<${output}>`;
            }
            // Make it a comment
            for (let line of output.split("\n")) {
                line = "/\/ " + line;
                result.push({ line, type });
            }
        }
        return result;
    });
};
//# sourceMappingURL=script.js.map