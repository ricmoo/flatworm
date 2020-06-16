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
const module_1 = __importDefault(require("module"));
const path_1 = require("path");
const vm_1 = __importDefault(require("vm"));
function runContext(filename, context, code, needsAsync) {
    return __awaiter(this, void 0, void 0, function* () {
        let promise = false;
        if (needsAsync) {
            code = `(async function() { ${code}; return ${needsAsync}; })()`;
        }
        const script = new vm_1.default.Script(code, { filename: filename });
        let result = script.runInContext(context, { timeout: 5000 });
        if (result && result.then) {
            result = yield result;
            promise = true;
        }
        context._ = result;
        if (needsAsync) {
            promise = false;
            context[needsAsync] = result;
        }
        result = (new vm_1.default.Script("_inspect(_)", { filename: filename })).runInContext(context);
        if (promise) {
            result = `{ Promise: ${result} }`;
        }
        return result;
    });
}
class Script {
    constructor(codeRoot, contextify) {
        this.codeRoot = codeRoot;
        this.contextify = contextify;
        this._require = module_1.default.createRequireFromPath(path_1.resolve(codeRoot, "demo.js"));
    }
    run(filename, code) {
        return __awaiter(this, void 0, void 0, function* () {
            filename = path_1.resolve(filename);
            const lines = code.split("\n");
            const contextObject = {
                _inspect: function (result) { return JSON.stringify(result); },
                console: console,
                require: this._require
            };
            const context = vm_1.default.createContext(contextObject);
            if (this.contextify) {
                this.contextify(contextObject);
            }
            const output = [];
            let script = [];
            let showing = true;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                let stripped = line.replace(/\s/, "");
                if (stripped.indexOf("//<hide>") === 0) {
                    showing = false;
                    continue;
                }
                else if (stripped.indexOf("//</hide>") === 0) {
                    showing = true;
                    continue;
                }
                if (line.trim().substring(0, 3) === "//!") {
                    let padding = line.substring(0, line.indexOf("/"));
                    try {
                        const needsAsync = line.match(/^\s*\/\/!\s*async\s+(.*)$/);
                        const result = yield runContext(filename, context, script.join("\n"), (needsAsync ? needsAsync[1] : null));
                        if (showing) {
                            result.split("\n").forEach((line) => {
                                output.push({ classes: ["result", "ok"], content: `${padding}// ${line}` });
                            });
                        }
                        if (line.replace(/\s/g, "") === "/\/!error") {
                            throw new Error("expected an Error");
                        }
                    }
                    catch (error) {
                        if (line.replace(/\s/g, "") !== "/\/!error") {
                            throw error;
                        }
                        if (showing) {
                            output.push({ classes: ["result", "error"], content: `${padding}// Error: ${error.message}` });
                        }
                    }
                    script = [];
                }
                else {
                    script.push(line);
                    if (showing) {
                        let classes = [];
                        if (line.replace(/\s/g, "").match(/^\/\/[^<]/)) {
                            classes.push("comment");
                        }
                        output.push({ classes: classes, content: line });
                    }
                }
            }
            if (lines.length) {
                yield runContext(filename, context, script.join("\n"));
            }
            // Trim off leading empty lines
            while (output.length) {
                if (output[0].content.trim() !== "") {
                    break;
                }
                output.splice(0, 1);
            }
            // Trim off trailing empty lines
            while (output.length) {
                if (output[output.length - 1].content.trim() !== "") {
                    break;
                }
                output.splice(output.length - 1, 1);
            }
            return output;
        });
    }
}
exports.Script = Script;
