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
var _Config_instances, _Config_getTimestamp, _Config_addLinks;
import fs from "fs";
import { dirname, extname, resolve } from "path";
export class Config {
    constructor(root, config) {
        _Config_instances.add(this);
        _Config_getTimestamp.set(this, void 0);
        this.root = dirname(root);
        this.title = config.title || "no title";
        this.subtitle = config.subtitle || "no subtitle";
        let prefix = config.prefix || "";
        while (prefix.startsWith("/")) {
            prefix = prefix.substring(1);
        }
        while (prefix.endsWith("/")) {
            prefix = prefix.substring(0, prefix.length - 1);
        }
        this.prefix = `/${prefix}`;
        this.srcBaseUrl = config.srcBaseUrl || null;
        this.staticFiles = (config.staticFiles || []);
        this.docRoot = this.resolve(config.docRoot || ".");
        this.codeRoot = this.resolve(config.codeRoot || "..");
        __classPrivateFieldSet(this, _Config_getTimestamp, config.getTimestamp || null, "f");
        if (typeof (config.contextify) === "function") {
            this.contextify = config.contextify;
        }
        else {
            this.contextify = function (context) { };
        }
        this.links = new Map();
        for (const linkFile of config.links) {
            if (typeof (linkFile) === "string") {
                console.log(`Adding links: ${linkFile}`);
                const lines = fs.readFileSync(this.resolve(linkFile)).toString().split("\n");
                __classPrivateFieldGet(this, _Config_instances, "m", _Config_addLinks).call(this, lines, linkFile);
            }
            else if (typeof (linkFile) === "function") {
                console.log(`Adding links: callback()`);
                const lines = linkFile();
                __classPrivateFieldGet(this, _Config_instances, "m", _Config_addLinks).call(this, lines, "config.js");
            }
        }
    }
    getTimestamp(path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (__classPrivateFieldGet(this, _Config_getTimestamp, "f")) {
                return yield __classPrivateFieldGet(this, _Config_getTimestamp, "f").call(this, path);
            }
            const stat = fs.statSync(path, { throwIfNoEntry: false });
            if (stat) {
                return stat.mtimeMs;
            }
            return null;
        });
    }
    resolve(...args) {
        return resolve(this.root, ...args);
    }
    resolveDoc(...args) {
        return resolve(this.root, this.docRoot, ...args);
    }
    resolveCode(...args) {
        return resolve(this.root, dirname(this.codeRoot), ...args);
    }
    static fromScript(path) {
        return __awaiter(this, void 0, void 0, function* () {
            path = resolve(path);
            let value = yield import(path);
            if ("default" in value) {
                value = value["default"];
            }
            return new Config(path, value);
        });
    }
    static fromJson(path, json) {
        return new Config(path, JSON.parse(json));
    }
    static fromPath(path) {
        return __awaiter(this, void 0, void 0, function* () {
            const stat = fs.statSync(path);
            if (stat.isDirectory()) {
                for (const _filename of ["config.js", "config.json"]) {
                    const filename = resolve(path, _filename);
                    if (fs.existsSync(filename)) {
                        return yield Config.fromPath(filename);
                    }
                }
                throw new Error("no config found in folder");
            }
            if (extname(path) === ".json") {
                return Config.fromJson(path, fs.readFileSync(path).toString());
            }
            else if (extname(path) === ".js") {
                return yield Config.fromScript(path);
            }
            throw new Error("invalid config");
        });
    }
}
_Config_getTimestamp = new WeakMap(), _Config_instances = new WeakSet(), _Config_addLinks = function _Config_addLinks(lines, filename) {
    if (filename == null) {
        filename = "unknown";
    }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "" || line[0] === "#") {
            continue;
        }
        const match = line.match(/(\S+)\s+\[([^\]]+)\]\(([^\)]+)\)/);
        if (match == null) {
            throw new Error(`bad link: ${JSON.stringify(line)} (${filename}:${i + 1})`);
        }
        const key = match[1], title = match[2], link = match[3];
        if (this.links.has(key)) {
            throw new Error(`duplicate link: ${key}`);
        }
        this.links.set(key, { link, title, style: "normal" });
    }
};
//# sourceMappingURL=config.js.map