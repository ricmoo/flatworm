"use strict";

import fs from "fs";
const { createRequireFromPath } = require('module')
import { resolve } from "path";
const vm = require("vm");

export type ConfigLink = Readonly<{ name: string, url: string }>;

export class Config {
    readonly externalLinks: Readonly<{ [ name: string ]: ConfigLink }>;
    readonly _getSourceUrl: (key: string) => string;

    constructor(config: any) {
        const links: { [ name: string ]: ConfigLink } = { };
        if (config.externalLinks) {
            Object.keys(config.externalLinks).forEach((key) => {
                const url = config.externalLinks[key]
                if (typeof(url) === "string") {
                    links[key] = Object.freeze({ name: url, source: "config.js", url: url });
                } else if (typeof(url.url) === "string" && typeof(url.name) === "string") {
                    links[key] = Object.freeze({ name: url.name, source: "config.js", url: url.url });
                } else {
                    throw new Error("invalid external link");
                }
            });
        }
        this.externalLinks = Object.freeze(links);

        if (config.getSourceUrl) {
            this._getSourceUrl = config.getSourceUrl;
        }


    }

    getSourceUrl(key: string, value: string): string {
        // For a fragment styled like:
        // - _property: foo.bar(test) @SRC<somefile:somekey>
        //   => key=somefile:somekey
        // - _property: foo.bar(test) => anything @SRC<somefile>
        //   => key=somefile:bar
        // - _property: foo.bar => anything @SRC<somefile>
        //   => key=somefile:bar

        if (this._getSourceUrl) {
            // No property given in the key, try to extract it from the value
            if (key.indexOf(":") === -1) {
                value = value.split("=>")[0].trim();
                if (value.indexOf("(" /* Fix: ) */) >= 0) {
                    value = value.match(/([a-z0-9_$]+)\s*\(/i /* Fix: \) */)[1];
                } else {
                    value = value.split(".").pop().trim();
                }

                key += ":" + value;
            }

            return this._getSourceUrl(key);
        }

        throw new Error("missing config.getSourceUrl");
    }

    static fromRoot(path: string): Config {
        if (!fs.existsSync(path) || !fs.statSync(path).isDirectory()) {
            throw new Error("invalid config root: " + JSON.stringify(path));
        }

        // Try loading a JavaScript config
        {
            const configPath = resolve(path, "./config.js");
            if (fs.existsSync(configPath)) {
                return Config.fromScript(configPath);
            }
        }

        // Try loading a JSON config
        {
            const configPath = resolve(path, "./config.json");
            if (fs.existsSync(configPath)) {
                return Config.fromJson(configPath);
            }
        }

        return new Config({ });
    }

    static fromScript(path: string): Config {
        const injected = { exports: { } };
        const context = vm.createContext({
            console: console,
            __dirname: resolve(path),
            __filename: path,
            module: injected,
            exports: injected.exports,
            require: createRequireFromPath(path)
        });

        const script = new vm.Script(fs.readFileSync(path).toString(), { filename: "config.js" });
        script.runInContext(context);

        return new Config(injected.exports);
    }

    static fromJson(path: string): Config {
        return new Config(JSON.parse(fs.readFileSync(path).toString()));
    }
}
