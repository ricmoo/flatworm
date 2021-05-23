"use strict";

import fs from "fs";
import { basename, dirname, extname, join, resolve } from "path";

import type { Config } from "./config";
import type { Line, Script } from "./script";
import { CellAlign, CellNode, MarkdownStyle, Node, parseBlock, parseMarkdown, PropertyNode, StylesAll, StylesInline, TextNode } from "./markdown";

type DirectiveInfo = {
    title?: boolean,     // Supports markdown title
    heading?: boolean,   // Supports plain text title
    exts: Array<string>, // Supported extension
};

/*
Maybe?
enum TitleType {
    NONE = null,
    MARKDOWN = "markdown",
    TEXT = "text",
};
*/

const Directives: Readonly<{ [ tag: string ]: DirectiveInfo }> = Object.freeze({
    section:     { title: true,   exts: [ "inherit", "note", "nav", "src" ] },
    subsection:  { title: true,   exts: [ "inherit", "note", "src" ] },
    heading:     { title: true,   exts: [ "inherit", "note", "src" ] },
    definition:  { title: true,   exts: [ ] },
    property:    {                exts: [ "src" ] },
    code:        { heading: true, exts: [ "lang" ] },  // body is specially handled
    toc:         {                exts: [ ] },
    "null":      {                exts: [ ] },
    note:        { heading: true, exts: [ ] },
    warning:     { heading: true, exts: [ ] },
    table:       { heading: true, exts: [ "style" ] }, // body is specially handled
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

    TOC          = "toc",

    TABLE        = "table"
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

/*
function visit(node: Node, visiter: (node: Node) => void): void {
    visiter(node);
    if (node instanceof ElementNode) {
        node.children.forEach((c) => visit(c, visiter
        ));
    }
}
*/

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
        this.body.forEach((n) => n._setDocument(document, this.page, this));
        if (this.title) { this.title._setDocument(document, this.page, this); }
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
                return new CodeFragment(value, body);
            case FragmentType.TABLE:
                return new TableFragment(value, body);
            case FragmentType.TOC:
                return new TocFragment(body);
        }
        return new Fragment(tag, value, parseMarkdown(body));
    }
}

export class CodeFragment extends Fragment {
    readonly heading: string;
    readonly source: string;

    constructor(heading: string, source: string) {
        super(FragmentType.CODE, heading, [ new TextNode(source) ]);
        this.heading = heading;

        const lines = source.split("\n");
        while (lines.length && lines[0].trim() === "") { lines.shift(); }
        while (lines.length && lines[lines.length - 1].trim() === "") { lines.pop(); }
        this.source = lines.join("\n");
    }

    get language(): string {
        return this.getExtension("lang");
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
           try {
               let scriptName = join(this.page.filename, "script.js");
               if (this.heading.trim()) {
                   let fragment = this.title.textContent;
                   fragment = fragment.replace(/[^a-z0-9]/ig, "-");
                   fragment = fragment.replace(/-+/g, "-");
                   fragment = fragment.replace(/(^-+)|(-+$)/g, "");
                   scriptName += "#" + fragment;
               }
               this.#code = Object.freeze(await script.run(scriptName, this.source));
           } catch (error) {
               console.log(this, error);
               throw error;
           }
        } else if (this.language === "script") {
            this.#code = Object.freeze(this.source.split("\n").map((line) => {
                let classes = [ ];
                const check = line.replace(/\s/g, "");
                if (check.match(/^\/\/!/)) {
                    classes.push("result");
                    classes.push("ok");
                    line = line.replace(/!/, "");
                } else if (check.match(/^\/\//)) {
                    classes.push("comment");
                }
                return { classes: classes, content: line };
            }));
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

type CellInfo = {
    col: number;
    cols: number;
    row: number;
    rows: number;
    align?: CellAlign;
    content?: string;
};

function getCellName(row: number, col: number): string {
    return `${ row }x${ col }`;
}

export enum TableStyle {
    MINIMAL  = "minimal",
    COMPACT  = "compact",
    WIDE     = "wide",
    FULL     = "full"
};

const TableStyles: { [ name: string ]: boolean } = {
    minimal: true,
    compact: true,
    wide: true,
    full: true
};

export class TableFragment extends Fragment {
    readonly rows: number;
    readonly cols: number;

    #cells: { [ name: string ]: CellNode };

    constructor(value: string, body: string) {
        super(FragmentType.TABLE, value, [ ]);
        this.#cells = { };

        const style = this.getExtension("style");
        if (style && !TableStyles[style]) {
            throw new Error(`unknown table style ${ JSON.stringify(style) }`);
        }

        const vars: { [ name: string ]: string } = { };

        const table: Array<Array<CellInfo>> = [ ];
        {
            let currentVar: string = null;
            body.split("\n").forEach((line) => {
                line = line.trim();
                if (line === "") { return; }

                // Decalre a new variable
                const matchVar = line.match(/^(\$[a-z][a-z0-9]*):(.*)$/i);
                if (matchVar) {
                    currentVar = matchVar[1];
                    if (vars[currentVar] != null) { throw new Error(`duplicate variable "${ currentVar }"`); }
                    vars[currentVar] = matchVar[2];

                // Continue the table...
                } else if (line[0] === "|") {
                    if (line[line.length - 1] !== "|") {
                        throw new Error(`table row missing close`);
                    }

                    // No longer processing a variable
                    currentVar = null;

                    let ci = 0, ri = table.length;

                    // Determine each cells rowspan, colspan and alignment
                    table.push(line.substring(1, line.length - 1).split("|").map((cell, index) => {

                        // Only a row extending cell (i.e. ^)
                        if (cell.trim() === "^") {
                            if (ri === 0) { throw new Error("cannot row extend top cells"); }

                            const baseCol = table[ri - 1].filter((c) => (c.col === ci))[0];
                            if (baseCol == null) { throw new Error(`row extended cell column mismatch`); }

                            baseCol.rows++;

                            ci += baseCol.cols;

                            return baseCol;
                        }

                        let cols = 1;

                        // Column extending
                        const matchCheckCol = cell.trim().match(/(?:^|\s)(<+)$/);
                        if (matchCheckCol) {
                            cell = cell.substring(0, cell.length - matchCheckCol[1].length);
                            cols += matchCheckCol[1].length;
                        }

                        // Alignment
                        let align = CellAlign.CENTER;
                        if (cell.trim() !== "") {
                            if (cell.match(/^(\s*)/)[1].length <= 1) {
                                align = CellAlign.LEFT;
                            } else if (cell.match(/(\s*)$/)[1].length <= 1) {
                                align = CellAlign.RIGHT;
                            }
                        }

                        const result = {
                            align: align,
                            col: ci,
                            cols: cols,
                            content: cell.trim(),
                            row: ri,
                            rows: 1
                        }

                        ci += cols;

                        return result;
                    }));

                // Continue a variable's content
                } else {
                    if (currentVar == null) { throw new Error(`invalid table row ${ JSON.stringify(line) }`); }
                    vars[currentVar] += " " + line
                }
            });
        }
        // Simplify all the varaibles by trimming unnecessary whitespace
        for (const key in vars) { vars[key] = vars[key].replace(/\s+/g, " ").trim(); }

        // Substitute variables and ensure the columns counts are consistent
        const cols = table.reduce((accum, row, ri) => {
            let ci = 0;
            const cols = row.reduce((accum, col) => {

                // Substitute variables
                const value = vars[col.content];
                if (value != null) { col.content = value; }

                // Either create a new cell or reference the old one
                let cell = null;
                if (col.row !== ri) {
                    cell = this.#cells[getCellName(ri - 1, ci)];
                } else {
                    cell = new CellNode(ri, ci, col.align, col.rows, col.cols, [ parseBlock(col.content, StylesInline) ]);
                }

                // Fill the cell across its columns
                for (let i = 0; i < col.cols; i++) {
                    this.#cells[getCellName(ri, ci)] = cell;
                    ci++;
                }

                // Count the total number of columns
                return accum + col.cols;
            }, 0);

            // Check the number of columns is consistent
            if (accum != null && accum !== cols) {
                throw new Error(`bad table column count (row[${ ri }] = ${ accum }, row[${ ri + 1}] = ${ cols })`);
            }

            return cols;
        }, <number>null);

        this.cols = cols;
        this.rows = table.length;
    }

    get style(): TableStyle {
        return (<TableStyle>(this.getExtension("style"))) || TableStyle.MINIMAL;
    }

    getCell(row: number, col: number): CellNode {
        const cell = this.getParentCell(row, col);
        if (cell.row !== row || cell.col !== col) {
            return null;
        }
        return cell;
    }

    getParentCell(row: number, col: number) {
        return this.#cells[getCellName(row, col)];
    }

    _setDocument(document: Document): void {
        super._setDocument(document);
        const done: { [ id: number ]: boolean } = { };
        Object.keys(this.#cells).forEach((name) => {
            const cell = this.#cells[name];
            if (done[cell.id]) { return; }
            done[cell.id] = true;
            cell._setDocument(document, this.page, this);
        });
    }
}

/*
console.log(new TableFragment("foo", `
$G: Tra lala
foobar...
$H: Another things...
| **A**  |  **B**  |  **C**  |
| Hello World     <| FOO     |
|                <^|  BAR    |
| $G     |    $H            <|
`));
*/

export class Page {
    readonly fragments: ReadonlyArray<Fragment>;
    readonly filename: string;
    readonly title: string;
    readonly sectionFragment: Fragment;

    readonly modifiedDate: Date;

    static searchPage(basepath: string): Page {
        return new Page(resolve(basepath, "search"), [ new Fragment(FragmentType.SECTION, "Search", [ ]) ]);
    }

    constructor(filename: string, fragments: Array<Fragment>, options?: { modifiedDate?: Date }) {
        this.filename = resolve(filename);
        this.fragments = Object.freeze(fragments);

        if (options == null) { options = { }; }
        this.modifiedDate = (options.modifiedDate || (new Date()));

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
                        throw new Error(`missing toc page ${ JSON.stringify(item) }`);
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

            this.#pathCache = this.#document.config.getPath(path);
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

        let inCode = false;

        const mtime = fs.statSync(filename).mtime;

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
                inCode = (tag === FragmentType.CODE);

            } else if (inCode) {
                // The only escape in code blocks is a \_
                if (line.substring(0, 2) === "\\_") { line = line.substring(1); }
                body.push(line);

            } else {
                body.push(line.trim());
            }
        });

        // Commit any left over started fragment
        if (tag) {
            fragments.push(Fragment.from(tag, value, body.join("\n").trim()));
        }

        return new Page(resolve(filename), fragments, { modifiedDate: mtime });
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
                    const pagePath = page.path + ((fragment.tag !== FragmentType.SECTION) ? ("#" + fragment.link): "");

                    const existing = links[fragment.link];
                    if (existing) {
                        // @TODO: Fill this in with sources
                        throw new Error(`duplicate link ${ JSON.stringify(fragment.link) } [ ${ JSON.stringify(existing.url) }, ${ JSON.stringify(pagePath) } ]`);
                    }

                    links[fragment.link] = Object.freeze({
                        name: fragment.value.replace(/(\*\*|\/\/|__|\^\^|``)/g, ""),
                        source: page.filename,
                        url: pagePath
                    });
                }
            });
        });

        this.#links = Object.freeze(links);
    }

    get names(): Array<string> {
        return Object.keys(this.#links);
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

    get copyright(): Array<Node> {
        return this.parseMarkdown(this.config.copyright);
    }

    #toc: ReadonlyArray<Readonly<TocEntry>>;
    get toc(): ReadonlyArray<Readonly<TocEntry>> {
        if (this.#toc == null) {
            const rootPage = this.getPage(this.config.getPath("/"));
            if (rootPage == null) { throw new Error("missing root page"); }
            this.#toc = rootPage.toc.filter((e) => (e.path.indexOf("#") === -1))
        }
        return this.#toc;
    }

    parseMarkdown(markdown: string, styles?: Array<MarkdownStyle>): Array<Node> {
        const nodes = parseMarkdown(markdown, styles);
        nodes.forEach((n) => n._setDocument(this, null, null));
        return nodes;
    }

    async evaluate(script: Script): Promise<void> {
        for (let p = 0; p < this.pages.length; p++) {
            script.resetPageContext();
            const page = this.pages[p];
            for (let f = 0; f < page.fragments.length; f++) {
                const fragment = page.fragments[f];
                if (fragment instanceof CodeFragment) {
                    try {
                        await fragment.evaluate(script);
                    } catch (error) {
                        throw new Error(`${ error.message } [${ page.filename }]`)
                    }
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

        const pages = readdir(path);
        pages.push(Page.searchPage(resolve(path)));

//        console.log("Processing Directroy:", resolve(path));
        return new Document(resolve(path), pages, config);
    }
}

