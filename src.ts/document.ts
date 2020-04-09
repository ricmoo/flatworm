"use strict";

import fs from "fs";
import { basename, dirname, extname, resolve } from "path";

import { Config } from "./config";

export class Fragment {
    readonly tag: string;
    readonly value: string;
    readonly link: string;
    readonly body: string;

    readonly extensions: Readonly<{ [ extension: string ]: string }>;

    #parent: Node;

    constructor(tag: string, value: string, body: string) {
        this.tag = tag;
        this.body = body;

        const exts: { [ name: string ]: string } = { }
        while (true) {
            const match = value.match(/^(.*)@([a-z0-9_]*)<((?:[^>]|\\>)*)>\s*$/i);
            if (!match) { break; }

            if (match[2]) {
                exts[match[2].toLowerCase()] = match[3].replace("\\>", ">").replace("\\<", "<");
            } else {
                this.link = match[3];
            }
            value = match[1].trim(); //this.value.substring(0, this.value.indexOf("<")).trim();
        }
        this.value = value.trim();

        this.extensions = Object.freeze(exts);
    }

    _setParent(parent: Node): void {
        if (this.#parent) { throw new Error("parent already set"); }
        this.#parent = parent;
    }

    getExtension(name: string): string {
        const result = this.extensions[name.toLowerCase()];
        if (result == null) { return null; }
        return result;
    }
}


const DirectiveHasBody: { [ tag: string ]: boolean } = { definition: true, "null": true, note: true, property: true, toc: true, warning: true };

export class Node {
    readonly fragments: ReadonlyArray<Fragment>;
    readonly realpath: string; // @TODO: rename to filename
    readonly path: string; // @TODO: Maybe derive from document root?

    #parent: Document;

    constructor(realpath: string, fragments: Array<Fragment>, path?: string) {
        this.realpath = realpath; // @TODO: better signature and passing this around...
        this.fragments = Object.freeze(fragments);
        this.path = (path || null)

        this.fragments.forEach((fragment) => fragment._setParent(this));
    }

    _setParent(parent: Document): void {
        if (this.#parent) { throw new Error("parent already set"); }
        this.#parent = parent;
    }

    static fromFile(path: string, basepath: string): Node {
        if (path.substring(0, basepath.length) !== basepath) {
            console.log(path, basepath);
            throw new Error("basepath mismatch");
        }

        const fragments: Array<Fragment> = [];

        let tag: string = null;
        let value: string = null;
        let body: Array<string> = [ ];

        const lines = fs.readFileSync(path).toString().split("\n");
        lines.forEach((line) => {
            const match = line.match(/^_([a-z]*)\s*:(.*)$/i);
            if (match) {
                if (tag) {
                    fragments.push(new Fragment(tag, value, body.join("\n").trim()));
                }
                tag = match[1].trim();
                value = match[2].trim();
                body = [ ];
                //fragments.push(new Fragment(match[1].trim(), match[2].trim()));
            } else {
                line = line.trim();
                if (!DirectiveHasBody[tag]) {
                    fragments.push(new Fragment(tag, value, body.join("\n").trim()));
                    tag = "null";
                    value = "";
                    body = [ ];
                }
                body.push(line);
                //let lastFragment = fragments[fragments.length - 1];
                //if (!DirectiveHasBody[lastFragment.tag]) {
                //    lastFragment = new Fragment("null", "");
                //    fragments.push(lastFragment);
                //}
                //lastFragment._append(line);
            }
        });

        if (tag) {
            fragments.push(new Fragment(tag, value, body.join("\n").trim()));
        }

        let target = path.substring(basepath.length);
        if (basename(target).split(".")[0] === "index") {
            target = dirname(target);
        } else {
            target = dirname(target) + "/" + basename(target).split(".")[0];
            if (target.substring(0, 2) === "//") { target = target.substring(1); }
        }
        if (target.substring(target.length - 1) !== "/") { target += "/"; }

        return new Node(path, fragments, target);
    }
}


type Link = Readonly<{
    name: string,
    source: string,
    url: string
}>;

export class Document {
    readonly basepath: string;
    readonly nodes: ReadonlyArray<Node>;
    readonly config: Config;

    #links: Readonly<{ [ name: string ]: Link }>;

    constructor(basepath: string, nodes: Array<Node>, config: Config) {
        this.basepath = basepath
        this.nodes = Object.freeze(nodes);
        this.config = config;

        nodes.forEach((node) => node._setParent(this));

        const links: { [ name: string ]: Link } = { };
        if (config.externalLinks) {
            Object.keys(config.externalLinks).forEach((key) => {
                const link = config.externalLinks[key];
                links[key] = Object.freeze({
                    name: link.name,
                    source: "config.js",
                    url: link.url
                });
            });
        }

        this.nodes.forEach((node) => {
            node.fragments.forEach((fragment) => {
                if (fragment.link) {
                    const existing = links[fragment.link];
                    if (existing) {
                        // @TODO: Fill this in with sources
                        throw new Error("duplicate link");
                    }

                    links[fragment.link] = Object.freeze({
                        name: fragment.value.replace(/(\*\*|\/\/|__|\^\^|``)/g, ""),
                        source: node.realpath,
                        url: (node.path + ((fragment.tag !== "section") ? ("#" + fragment.link): ""))
                    });
                }
            });
        });

        this.#links = links;
    }

    getLinkName(name: string): string {
        return this.#links[name].name;
    }

    getLinkUrl(name: string): string {
        return this.#links[name].url;
    }

    static fromFolder(path: string, config: Config) {
        if (!config) { config = Config.fromRoot(path); }

        const readdir = function(path: string, basepath?: string): Array<Node> {
            if (!basepath) { basepath = path; }
            basepath = resolve(basepath);

            return fs.readdirSync(path).map((filename) => {
                const childpath = resolve(path, filename)
                const stat = fs.statSync(childpath);
                if (stat.isDirectory()) {
                    console.log("Processing Directroy:", childpath);
                    return readdir(childpath, basepath);
                } else if (extname(childpath) === ".wrm") {
                    console.log("  File:", childpath);
                    return [ Node.fromFile(childpath, basepath) ];
                }
                return [ ];
            }).reduce((accum: Array<Node>, nodes: Array<Node>) => {
                nodes.forEach((node) => { accum.push(node); });
                return accum;
            }, [ ]);
        }

        console.log("Processing Directroy:", resolve(path));
        return new Document(resolve(path), readdir(path), config);
    }
}

/*
function mkdir(dir) {
    try {
        fs.accessSync(dir);
    } catch (error) {
        if (error.code !== "ENOENT") { throw error; }
        fs.mkdirSync(dir, { recursive: true });
    }
}
*/

