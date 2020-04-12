"use strict";

import fs from "fs";
import { basename, dirname, extname, resolve } from "path";

import type { Config } from "./config";
import type { Line, Script } from "./script";
import { MarkdownStyle, Node, parseBlock, parseMarkdown, PropertyNode, StylesAll, TextNode } from "./markdown";

type DirectiveInfo = {
    body?: boolean       // Supports a body
    title?: boolean,     // Supports markdown title
    heading?: boolean,   // Supports plain text title
    exts: Array<string>, // Supported extension
};

const Directives: Readonly<{ [ tag: string ]: DirectiveInfo }> = Object.freeze({
    section:     { title: true,               exts: [ "inherit", "note", "nav", "src" ] },
    subsection:  { title: true,               exts: [ "inherit", "note", "src" ] },
    heading:     { title: true,               exts: [ "inherit", "note", "src" ] },
    definition:  { body: true, title: true,   exts: [ ] },
    property:    { body: true,                exts: [ "src" ] },
    code:        { title: true,               exts: [ ] },
    toc:         { body: true,                exts: [ ] },
    "null":      { body: true,                exts: [ ] },
    note:        { body: true, heading: true, exts: [ ] },
    warning:     { body: true, heading: true, exts: [ ] }
});


export type TocEntry = {
    depth: number,
    title: string,
    path: string,
};

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

function namify(words: string): string {
    return words.toLowerCase().replace(/[^a-z0-9_-]+/gi, " ").split(" ").filter((w) => (!!w)).join("-");
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
                const extName = match[2].toLowerCase();
                if (Directives[tag].exts.indexOf(extName) === -1) {
                    throw new Error(`_${ tag }: does not support ${ JSON.stringify(extName.toUpperCase()) } extension`);
                }
                exts[extName] = match[3].replace("\\>", ">").replace("\\<", "<");
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

            const name = match[1].replace(/\s*/g, "");

            let params = match[2] || null;
            if (params) {
                params = params.replace(/([,=\x5b\x5d()])/g, (all, symbol) => {
                    return " " + symbol + " ";
                }).replace(/\s+/g, " ").trim();
            }

            let ret = comps[1]
            if (ret) {
                ret = ret.replace(/>\s*/g, " >").replace(/<\s*/g, "< ").replace(/\|/g, " | ").replace(/\s+/g, " ").trim();
            }
            const returns = (ret ? parseBlock(ret, [ MarkdownStyle.LINK ]): null);

            this.title = new PropertyNode(isConstructor, name, params, returns);

        } else if (Directives[tag].title) {
            this.title = parseBlock(this.value, StylesAll);

        } else if (Directives[tag].heading) {
            this.title = new TextNode(this.value);

        } else {
            if (this.value.trim() !== "") {
                throw new Error(`_${ tag }: does not support VALUE`);
            }
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
            throw new Error("CodeFragment must be evaluate to access code");
        }
        return this.#code;
    }

    async evaluate(script: Script): Promise<void> {
        if (this.#code) {
            throw new Error("CodeFragment already evaluated");
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
                    if (title != null) { throw new Error("only one _section: allowed"); }
                    title = fragment.title.textContent;
                    sectionFragment = fragment;
                    fragment._setPage(this, null);
                    parents = [ fragment ];
                    break;
                case FragmentType.SUBSECTION:
                    if (parents == null) { throw new Error("_subsection: missing _section:"); }
                    fragment._setPage(this, [ parents[0] ]);
                    parents = [ parents[0], fragment ];
                    break;
                case FragmentType.HEADING:
                    if (parents.length < 1) { throw new Error("_heading: missing _subsection:"); }
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
            throw new Error("missing _section:");
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
                throw new Error("only one _toc: allowed");

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
                throw new Error("path outside basepath");
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

