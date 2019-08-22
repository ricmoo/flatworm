#!/usr/bin/env node
"use strict";

const { Context } = require("../index");

const { version } = require("../package.json");

function showUsage() {
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

function parseOpts(argv, Flags, Options) {
    Options = Options.slice();
    Options.unshift("");

    const args = [ ];
    const flags = { };
    const options = { };

    for (let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        if (arg.substring(0, 2) === "--") {
            let key = arg.substring(2);
            if (Options.indexOf(key) !== -1) {
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
            } else if (Flags.indexOf(key) !== -1) {
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
            const nodes = Context.fromFolder(opts.args[0]);
            await nodes.render(opts.args[1], opts.flags);
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
