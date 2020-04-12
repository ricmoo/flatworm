"use strict";

import fs from "fs";
import { basename, dirname, extname, resolve } from "path";

import type { Config } from "./config";
import type { Script } from "./scripts";

// @TOOD: Move markdown related things into its own file.

// Directive Attributes
// - body:     true if a directive supports having a body
// - title:    true is a directive supports markup in its value
const Directives: Readonly<{ [ tag: string ]: { body: boolean, title: boolean } }> = Object.freeze({
    section: { body: false, title: true, exts: [ "inherit", "src" ] },
    subsection: { body: false, title: true, exts: [ "inherit", "src" ] },
    heading: { body: false, title: true, exts: [ "inherit", "src" ] },
    definition: { body: true, title: true, exts: [ ] },
    property: { body: true, title: false, exts: [ "src" ] },
    code: { body: false, title: true, exts: [ ] },
    toc: { body: true, title: false, exts: [ ] },
    "null": { body: true, title: false, exts: [ ] },
    note: { body: true, title: false, exts: [ ] },
    warning: { body: true, title: false, exts: [ ] }
});


export abstract class Node {
    #document: Document;
    _setDocument(document: Document): void {
        if (this.#document) { throw new Error("already has a document"); }
        this.#document = document;
    }

    get document(): Document {
        return this.#document;
    }

    abstract get textContent(): string;
}

export class TextNode extends Node {
    readonly content: string;

    constructor(content: string) {
        super();
        this.content = content;
    }

    get textContent(): string {
        return this.content;
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
        this.children = Object.freeze(<Array<Node>>children);
    }

    _setDocument(document: Document): void {
        super._setDocument(document);
        this.children.forEach((c) => c._setDocument(document));
    }

    get textContent(): string {
        return this.children.map((c) => c.textContent).join("");
    }
}

export class LinkNode extends ElementNode {
    readonly link: string;

    constructor(link: string, children: string | Array<string | Node>) {
        super(ElementStyle.LINK, children);
        this.link = link;
    }

    get textContent(): string {
        if (this.children.length === 0) {
            console.log(this.link);
            return this.document.getLinkName(this.link);
        }
        return super.textContent;
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

export enum FragmentType {
    SECTION      = "section",
    SUBSECTION   = "subsection",
    HEADING      = "heading",

    DEFINITION   = "definition",
    PROPERTY     = "property",

    NOTE         = "note",
    WARNING      = "warning",

    CODE         = "code",
    NULL         = "null",

    TOC          = "toc"
};

function getFragmentType(name: string): FragmentType {
    if (!Directives[name]) {
        throw new Error("unknown fragment type: " + name);
    }

    return <FragmentType>name;
}

export class Fragment {
    readonly tag: FragmentType;
    readonly value: string;
    readonly link: string;

    readonly title: Node;
    readonly body: ReadonlyArray<Node>;

    readonly extensions: Readonly<{ [ extension: string ]: string }>;

    constructor(tag: FragmentType, value: string, body: Array<Node>) {
        this.tag = tag;

        this.body = Object.freeze(body);

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

        if (this.tag === FragmentType.PROPERTY) {
            let sig = this.value;

            const isConstructor = (sig.substring(0, 4) === "new ");
            if (isConstructor) { sig = sig.substring(4).trim(); }

            const comps = sig.replace(/\s/g, "").split("=>");
            if (comps.length > 2) { throw new Error(`unexpected property arrow ${ JSON.stringify(sig) }`); }

            const match = comps[0].match(/^([^\x5d(]+)(\([^)]*\))?\s*$/);
            if (!match) { throw new Error(`invalid function definition: ${ JSON.stringify(sig) }`); }

            let returns = (comps[1] ? parseBlock(comps[1], [ MarkdownStyle.LINK ]): null);

            this.title = new PropertyNode(isConstructor, match[1], match[2] || null, returns);

        } else if (Directives[tag].title) {
            this.title = parseBlock(this.value, StylesAll);

        } else {
            this.title = null;
        }

        this.extensions = Object.freeze(exts);
    }

    // The Page that contains this
    #page: Page;
    get page(): Page { return this.#page; }

    // An automatically generated  link target for this
    #autoLink: string;
    get autoLink(): string { return this.#autoLink; }

    // The closest heading, subsection or section Fragment that contains this
    #parent: Fragment;
    get parent(): Fragment { return this.#parent; }


    _setDocument(document: Document): void {
        this.body.forEach((n) => n._setDocument(document));
        if (this.title) { this.title._setDocument(document); }
    }

    _setPage(page: Page, parents: Array<Fragment>): void {
        if (this.#page) { throw new Error("parent already set"); }
        this.#page = page;

        // Set the immediate parent fragmet
        if (parents) {
            this.#parent = parents.filter((p) => (p != null)).pop();
        } else {
            this.#parent = null;
        }

        // Compute the autoLink from the hierarchal-parent fragments
        const components = [ ];
        (parents || [ ]).forEach((fragment) => {
            if (!fragment) { return; }
            components.push(fragment.link || namify(fragment.value));
        });
        components.push(this.link || namify(this.value));

        this.#autoLink = components.join("--");
    }


    getExtension(name: string): string {
        const result = this.extensions[name.toLowerCase()];
        if (result == null) { return null; }
        return result;
    }

    static from(tag: FragmentType, value: string, body: string): Fragment {
        // Some special cases
        switch (tag) {
            case FragmentType.CODE:
                return new CodeFragment(value);
            case FragmentType.TOC:
                return new TocFragment(body);
        }
        return new Fragment(tag, value, parseMarkdown(body));
    }
}

export type Line = {
    classes: Array<string>,
    content: string
};

export class CodeFragment extends Fragment {
    readonly _filename: string

    constructor(filename: string) {
        super(FragmentType.CODE, filename, [ ]);
        this._filename = filename;
    }

    get filename(): string {
        return resolve(dirname(this.page.filename), this._filename);
    }

    #source: string;
    get source(): string {
        if (this.#source == null) {
            this.#source = fs.readFileSync(this.filename).toString();
        }
        return this.#source;
    }

    get language(): string {
        switch (extname(this.filename)) {
            case ".js":     return "javascript";
            case ".txt":    return "text";
            case ".source": return "source"
        }
        return "unknown";
    }

    #code: ReadonlyArray<Line>;
    get code(): ReadonlyArray<Line> {
        if (this.#code == null) {
            throw new Error("code not evaluated");
        }
        return this.#code;
    }

    async evaluate(script: Script): Promise<void> {
        if (this.#code) {
            throw new Error("code already evaluated");
        }

        if (this.language === "javascript") {
           this.#code = Object.freeze(await script.run(this.filename, this.source));
        }
    }

    get evaluated(): boolean {
        return (this.#code != null);
    }

}

export class TocFragment extends Fragment {
    readonly items: ReadonlyArray<string>;

    constructor(body: string) {
        super(FragmentType.TOC, "", [ ]);
        this.items = Object.freeze(body.split("\n").map((l) => l.trim()).filter((l) => l.length));
    }
}

export type TocEntry = {
    depth: number,
    title: string,
    path: string,
};

export class Page {
    readonly fragments: ReadonlyArray<Fragment>;
    readonly filename: string;
    readonly title: string;
    readonly sectionFragment: Fragment;

    constructor(filename: string, fragments: Array<Fragment>) {
        this.filename = resolve(filename);
        this.fragments = Object.freeze(fragments);

        let title: string = null;
        let sectionFragment: Fragment = null;
        let parents: Array<Fragment> = null;
        this.fragments.forEach((fragment) => {
            switch (fragment.tag) {
                case FragmentType.SECTION:
                    if (title != null) { throw new Error("too many _section: directives"); }
                    title = fragment.title.textContent;
                    sectionFragment = fragment;
                    fragment._setPage(this, null);
                    parents = [ fragment ];
                    break;
                case FragmentType.SUBSECTION:
                    if (parents == null) { throw new Error("subsection without section"); }
                    fragment._setPage(this, [ parents[0] ]);
                    parents = [ parents[0], fragment ];
                    break;
                case FragmentType.HEADING:
                    if (parents.length < 1) { throw new Error("heading without subsection"); }
                    fragment._setPage(this, [ parents[0], parents[1] ]);
                    while (parents.length > 2) { parents.pop(); }
                    while (parents.length < 2) { parents.push(null); }
                    parents.push(fragment);
                    break;
                default:
                    fragment._setPage(this, parents);
            }
        });

        if (title == null) {
            throw new Error("missing _section: directive");
        }

        this.title = title;
        this.sectionFragment = sectionFragment;
    }

    #toc: ReadonlyArray<Readonly<TocEntry>>;
    get toc(): ReadonlyArray<Readonly<TocEntry>> {
        if (this.#toc == null) {
            const toc: Array<TocEntry> = [ ];

            const tocFragments = this.fragments.filter((f) => (f.tag === FragmentType.TOC));
            if (tocFragments.length > 1) {
                throw new Error("too many _toc: directives");

            } else if (tocFragments.length === 1) {
                const fragment = tocFragments[0];

                // Appease TypeScript...
                if (!(fragment instanceof TocFragment)) {
                    throw new Error("invlaid toc fragment");
                }

                toc.push(Object.freeze({ depth: 0, title: this.title, path: this.path }));

                fragment.items.forEach((item) => {
                    const path = this.path + item + "/";
                    const page = this.document.getPage(path);
                    if (page == null) {
                        throw new Error(`missing toc page %{ JSON.stringify(item) }`);
                    }
                    page.toc.forEach((item) => {
                        const depth = item.depth + 1;
                        const title = item.title;
                        const path = item.path;
                        toc.push(Object.freeze({ depth, title, path }));
                    });
                });

            } else {
                this.fragments.forEach((fragment) => {
                    let depth = 0;
                    let path = this.path;
                    switch (fragment.tag) {
                        case FragmentType.SECTION:
                            break;
                        case FragmentType.SUBSECTION:
                            depth = 1;
                            path += `#${ fragment.link || fragment.autoLink }`
                            break;
                        default:
                            return;
                    }
                    const title = fragment.title.textContent;
                    toc.push(Object.freeze({ depth, title, path }));
                });
            }

            this.#toc = Object.freeze(toc);
        }

        return this.#toc;
    }

    #document: Document;
    get document(): Document { return this.#document; }

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

    _setDocument(document: Document): void {
        if (this.#document) { throw new Error("parent already set"); }
        this.#document = document;
        this.fragments.forEach((f) => f._setDocument(document));
    }

    static fromFile(filename: string): Page {
        const fragments: Array<Fragment> = [];

        let tag: FragmentType = null;
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
                    fragments.push(Fragment.from(tag, value, body.join("\n").trim()));
                }

                // Start a new fragment
                tag = getFragmentType(match[1].trim());
                value = match[2].trim();
                body = [ ];

            } else {
                line = line.trim();

                // Continuing a fragment that doesn't support body...
                if (!Directives[tag].body) {

                    // ...commit any started fragment
                    if (tag) {
                        fragments.push(Fragment.from(tag, value, body.join("\n").trim()));
                    }

                    // ...start a new fragment
                    tag = FragmentType.NULL;
                    value = "";
                    body = [ ];
                }

                // Continue the fragment (might be new)
                body.push(line);
            }
        });

        // Commit any left over started fragment
        if (tag) {
            fragments.push(Fragment.from(tag, value, body.join("\n").trim()));
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

        pages.forEach((page) => page._setDocument(this));

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

        const uniquePaths: { [ path: string ]: boolean } = { };
        this.pages.forEach((page) => {
            // Make sure page paths are all unique (this can happen
            // if there is are two files "foo/index.wrm" and "foo.wrm")
            if (uniquePaths[page.path]) {
                throw new Error(`duplicate page path ${ JSON.stringify(page.path) }`);
            }
            uniquePaths[page.path] = true;

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
                        url: (page.path + ((fragment.tag !== FragmentType.SECTION) ? ("#" + fragment.link): ""))
                    });
                }
            });
        });

        this.#links = Object.freeze(links);
    }

    get copyright(): Array<Node> {
        return this.parseMarkdown(this.config.copyright);
    }

    getLinkName(name: string): string {
        const link = this.#links[name];
        if (link == null) { throw new Error(`missing link "${ name }"`); }
        return link.name;
    }

    getLinkUrl(name: string): string {
        const link = this.#links[name];
        if (link == null) { throw new Error(`missing link "${ name }"`); }
        return link.url;
    }

    getPage(path: string): Page {
        return this.pages.filter((p) => (p.path === path))[0] || null;
    }

    #toc: ReadonlyArray<Readonly<TocEntry>>;
    get toc(): ReadonlyArray<Readonly<TocEntry>> {
        if (this.#toc == null) {
            const rootPage = this.getPage("/");
            if (rootPage == null) { throw new Error("missing root page"); }
            this.#toc = rootPage.toc.filter((e) => (e.path.indexOf("#") === -1))
        }
        return this.#toc;
    }

    parseMarkdown(markdown: string, styles?: Array<MarkdownStyle>): Array<Node> {
        const nodes = parseMarkdown(markdown, styles);
        nodes.forEach((n) => n._setDocument(this));
        return nodes;
    }

    async evaluate(script: Script): Promise<void> {
        for (let p = 0; p < this.pages.length; p++) {
            const page = this.pages[p];
            for (let f = 0; f < page.fragments.length; f++) {
                const fragment = page.fragments[f];
                if (fragment instanceof CodeFragment) {
                    await fragment.evaluate(script);
                }
            }
        }
    }

    static fromFolder(path: string, config: Config) {
        //if (!config) { config = Config.fromRoot(path); }

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
                    try {
                        return [ Page.fromFile(childpath) ];
                    } catch (error) {
                        console.log(error.stack);
                        throw new Error(`${ error.message } [${ childpath }]`);
                    }
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

function namify(words: string): string {
    return words.toLowerCase().replace(/[^a-z0-9_-]+/gi, " ").split(" ").filter((w) => (!!w)).join("-");
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
    const backslashes = text.match(/(\\*)$/);
    if (backslashes && backslashes[1].length % 2) {
        throw new Error("strat backslash escape sequence");
    }

    // Replace all backslash escape sequences
    return new TextNode(text.replace(/\\(.)/g, (all, char) => char));
}

export enum MarkdownStyle {
    BOLD       = "bold",
    ITALIC     = "italic",
    UNDERLINE  = "underline",
    CODE       = "code",
    SUPER      = "super",
    LINK       = "link",
    LIST       = "list",
};

const StylesAll = [
    MarkdownStyle.BOLD,
    MarkdownStyle.ITALIC,
    MarkdownStyle.UNDERLINE,
    MarkdownStyle.CODE,
    MarkdownStyle.SUPER,
    MarkdownStyle.LINK,
    MarkdownStyle.LIST,
];

const WrapTypes: { [ sym: string ]: ElementStyle } = {
    "**":   ElementStyle.BOLD,
    "/\/":  ElementStyle.ITALIC,
    "__":   ElementStyle.UNDERLINE,
    "^^":   ElementStyle.SUPER,
    "``":   ElementStyle.CODE,
};

function simplify(result: Array<Node>, markdown: string, styles: Array<MarkdownStyle>): Array<Node> {
    const node = parseBlock(markdown, styles);
    if (node instanceof ElementNode && node.style === ElementStyle.NORMAL) {
        node.children.forEach((c) => { result.push(c); });
    } else {
        result.push(node);
    }

    return result;
}

// splitBlocks should be called first to make the list is split properly;
function parseBlock(markdown: string, styles: Array<MarkdownStyle>): Node {
    if (markdown === "") { return new TextNode(""); } // @TODO: something better? Filter...

    // Check for lists...
    if (markdown.trim()[0] === "-" && styles.indexOf(MarkdownStyle.LIST)) {

        const points: Array<string> = [ ];
        markdown.split("\n").forEach((line) => {
            line = line.trim();
            if (line.substring(0, 1) === "-") {
                points.push(line.substring(1).trim().replace(/^-/, "\\-") + " ");
            } else {
                points[points.length - 1] += line + " ";
            }
        });

        return new ListNode(points.map((point) => parseBlock(point, styles)));
    }

    // No list, so remove newlines and unnecessary spaces (do not trim)
    markdown = markdown.replace(/\s+/g, " ");

    // We want to process inline markdown from left-to-right, so we need
    // to find all possible inline candidates to find the left-most
    const candidates: Array<{ offset: number, callback: () => Node }> = [ ];

    // Check for links...
    // - "[[" /[a-z0-9_-]+/ "]]"
    // - "[" /* fix: [ */ not("]") "](" /[a-z0-9._&$+,/:;=?@#%-]+/ ")"
    const matchLink = markdown.match(/^((?:.|\n)*?)(\[\[([a-z0-9_-]+)\]\]|\[([^\x5d]+)\]\(([a-z0-9._~'!*:@,;&$+/=?@#%-]+)\))((?:.|\n)*)$/i);
    if (matchLink && styles.indexOf(MarkdownStyle.LINK) !== -1) {
        candidates.push({
            offset: matchLink[1].length,
            callback: () => {
                const result: Array<Node> = [ ];
                simplify(result, matchLink[1], styles);
                if (matchLink[3]) {
                    result.push(new LinkNode(matchLink[3], [ ]));
                } else {
                    // NOTE: We could support markdown for link names here, but
                    //       this complicates things (e.g. need to prohibit nested
                    //       links) as well as makes rendering engines harder.
                    //result.push(new LinkNode(matchLink[5], parseBlock(matchLink[4])));
                    result.push(new LinkNode(matchLink[5], [ escapeText(matchLink[4]) ]));
                }
                simplify(result, matchLink[6], styles);

                if (result.length === 1) { return result[0]; }
                return new ElementNode(ElementStyle.NORMAL, result);
            }
        });
    }

    // Check for bold, italic, underline, superscript, and inline code...
    const matchStyle = markdown.match(/^((?:.|\n)*?)(\*\*|\/\/|__|\^\^|``)((?:.|\n)*)$/);
    if (matchStyle && styles.indexOf(<any>WrapTypes[matchStyle[2]]) !== -1) {
        candidates.push({
            offset: matchStyle[1].length,
            callback: () => {
                const type = WrapTypes[matchStyle[2]];
                const open = matchStyle[1].length;
                const close = markdown.indexOf(matchStyle[2], open + 2);
                if (close === -1) {
                    throw new Error(`missing closing "${ matchStyle[2] }" near ${ JSON.stringify(markdown) }`);
                }

                const result: Array<Node> = [ ];
                if (matchStyle[1]) {
                    simplify(result, matchStyle[1], styles);
                }
                //result.push(new ElementNode(type, simplify(parseBlock(markdown.substring(open + 2, close)))));
                result.push(new ElementNode(type, simplify([ ], markdown.substring(open + 2, close), styles)));
                if (close + 2 < markdown.length) {
                    simplify(result, markdown.substring(close + 2), styles);
                }

                if (result.length === 1) { return result[0]; }
                return new ElementNode(ElementStyle.NORMAL, result);
            }
        });
    }

    if (candidates.length) {
        const leftmost = candidates.reduce((accum, candidate) => {
             if (accum.offset == null || accum.offset > candidate.offset) {
                 return candidate;
             }
             return accum;
        }, { offset: null, callback: null });
        return leftmost.callback();
    }

    return escapeText(markdown);
}

export function parseMarkdown(markdown: string, styles?: Array<MarkdownStyle>): Array<Node> {
    if (styles == null) { styles = StylesAll; }
    return splitBlocks(markdown).map((block) => {
        const el = parseBlock(block, styles);
        if (el instanceof ElementNode && el.style === ElementStyle.NORMAL && el.children.length === 1) {
            return el.children[0];
        }
        return el;
    });
}

