#!/usr/bin/env node

"use strict";

import fs from "fs";
import { dirname, resolve } from "path";

import { Config } from "./config";
import { Document } from "./document";
import { renderDocument as renderHtml } from "./renderer-html";
import { Script } from "./scripts";

const { version } = require("../package.json");

function showUsage(): void {
    console.log("Usage:");
    console.log("  flatworm [ OPTIONS ] SRC_FOLDER DST_FOLDER");
    console.log("");
    console.log("Options");
    console.log("  --skip-eval       Do not execute JavaScript");
    console.log("  --force           Allow overwriting files");
    console.log("  --help            Show help");
    console.log("  --version         Show version");
    console.log("");
}

type Flags = { [ flag: string ]: boolean };
type Options = { [ options: string ]: string };
type Opts = {
    flags: Flags,
    options: Options,
    args: Array<string>
};

function parseOpts(argv: Array<string>, validFlags: Array<string>, validOptions: Array<string>): Opts {
    validOptions = validOptions.slice();
    validOptions.unshift("");

    const args: Array<string> = [ ];
    const flags: Flags = { };
    const options: Options = { };

    for (let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        if (arg.substring(0, 2) === "--") {
            let key = arg.substring(2);
            if (validOptions.indexOf(key) !== -1) {
                i++;
                const value = argv[i];
                if (value == null) {
                    if (key === "") { throw new Error("missing argument after --"); }
                    throw new Error("missing option value: " + arg);
                }
                if (key === "") {
                    args.push(value);
                } else {
                    options[key.replace(/-/g, "")] = value;
                }
            } else if (validFlags.indexOf(key) !== -1) {
                flags[key.replace(/-/g, "")] = true;
            } else {
                throw new Error("unknown option: " + arg);
            }
        } else {
            args.push(arg);
        }
    }

    return {
        flags: flags,
        options: options,
        args: args
    };
}

(async function() {
    let debug = false;
    try {
        let opts = parseOpts(process.argv.slice(2), [ "debug", "force", "help", "skip-eval", "version" ], [ ]);
        debug = opts.flags.debug;

        if (opts.flags.version) {
            console.log("flatworm/" + version);
        } else if (opts.flags.help) {
            showUsage();
        } else {
            if (opts.args.length !== 2) {
                throw new Error("Requires exactly SRC_FOLDER DST_FOLDER");
            }
            const src = opts.args[0];
            const dst = opts.args[1];

            const options = {
                skipEval: !!opts.flags.skipeval
            };

            const config = Config.fromRoot(src);
            const document = Document.fromFolder(src, config);
            //console.log(document);

            if (!opts.flags.skipeval) {
                const script = new Script(config.codeRoot ? resolve(src, config.codeRoot): src);
                await document.evaluate(script);
            }

            const files = renderHtml(document, options);
            files.forEach((file) => {
                const filename = resolve(dst, file.filename);
                fs.mkdirSync(dirname(filename), { recursive: true });
                fs.writeFileSync(filename, file.content);
                console.log(filename);
            });
        }
    } catch (error) {
        showUsage();
        console.log("Error: " + error.message);
        if (debug) {
            console.log("");
            console.log(error);
        }
        console.log("");
    }
})();
