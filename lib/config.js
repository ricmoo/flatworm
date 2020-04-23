"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const { createRequireFromPath } = require('module');
const path_1 = require("path");
const vm = require("vm");
class Config {
    constructor(config) {
        const links = {};
        if (config.externalLinks) {
            Object.keys(config.externalLinks).forEach((key) => {
                const url = config.externalLinks[key];
                if (typeof (url) === "string") {
                    links[key] = Object.freeze({ name: url, source: "config.js", url: url });
                }
                else if (typeof (url.url) === "string" && typeof (url.name) === "string") {
                    links[key] = Object.freeze({ name: url.name, source: "config.js", url: url.url });
                }
                else {
                    throw new Error("invalid external link");
                }
            });
        }
        this.externalLinks = Object.freeze(links);
        this._getSourceUrl = config.getSourceUrl || null;
        this.title = config.title || "Documentation";
        this.subtitle = config.subtitle || "";
        this.logo = config.logo || "";
        this.link = config.link || null;
        this.copyright = config.copyright || `Copyright &copy;${(new Date()).getFullYear()}. All rights reserved`;
        this.codeRoot = config.codeRoot || null;
        this.codeContextify = config.codeContextify || (() => { });
        const markdown = {};
        if (config.markdown) {
            markdown.banner = (config.markdown.banner || null);
        }
        this.markdown = markdown;
    }
    getSourceUrl(key, value) {
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
                }
                else {
                    value = value.split(".").pop().trim();
                }
                key += ":" + value;
            }
            return this._getSourceUrl(key);
        }
        throw new Error("missing config.getSourceUrl");
    }
    static fromRoot(path) {
        if (!fs_1.default.existsSync(path) || !fs_1.default.statSync(path).isDirectory()) {
            throw new Error("invalid config root: " + JSON.stringify(path));
        }
        // Try loading a JavaScript config
        {
            const configPath = path_1.resolve(path, "./config.js");
            if (fs_1.default.existsSync(configPath)) {
                return Config.fromScript(configPath);
            }
        }
        // Try loading a JSON config
        {
            const configPath = path_1.resolve(path, "./config.json");
            if (fs_1.default.existsSync(configPath)) {
                return Config.fromJson(configPath);
            }
        }
        return new Config({});
    }
    static fromScript(path) {
        path = path_1.resolve(path);
        const injected = { exports: {} };
        const context = vm.createContext({
            console: console,
            __dirname: path_1.dirname(path),
            __filename: path,
            module: injected,
            exports: injected.exports,
            require: createRequireFromPath(path)
        });
        const script = new vm.Script(fs_1.default.readFileSync(path).toString(), { filename: "config.js" });
        script.runInContext(context);
        return new Config(injected.exports);
    }
    static fromJson(path) {
        return new Config(JSON.parse(fs_1.default.readFileSync(path).toString()));
    }
}
exports.Config = Config;
