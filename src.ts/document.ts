"use strict";

import fs from "fs";
import { basename, dirname, extname, resolve } from "path";

import { Config } from "./config";

// Directive Attributes
// - body:     true if a directive supports having a body
// - title:    true is a directive supports markup in its value
const Directives: Readonly<{ [ tag: string ]: { body: boolean, title: boolean } }> = Object.freeze({
    section: { body: false, title: true },
    subsection: { body: false, title: true },
    heading: { body: false, title: true },
    definition: { body: true, title: true },
    property: { body: true, title: false },
    code: { body: false, title: true },
    toc: { body: true, title: false },
    "null": { body: true, title: false },
    note: { body: true, title: false },
    warning: { body: true, title: false }
});


export abstract class Node { }

export class TextNode extends Node {
    readonly content: string;

    constructor(content: string) {
        super();
        this.content = content;
    }
}

export enum ElementStyle {
    NORMAL     = "normal",

    // Inline styles
    BOLD       = "bold",
    ITALIC     = "italic",
    UNDERLINE  = "Underline",
    SUPER      = "super",
    CODE       = "code",

    // Link
    LINK       = "link",

    // List (each child is a list element)
    LIST       = "list",

    // Property Styles
    PROPERTY   = "property",
    NEW        = "new",
    NAME       = "name",
    PARAMETERS = "parameters",
    ARROW      = "arrow",
    RETURNS    = "returns",
};

export class ElementNode extends Node {
    readonly children: ReadonlyArray<Node>;
    readonly style: ElementStyle;

    constructor(style: ElementStyle, children: string | Array<string | Node>) {
        super();

        this.style = style;

        if (typeof(children) === "string") {
            children = [ new TextNode(children) ];
        } else {
            children = children.map((child) => {
                if (typeof(child) === "string") { return new TextNode(child); }
                return child;
            });
        }
        this.children = Object.freeze(children);
    }
}

export class LinkNode extends ElementNode {
    readonly link: string;

    constructor(link: string, children: string | Array<string | Node>) {
        super(ElementStyle.LINK, children);
        this.link = link;
    }
}

export class ListNode extends ElementNode {
    readonly items: ReadonlyArray<Node>;

    constructor(children: Array<Node>) {
        super(ElementStyle.LIST, children);
        this.items = this.children;
    }
}

export class PropertyNode extends ElementNode {
    readonly isConstructor: boolean;
    readonly name: string;
    readonly parameters: string;
    readonly returns: Node;

    constructor(isConstructor: boolean, name: string, parameters: string, returns: Node) {
        const children = [ new ElementNode(ElementStyle.NAME, name) ];
        if (parameters) {
            children.push(new ElementNode(ElementStyle.PARAMETERS, parameters));
        }
        if (returns) {
            children.push(new ElementNode(ElementStyle.ARROW, " => "));
            children.push(new ElementNode(ElementStyle.RETURNS, [ returns ]));
        }
        if (isConstructor) {
            children.unshift(new ElementNode(ElementStyle.NEW, "new "));
        }
        super(ElementStyle.PROPERTY, children);

        this.isConstructor = isConstructor;
        this.name = name;
        this.parameters = parameters;
        this.returns = returns;
    }
}


export class Fragment {
    readonly tag: string;
    readonly value: string;
    readonly link: string;

    readonly title: Node;
    readonly body: ReadonlyArray<Node>;

    readonly extensions: Readonly<{ [ extension: string ]: string }>;

    constructor(tag: string, value: string, body: string) {
        this.tag = tag;

        this.body = Object.freeze(parseMarkdown(body));

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

        if (this.tag === "property") {
            let sig = this.value;

            const isConstructor = (sig.substring(0, 4) === "new ");
            if (isConstructor) { sig = sig.substring(4).trim(); }

            const comps = sig.replace(/\s/g, "").split("=>");
            if (comps.length > 2) { throw new Error(`unexpected property arrow ${ JSON.stringify(sig) }`); }

            const match = comps[0].match(/^([^\x5d(]+)(\([^)]*\))?\s*$/);
            if (!match) { throw new Error(`invalid function definition: ${ JSON.stringify(sig) }`); }

            let returns = (comps[1] ? parseBlock(comps[1]): null);

            this.title = new PropertyNode(isConstructor, match[1], match[2] || null, returns);

        } else if (Directives[tag].title) {
            this.title = parseBlock(this.value);
        } else {
            this.title = null;
        }

        this.extensions = Object.freeze(exts);
    }

    _setParent(parent: Page): void {
        if (this.#page) { throw new Error("parent already set"); }
        this.#page = parent;
    }

    #page: Page;
    get page(): Page {
        return this.#page;
    }

    getExtension(name: string): string {
        const result = this.extensions[name.toLowerCase()];
        if (result == null) { return null; }
        return result;
    }
}

export class Page {
    readonly fragments: ReadonlyArray<Fragment>;
    readonly filename: string;

    constructor(filename: string, fragments: Array<Fragment>) {
        this.filename = resolve(filename);
        this.fragments = Object.freeze(fragments);

        this.fragments.forEach((fragment) => fragment._setParent(this));
    }

    #document: Document;
    get document(): Document {
        return this.#document;
    }

    #pathCache: string;
    get path(): string {
        if (!this.#pathCache) {
            const basepath = this.#document.basepath;
            if (this.filename.substring(0, basepath.length) !== basepath) {
                throw new Error("bad file location");
            }

            let path = this.filename.substring(basepath.length);
            if (basename(path).split(".")[0] === "index") {
                path = dirname(path);
            } else {
                path = dirname(path) + "/" + basename(path).split(".")[0];
                if (path.substring(0, 2) === "//") { path = path.substring(1); } //@TODO??
            }
            if (path.substring(path.length - 1) !== "/") { path += "/"; }

            this.#pathCache = path;
        }

        return this.#pathCache;
    }

    _setParent(parent: Document): void {
        if (this.#document) { throw new Error("parent already set"); }
        this.#document = parent;
    }

    static fromFile(filename: string): Page {
        const fragments: Array<Fragment> = [];

        let tag: string = null;
        let value: string = null;
        let body: Array<string> = [ ];

        // Parse out all the fragments
        const lines = fs.readFileSync(filename).toString().split("\n");
        lines.forEach((line) => {

            // Found a fragment line
            const match = line.match(/^_([a-z]*)\s*:(.*)$/i);
            if (match) {

                // Commit any started fragment
                if (tag) {
                    fragments.push(new Fragment(tag, value, body.join("\n").trim()));
                }

                // Start a new fragment
                tag = match[1].trim();
                value = match[2].trim();
                body = [ ];

            } else {
                line = line.trim();

                // Continuing a fragment that doesn't support body...
                if (!Directives[tag].body) {

                    // ...commit any started fragment
                    if (tag) {
                        fragments.push(new Fragment(tag, value, body.join("\n").trim()));
                    }

                    // ...start a new fragment
                    tag = "null";
                    value = "";
                    body = [ ];
                }

                // Continue the fragment (might be new)
                body.push(line);
            }
        });

        // Commit any left over started fragment
        if (tag) {
            fragments.push(new Fragment(tag, value, body.join("\n").trim()));
        }

        return new Page(resolve(filename), fragments);
    }
}


type Link = Readonly<{
    name: string,
    source: string,
    url: string
}>;

export class Document {
    readonly basepath: string;
    readonly pages: ReadonlyArray<Page>;
    readonly config: Config;

    #links: Readonly<{ [ name: string ]: Link }>;

    constructor(basepath: string, pages: Array<Page>, config: Config) {
        this.basepath = basepath
        this.pages = Object.freeze(pages);
        this.config = config;

        pages.forEach((page) => page._setParent(this));

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

        this.pages.forEach((page) => {
            page.fragments.forEach((fragment) => {
                if (fragment.link) {
                    const existing = links[fragment.link];
                    if (existing) {
                        // @TODO: Fill this in with sources
                        throw new Error("duplicate link");
                    }

                    links[fragment.link] = Object.freeze({
                        name: fragment.value.replace(/(\*\*|\/\/|__|\^\^|``)/g, ""),
                        source: page.filename,
                        url: (page.path + ((fragment.tag !== "section") ? ("#" + fragment.link): ""))
                    });
                }
            });
        });

        this.#links = Object.freeze(links);
    }

    getLinkName(name: string): string {
        return this.#links[name].name;
    }

    getLinkUrl(name: string): string {
        return this.#links[name].url;
    }

    static fromFolder(path: string, config: Config) {
        if (!config) { config = Config.fromRoot(path); }

        const readdir = function(path: string, basepath?: string): Array<Page> {
            if (!basepath) { basepath = path; }
            basepath = resolve(basepath);

            return fs.readdirSync(path).map((filename) => {
                const childpath = resolve(path, filename)
                const stat = fs.statSync(childpath);
                if (stat.isDirectory()) {
//                    console.log("Processing Directroy:", childpath);
                    return readdir(childpath, basepath);
                } else if (extname(childpath) === ".wrm") {
//                    console.log("  File:", childpath);
                    return [ Page.fromFile(childpath) ];
                }
                return [ ];
            }).reduce((accum: Array<Page>, pages: Array<Page>) => {
                pages.forEach((page) => { accum.push(page); });
                return accum;
            }, [ ]);
        }

//        console.log("Processing Directroy:", resolve(path));
        return new Document(resolve(path), readdir(path), config);
    }
}

// Breaks markdown into blocks. Blocks are separated by an empty line
// and lists are implicitly in their own block.
function splitBlocks(markdown: string): Array<string> {
    const result: Array<Array<string>> = [ [ ] ];

    let runningList = false;
    markdown.trim().split("\n").forEach((line) => {
        if (line.trim() === "") {
            result.push([ ]);
            runningList = false;
        } else if (!runningList && line.trim()[0] === "-") {
            runningList = true;
            result.push([ line ]);
        } else {
            result[result.length - 1].push(line);
        }
    });

    return result.filter((p) => (p.length > 0)).map((p) => p.join("\n").trim());
}

// Convert backslash escape sequences into their correct character
export function escapeText(text: string): TextNode {
    // Do not allow a trailing backslash
    if (text.match(/(\\*)$/)[1].length % 2) {
        throw new Error("strat backslash escape sequence");
    }

    // Replace all backslash escape sequences
    return new TextNode(text.replace(/\\(.)/g, (all, char) => char));
}

const WrapTypes: { [ sym: string ]: ElementStyle } = {
    "**": ElementStyle.BOLD,
    "/\/": ElementStyle.ITALIC,
    "__": ElementStyle.UNDERLINE,
    "^^": ElementStyle.SUPER,
    "``": ElementStyle.CODE,
};

/*
function simplify(el: Node): Array<Node> {
    if (el instanceof ElementNode && el.style === ElementStyle.NORMAL) {
        return el.children.slice();
    }
    return [ el ];
}
*/
function simplify(result: Array<Node>, markdown: string): Array<Node> {
    const node = parseBlock(markdown);
    if (node instanceof ElementNode && node.style === ElementStyle.NORMAL) {
        node.children.forEach((c) => { result.push(c); });
    } else {
        result.push(node);
    }

    return result;
}

// splitBlocks should be called first to make the list is split properly;
function parseBlock(markdown: string): Node {
    if (markdown === "") { return new TextNode(""); } // @TODO: something better? Filter...

    // Check for lists...
    if (markdown.trim()[0] === "-") {

        const points: Array<string> = [ ];
        markdown.split("\n").forEach((line) => {
            line = line.trim();
            if (line.substring(0, 1) === "-") {
                points.push(line.substring(1).trim().replace(/^-/, "\\-") + " ");
            } else {
                points[points.length - 1] += line + " ";
            }
        });

        return new ListNode(points.map((point) => parseBlock(point)));
    }

    // No list, so remove newlines and unnecessary spaces (do not trim)
    markdown = markdown.replace(/\s+/g, " ");

    // Check for links...
    // - "[[" /[a-z0-9_-]+/ "]]"
    // - "[" /* fix: [ */ not("]") "](" /[a-z0-9._&$+,/:;=?@#%-]+/ ")"
    let match = markdown.match(/^((?:.|\n)*?)(\[\[([a-z0-9_-]+)\]\]|\[([^\x5d]+)\]\(([a-z0-9._~'!*:@,;&$+/=?@#%-]+)\))((?:.|\n)*)$/i);
    if (match) {
        const result: Array<Node> = [ ];
        simplify(result, match[1]);
        if (match[3]) {
            result.push(new LinkNode(match[3], [ ]));
        } else {
            // NOTE: We could support markdown for link names here, but
            //       this complicates things (e.g. need to prohibit nested
            //       links) as well as makes rendering engines harder.
            //result.push(new LinkNode(match[5], parseBlock(match[4])));
            result.push(new LinkNode(match[5], [ escapeText(match[4]) ]));
        }
        simplify(result, match[6]);

        if (result.length === 1) { return result[0]; }
        return new ElementNode(ElementStyle.NORMAL, result);
    }

    // Check for bold, italic, underline, superscript, and inline code...
    match = markdown.match(/^((?:.|\n)*?)(\*\*|\/\/|__|\^\^|``)((?:.|\n)*)$/);
    if (match) {
        const type = WrapTypes[match[2]];
        const open = match[1].length;
        const close = markdown.indexOf(match[2], open + 2);
        if (close === -1) { throw new Error(`missing closing "${ match[2] }"`); }

        const result: Array<Node> = [ ];
        if (match[1]) {
            simplify(result, match[1]);
        }
        //result.push(new ElementNode(type, simplify(parseBlock(markdown.substring(open + 2, close)))));
        result.push(new ElementNode(type, simplify([ ], markdown.substring(open + 2, close))));
        if (close + 2 < markdown.length) {
            simplify(result, markdown.substring(close + 2));
        }

        if (result.length === 1) { return result[0]; }
        return new ElementNode(ElementStyle.NORMAL, result);
    }

    return escapeText(markdown);
}

export function parseMarkdown(markdown: string): Array<Node> {
    return splitBlocks(markdown).map((block) => {
        const el = parseBlock(block);
        if (el instanceof ElementNode && el.style === ElementStyle.NORMAL && el.children.length === 1) {
            return el.children[0];
        }
        return el;
    });
}
