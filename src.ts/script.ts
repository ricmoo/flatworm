"use strict";

import _module from "module";
import { resolve } from "path";
import vm from "vm";

async function runContext(filename: string, context: any, code: string, needsAsync?: string): Promise<string> {
    let promise = false;

    if (needsAsync) {
        code = `(async function() { ${ code }; return ${ needsAsync }; })()`;
    }

    const script = new vm.Script(code, { filename: filename });
    let result = script.runInContext(context, { timeout: 5000 });
    if (result && result.then) {
        result = await result;
        promise = true;
    }
    context._ = result;

    if (needsAsync) {
        promise = false;
        context[needsAsync] = result;
    }

    result = (new vm.Script("_inspect(_)", { filename: filename })).runInContext(context);

    if (promise) { result = `{ Promise: ${ result } }`; }
    return result;
}

export type Line = {
    classes: Array<string>,
    content: string
};

export class Script {
    readonly codeRoot: string;
    readonly contextify: (context: any) => void;

    readonly _require: (name: string) => any;

    constructor(codeRoot: string, contextify?: (context: any) => void) {
        this.codeRoot = codeRoot;
        this.contextify = contextify;
        this._require = _module.createRequireFromPath(resolve(codeRoot, "demo.js"))
    }

    async run(filename: string, code: string): Promise<Array<Line>> {
        filename = resolve(filename);

        const lines = code.split("\n");

        const contextObject = {
            _inspect: function(result: any) { return JSON.stringify(result); },
            console: console,
            require: this._require
        };

        const context = vm.createContext(contextObject);
        if (this.contextify) { this.contextify(contextObject); }

        const output: Array<Line> = [ ];
        let script: Array<string> = [ ];
        let showing = true;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            let stripped = line.replace(/\s/, "");
            if (stripped.indexOf("//<hide>") === 0) {
                showing = false;
                continue;
            } else if (stripped.indexOf("//</hide>") === 0) {
                showing = true;
                continue;
            }

            if (line.trim().substring(0, 3) === "//!") {
                let padding = line.substring(0, line.indexOf("/"));
                try {
                    const needsAsync = line.match(/^\s*\/\/!\s*async\s+(.*)$/);
                    const result = await runContext(filename, context, script.join("\n"), (needsAsync ? needsAsync[1]: null));
                    if (showing) {
                        result.split("\n").forEach((line) => {
                            output.push({ classes: [ "result", "ok" ], content: `${ padding }// ${ line }` });
                        });
                    }
                    if (line.replace(/\s/g, "") === "/\/!error") { throw new Error("expected an Error"); }
                } catch (error) {
                    if (line.replace(/\s/g, "") !== "/\/!error") { throw error; }
                    if (showing) {
                        output.push({ classes: [ "result", "error" ], content: `${ padding }// Error: ${ error.message }` });
                    }
                }
                script = [ ];
            } else {
                script.push(line);

                if (showing) {
                    let classes = [ ];
                    if (line.replace(/\s/g, "").match(/^\/\/[^<]/)) {
                        classes.push("comment");
                    }
                    output.push({ classes: classes, content: line });
                }
            }
        }

        if (lines.length) {
            await runContext(filename, context, script.join("\n"));
        }

        // Trim off leading empty lines
        while (output.length) {
            if (output[0].content.trim() !== "") { break; }
            output.splice(0, 1);
        }

        // Trim off trailing empty lines
        while (output.length) {
            if (output[output.length - 1].content.trim() !== "") { break; }
            output.splice(output.length - 1, 1);
        }

        return output;
    }
}

