#!/usr/bin/env node
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
import fs from "fs";
import { dirname, resolve } from "path";
import { Config } from "./config";
import { Document } from "./document";
import { HtmlRenderer, SinglePageHtmlRenderer } from "./renderer-html";
import { MetadataRenderer } from "./renderer-metadata";
import { SearchRenderer } from "./renderer-search";
import { MarkdownRenderer } from "./renderer-markdown";
import { Script } from "./script";
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
function parseOpts(argv, validFlags, validOptions) {
    validOptions = validOptions.slice();
    validOptions.unshift("");
    const args = [];
    const flags = {};
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        if (arg.substring(0, 2) === "--") {
            let key = arg.substring(2);
            if (validOptions.indexOf(key) !== -1) {
                i++;
                const value = argv[i];
                if (value == null) {
                    if (key === "") {
                        throw new Error("missing argument after --");
                    }
                    throw new Error("missing option value: " + arg);
                }
                if (key === "") {
                    args.push(value);
                }
                else {
                    options[key.replace(/-/g, "")] = value;
                }
            }
            else if (validFlags.indexOf(key) !== -1) {
                flags[key.replace(/-/g, "")] = true;
            }
            else {
                throw new Error("unknown option: " + arg);
            }
        }
        else {
            args.push(arg);
        }
    }
    return {
        flags: flags,
        options: options,
        args: args
    };
}
(function () {
    return __awaiter(this, void 0, void 0, function* () {
        let debug = false;
        try {
            let opts = parseOpts(process.argv.slice(2), ["debug", "force", "help", "skip-eval", "version"], []);
            debug = opts.flags.debug;
            if (opts.flags.version) {
                console.log("flatworm/" + version);
            }
            else if (opts.flags.help) {
                showUsage();
            }
            else {
                if (opts.args.length !== 2) {
                    throw new Error("Requires exactly SRC_FOLDER DST_FOLDER");
                }
                const src = opts.args[0];
                const dst = opts.args[1];
                const config = Config.fromRoot(src);
                const document = Document.fromFolder(src, config);
                if (!opts.flags.skipeval) {
                    const script = new Script(config.codeRoot ? resolve(src, config.codeRoot) : src, config.codeContextify || null);
                    yield script.startup();
                    yield document.evaluate(script);
                    yield script.shutdown();
                }
                const renderers = [
                    new HtmlRenderer(),
                    new MarkdownRenderer(),
                    new SinglePageHtmlRenderer("single-page/index.html"),
                    new MetadataRenderer(),
                    new SearchRenderer()
                ];
                renderers.forEach((renderer) => {
                    const files = renderer.renderDocument(document);
                    files.forEach((file) => {
                        const filename = resolve(dst, file.filename);
                        fs.mkdirSync(dirname(filename), { recursive: true });
                        fs.writeFileSync(filename, file.content);
                        console.log(filename);
                    });
                });
            }
        }
        catch (error) {
            showUsage();
            console.log("Error: " + error.message);
            if (debug) {
                console.log("");
                console.log(error);
            }
            console.log("");
        }
    });
})();
//# sourceMappingURL=cli.js.map