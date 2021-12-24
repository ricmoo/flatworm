"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Script = void 0;
const module_1 = __importDefault(require("module"));
const path_1 = require("path");
const vm_1 = __importDefault(require("vm"));
function hasPrefix(text, prefix) {
    return (text.substring(0, prefix.length) === prefix);
}
class EvalEmitter {
    constructor(code, inspect) {
        this.inspect = inspect;
        this.errorLineNo = 0;
        this.lastLineNo = 0;
        this.errorType = "ok";
        this.inBlock = false;
        this.lines = Object.freeze(code.split("\n"));
        this._output = [];
    }
    _fill(lineNo) {
        this.lines.slice(this.lastLineNo, lineNo).map((content) => {
            const classes = [];
            if (hasPrefix(content.trim(), "/\/")) {
                classes.push("comment");
            }
            this._output.push({ content, classes });
        });
    }
    emit(value, lineNo, type) {
        this._fill(lineNo);
        this.lastLineNo = lineNo + 1;
        if (type === "verbatim") {
            this._output.push({ content: value, classes: [] });
        }
        else {
            const classes = ["result", type];
            this.inspect(value).split("\n").forEach((line) => {
                this._output.push({ content: `/\/ ${line}`, classes: classes.slice() });
            });
        }
    }
    flush() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (new Promise((resolve) => {
                setTimeout(() => {
                    resolve(null);
                }, 10);
            }));
            this._fill(undefined);
            this.lastLineNo = this.lines.length;
            return this.output;
        });
    }
    get output() {
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
    get annotatedCode() {
        const lines = [];
        lines.push("(async function() {");
        lines.push("  let _ = undefined");
        this.lines.forEach((line, lineNo) => {
            if (hasPrefix(line, "/\/_hide:")) {
                lines.push(" " + line.substring(8));
            }
            else if (hasPrefix(line, "/\/_verbatim:")) {
                let output = line.substring(line.indexOf(":") + 1);
                lines.push(`  _emitter.emit(${output}, ${lineNo}, "verbatim");`);
            }
            else if (hasPrefix(line, "/\/_log:") || hasPrefix(line, "/\/_null:")) {
                let output = line.substring(line.indexOf(":") + 1);
                if (output.trim() == "") {
                    output = "_";
                }
                let cleanup = null;
                if (this.errorType === "error") {
                    lines.push("    throw new Error('__FAILED_TO_THROW__');");
                    lines.push("  } catch (_) {");
                    lines.push(`    if (_.message === '__FAILED_TO_THROW__') { const e = new Error('Error block at line ${lineNo} failed to throw as expected'); e._flatworm = true; throw e; }`);
                    cleanup = "  }";
                }
                else {
                    cleanup = "  ;";
                }
                if (hasPrefix(line, "/\/_log:")) {
                    lines.push(`  _emitter.emit(${output}, ${lineNo}, ${JSON.stringify(this.errorType)});`);
                }
                if (cleanup) {
                    lines.push(cleanup);
                }
                this.errorType = "ok";
                this.inBlock = false;
            }
            else if (hasPrefix(line, "/\/_result:")) {
                if (this.inBlock) {
                    throw new Error(`nesting _result: in a ${(this.errorType === "error") ? "_throws:" : "_result:"} not allowed`);
                }
                lines.push(`  ; _emitter.errorLineNo = ${lineNo}; _ =`);
                this.errorType = "ok";
                this.inBlock = true;
            }
            else if (hasPrefix(line, "/\/_throws:")) {
                if (this.inBlock) {
                    throw new Error(`nesting _throws: in a ${(this.errorType === "error") ? "_throws:" : "_result:"} not allowed`);
                }
                lines.push("  try {");
                this.errorType = "error";
                this.inBlock = true;
            }
            else if (hasPrefix(line, "/\/_")) {
                throw new Error(`invalid flatworm eval operation: ${line}`);
            }
            else {
                lines.push("  " + line);
            }
        });
        lines.push("  return _emitter.flush(); /* return the result */");
        lines.push("})()");
        return lines.join("\n");
    }
}
class Script {
    constructor(codeRoot, contextify) {
        this.codeRoot = codeRoot;
        this.contextify = contextify;
        this._require = module_1.default.createRequire((0, path_1.resolve)(codeRoot, "demo.js"));
        this.resetPageContext();
    }
    resetPageContext() {
        this._pageContext = {};
    }
    run(filename, code) {
        return __awaiter(this, void 0, void 0, function* () {
            filename = (0, path_1.resolve)(filename);
            const contextObject = {
                _inspect: function (result) {
                    if (result instanceof Error) {
                        return `Error: ${result.message}`;
                    }
                    return JSON.stringify(result);
                },
                console: console,
                require: this._require,
                _page: this._pageContext,
            };
            const context = vm_1.default.createContext(contextObject);
            if (this.contextify) {
                this.contextify(contextObject);
            }
            const _emitter = new EvalEmitter(code, contextObject._inspect);
            contextObject._emitter = _emitter;
            const compiled = _emitter.annotatedCode;
            // Debug; dump generated code
            //compiled.split("\n").forEach((line, index) => {
            //    console.log(`${ index }: ${ line }`);
            //});
            const script = new vm_1.default.Script(compiled, {
                filename: (filename || "demo.js")
            });
            try {
                return yield script.runInContext(context, {});
            }
            catch (e) {
                if (e._flatworm) {
                    delete e._flatworm;
                    throw e;
                }
                const error = new Error(`Result block at line ${_emitter.errorLineNo + 1} threw ${JSON.stringify(e.message)}`);
                error.error = e;
                throw error;
            }
        });
    }
    _runMethod(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const contextObject = {
                _inspect: function (result) {
                    if (result instanceof Error) {
                        return `Error: ${result.message}`;
                    }
                    return JSON.stringify(result);
                },
                console: console,
                require: this._require,
                _page: {}
            };
            if (this.contextify) {
                this.contextify(contextObject);
            }
            const method = contextObject[name];
            if (typeof (method) === "function") {
                yield method();
            }
        });
    }
    startup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._runMethod("_startup");
        });
    }
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._runMethod("_shutdown");
        });
    }
}
exports.Script = Script;
