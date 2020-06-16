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
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _page, _autoLink, _parent, _code, _cells, _toc, _document, _pathCache, _links, _toc_1;
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = require("path");
const markdown_1 = require("./markdown");
/*
Maybe?
enum TitleType {
    NONE = null,
    MARKDOWN = "markdown",
    TEXT = "text",
};
*/
const Directives = Object.freeze({
    section: { title: true, exts: ["inherit", "note", "nav", "src"] },
    subsection: { title: true, exts: ["inherit", "note", "src"] },
    heading: { title: true, exts: ["inherit", "note", "src"] },
    definition: { title: true, exts: [] },
    property: { exts: ["src"] },
    code: { heading: true, exts: ["lang"] },
    toc: { exts: [] },
    "null": { exts: [] },
    note: { heading: true, exts: [] },
    warning: { heading: true, exts: [] },
    table: { heading: true, exts: ["style"] },
});
var FragmentType;
(function (FragmentType) {
    FragmentType["SECTION"] = "section";
    FragmentType["SUBSECTION"] = "subsection";
    FragmentType["HEADING"] = "heading";
    FragmentType["DEFINITION"] = "definition";
    FragmentType["PROPERTY"] = "property";
    FragmentType["NOTE"] = "note";
    FragmentType["WARNING"] = "warning";
    FragmentType["CODE"] = "code";
    FragmentType["NULL"] = "null";
    FragmentType["TOC"] = "toc";
    FragmentType["TABLE"] = "table";
})(FragmentType = exports.FragmentType || (exports.FragmentType = {}));
;
function getFragmentType(name) {
    if (!Directives[name]) {
        throw new Error("unknown fragment type: " + name);
    }
    return name;
}
function namify(words) {
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
class Fragment {
    constructor(tag, value, body) {
        // The Page that contains this
        _page.set(this, void 0);
        // An automatically generated  link target for this
        _autoLink.set(this, void 0);
        // The closest heading, subsection or section Fragment that contains this
        _parent.set(this, void 0);
        this.tag = tag;
        this.body = Object.freeze(body);
        const exts = {};
        while (true) {
            const match = value.match(/^(.*)@([a-z0-9_]*)<((?:[^>]|\\>)*)>\s*$/i);
            if (!match) {
                break;
            }
            if (match[2]) {
                const extName = match[2].toLowerCase();
                if (Directives[tag].exts.indexOf(extName) === -1) {
                    throw new Error(`_${tag}: does not support ${JSON.stringify(extName.toUpperCase())} extension`);
                }
                exts[extName] = match[3].replace("\\>", ">").replace("\\<", "<");
            }
            else {
                this.link = match[3];
            }
            value = match[1].trim(); //this.value.substring(0, this.value.indexOf("<")).trim();
        }
        this.value = value.trim();
        if (this.tag === FragmentType.PROPERTY) {
            let sig = this.value;
            const isConstructor = (sig.substring(0, 4) === "new ");
            if (isConstructor) {
                sig = sig.substring(4).trim();
            }
            const comps = sig.replace(/\s/g, "").split("=>");
            if (comps.length > 2) {
                throw new Error(`unexpected property arrow ${JSON.stringify(sig)}`);
            }
            const match = comps[0].match(/^([^\x5d(]+)(\([^)]*\))?\s*$/);
            if (!match) {
                throw new Error(`invalid function definition: ${JSON.stringify(sig)}`);
            }
            const name = match[1].replace(/\s*/g, "");
            let params = match[2] || null;
            if (params) {
                params = params.replace(/([,=\x5b\x5d()])/g, (all, symbol) => {
                    return " " + symbol + " ";
                }).replace(/\s+/g, " ").trim();
            }
            let ret = comps[1];
            if (ret) {
                ret = ret.replace(/>\s*/g, " >").replace(/<\s*/g, "< ").replace(/\|/g, " | ").replace(/\s+/g, " ").trim();
            }
            const returns = (ret ? markdown_1.parseBlock(ret, [markdown_1.MarkdownStyle.LINK]) : null);
            this.title = new markdown_1.PropertyNode(isConstructor, name, params, returns);
        }
        else if (Directives[tag].title) {
            this.title = markdown_1.parseBlock(this.value, markdown_1.StylesAll);
        }
        else if (Directives[tag].heading) {
            this.title = new markdown_1.TextNode(this.value);
        }
        else {
            if (this.value.trim() !== "") {
                throw new Error(`_${tag}: does not support VALUE`);
            }
            this.title = null;
        }
        this.extensions = Object.freeze(exts);
    }
    get page() { return __classPrivateFieldGet(this, _page); }
    get autoLink() { return __classPrivateFieldGet(this, _autoLink); }
    get parent() { return __classPrivateFieldGet(this, _parent); }
    _setDocument(document) {
        this.body.forEach((n) => n._setDocument(document, this.page, this));
        if (this.title) {
            this.title._setDocument(document, this.page, this);
        }
    }
    _setPage(page, parents) {
        if (__classPrivateFieldGet(this, _page)) {
            throw new Error("parent already set");
        }
        __classPrivateFieldSet(this, _page, page);
        // Set the immediate parent fragmet
        if (parents) {
            __classPrivateFieldSet(this, _parent, parents.filter((p) => (p != null)).pop());
        }
        else {
            __classPrivateFieldSet(this, _parent, null);
        }
        // Compute the autoLink from the hierarchal-parent fragments
        const components = [];
        (parents || []).forEach((fragment) => {
            if (!fragment) {
                return;
            }
            components.push(fragment.link || namify(fragment.value));
        });
        components.push(this.link || namify(this.value));
        __classPrivateFieldSet(this, _autoLink, components.join("--"));
    }
    getExtension(name) {
        const result = this.extensions[name.toLowerCase()];
        if (result == null) {
            return null;
        }
        return result;
    }
    static from(tag, value, body) {
        // Some special cases
        switch (tag) {
            case FragmentType.CODE:
                return new CodeFragment(value, body);
            case FragmentType.TABLE:
                return new TableFragment(value, body);
            case FragmentType.TOC:
                return new TocFragment(body);
        }
        return new Fragment(tag, value, markdown_1.parseMarkdown(body));
    }
}
exports.Fragment = Fragment;
_page = new WeakMap(), _autoLink = new WeakMap(), _parent = new WeakMap();
class CodeFragment extends Fragment {
    constructor(heading, source) {
        super(FragmentType.CODE, heading, [new markdown_1.TextNode(source)]);
        _code.set(this, void 0);
        this.heading = heading;
        const lines = source.split("\n");
        while (lines.length && lines[0].trim() === "") {
            lines.shift();
        }
        while (lines.length && lines[lines.length - 1].trim() === "") {
            lines.pop();
        }
        this.source = lines.join("\n");
    }
    get language() {
        return this.getExtension("lang");
    }
    get code() {
        if (__classPrivateFieldGet(this, _code) == null) {
            throw new Error("CodeFragment must be evaluate to access code");
        }
        return __classPrivateFieldGet(this, _code);
    }
    evaluate(script) {
        return __awaiter(this, void 0, void 0, function* () {
            if (__classPrivateFieldGet(this, _code)) {
                throw new Error("CodeFragment already evaluated");
            }
            if (this.language === "javascript") {
                __classPrivateFieldSet(this, _code, Object.freeze(yield script.run("script.js", this.source)));
            }
            else if (this.language === "script") {
                __classPrivateFieldSet(this, _code, Object.freeze(this.source.split("\n").map((line) => {
                    let classes = [];
                    const check = line.replace(/\s/g, "");
                    if (check.match(/^\/\/!/)) {
                        classes.push("result");
                        classes.push("ok");
                        line = line.replace(/!/, "");
                    }
                    else if (check.match(/^\/\//)) {
                        classes.push("comment");
                    }
                    return { classes: classes, content: line };
                })));
            }
        });
    }
    get evaluated() {
        return (__classPrivateFieldGet(this, _code) != null);
    }
}
exports.CodeFragment = CodeFragment;
_code = new WeakMap();
class TocFragment extends Fragment {
    constructor(body) {
        super(FragmentType.TOC, "", []);
        this.items = Object.freeze(body.split("\n").map((l) => l.trim()).filter((l) => l.length));
    }
}
exports.TocFragment = TocFragment;
function getCellName(row, col) {
    return `${row}x${col}`;
}
var TableStyle;
(function (TableStyle) {
    TableStyle["MINIMAL"] = "minimal";
    TableStyle["COMPACT"] = "compact";
    TableStyle["WIDE"] = "wide";
    TableStyle["FULL"] = "full";
})(TableStyle = exports.TableStyle || (exports.TableStyle = {}));
;
const TableStyles = {
    minimal: true,
    compact: true,
    wide: true,
    full: true
};
class TableFragment extends Fragment {
    constructor(value, body) {
        super(FragmentType.TABLE, value, []);
        _cells.set(this, void 0);
        __classPrivateFieldSet(this, _cells, {});
        const style = this.getExtension("style");
        if (style && !TableStyles[style]) {
            throw new Error(`unknown table style ${JSON.stringify(style)}`);
        }
        const vars = {};
        const table = [];
        {
            let currentVar = null;
            body.split("\n").forEach((line) => {
                line = line.trim();
                if (line === "") {
                    return;
                }
                // Decalre a new variable
                const matchVar = line.match(/^(\$[a-z][a-z0-9]*):(.*)$/i);
                if (matchVar) {
                    currentVar = matchVar[1];
                    if (vars[currentVar] != null) {
                        throw new Error(`duplicate variable "${currentVar}"`);
                    }
                    vars[currentVar] = matchVar[2];
                    // Continue the table...
                }
                else if (line[0] === "|") {
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
                            if (ri === 0) {
                                throw new Error("cannot row extend top cells");
                            }
                            const baseCol = table[ri - 1].filter((c) => (c.col === ci))[0];
                            if (baseCol == null) {
                                throw new Error(`row extended cell column mismatch`);
                            }
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
                        let align = markdown_1.CellAlign.CENTER;
                        if (cell.trim() !== "") {
                            if (cell.match(/^(\s*)/)[1].length <= 1) {
                                align = markdown_1.CellAlign.LEFT;
                            }
                            else if (cell.match(/(\s*)$/)[1].length <= 1) {
                                align = markdown_1.CellAlign.RIGHT;
                            }
                        }
                        const result = {
                            align: align,
                            col: ci,
                            cols: cols,
                            content: cell.trim(),
                            row: ri,
                            rows: 1
                        };
                        ci += cols;
                        return result;
                    }));
                    // Continue a variable's content
                }
                else {
                    if (currentVar == null) {
                        throw new Error(`invalid table row ${JSON.stringify(line)}`);
                    }
                    vars[currentVar] += " " + line;
                }
            });
        }
        // Simplify all the varaibles by trimming unnecessary whitespace
        for (const key in vars) {
            vars[key] = vars[key].replace(/\s+/g, " ").trim();
        }
        // Substitute variables and ensure the columns counts are consistent
        const cols = table.reduce((accum, row, ri) => {
            let ci = 0;
            const cols = row.reduce((accum, col) => {
                // Substitute variables
                const value = vars[col.content];
                if (value != null) {
                    col.content = value;
                }
                // Either create a new cell or reference the old one
                let cell = null;
                if (col.row !== ri) {
                    cell = __classPrivateFieldGet(this, _cells)[getCellName(ri - 1, ci)];
                }
                else {
                    cell = new markdown_1.CellNode(ri, ci, col.align, col.rows, col.cols, [markdown_1.parseBlock(col.content, markdown_1.StylesInline)]);
                }
                // Fill the cell across its columns
                for (let i = 0; i < col.cols; i++) {
                    __classPrivateFieldGet(this, _cells)[getCellName(ri, ci)] = cell;
                    ci++;
                }
                // Count the total number of columns
                return accum + col.cols;
            }, 0);
            // Check the number of columns is consistent
            if (accum != null && accum !== cols) {
                throw new Error(`bad table column count (row[${ri}] = ${accum}, row[${ri + 1}] = ${cols})`);
            }
            return cols;
        }, null);
        this.cols = cols;
        this.rows = table.length;
    }
    get style() {
        return (this.getExtension("style")) || TableStyle.MINIMAL;
    }
    getCell(row, col) {
        const cell = this.getParentCell(row, col);
        if (cell.row !== row || cell.col !== col) {
            return null;
        }
        return cell;
    }
    getParentCell(row, col) {
        return __classPrivateFieldGet(this, _cells)[getCellName(row, col)];
    }
    _setDocument(document) {
        super._setDocument(document);
        const done = {};
        Object.keys(__classPrivateFieldGet(this, _cells)).forEach((name) => {
            const cell = __classPrivateFieldGet(this, _cells)[name];
            if (done[cell.id]) {
                return;
            }
            done[cell.id] = true;
            cell._setDocument(document, this.page, this);
        });
    }
}
exports.TableFragment = TableFragment;
_cells = new WeakMap();
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
class Page {
    constructor(filename, fragments, options) {
        _toc.set(this, void 0);
        _document.set(this, void 0);
        _pathCache.set(this, void 0);
        this.filename = path_1.resolve(filename);
        this.fragments = Object.freeze(fragments);
        if (options == null) {
            options = {};
        }
        this.modifiedDate = (options.modifiedDate || (new Date()));
        let title = null;
        let sectionFragment = null;
        let parents = null;
        this.fragments.forEach((fragment) => {
            switch (fragment.tag) {
                case FragmentType.SECTION:
                    if (title != null) {
                        throw new Error("only one _section: allowed");
                    }
                    title = fragment.title.textContent;
                    sectionFragment = fragment;
                    fragment._setPage(this, null);
                    parents = [fragment];
                    break;
                case FragmentType.SUBSECTION:
                    if (parents == null) {
                        throw new Error("_subsection: missing _section:");
                    }
                    fragment._setPage(this, [parents[0]]);
                    parents = [parents[0], fragment];
                    break;
                case FragmentType.HEADING:
                    if (parents.length < 1) {
                        throw new Error("_heading: missing _subsection:");
                    }
                    fragment._setPage(this, [parents[0], parents[1]]);
                    while (parents.length > 2) {
                        parents.pop();
                    }
                    while (parents.length < 2) {
                        parents.push(null);
                    }
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
    get toc() {
        if (__classPrivateFieldGet(this, _toc) == null) {
            const toc = [];
            const tocFragments = this.fragments.filter((f) => (f.tag === FragmentType.TOC));
            if (tocFragments.length > 1) {
                throw new Error("only one _toc: allowed");
            }
            else if (tocFragments.length === 1) {
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
                        throw new Error(`missing toc page ${JSON.stringify(item)}`);
                    }
                    page.toc.forEach((item) => {
                        const depth = item.depth + 1;
                        const title = item.title;
                        const path = item.path;
                        toc.push(Object.freeze({ depth, title, path }));
                    });
                });
            }
            else {
                this.fragments.forEach((fragment) => {
                    let depth = 0;
                    let path = this.path;
                    switch (fragment.tag) {
                        case FragmentType.SECTION:
                            break;
                        case FragmentType.SUBSECTION:
                            depth = 1;
                            path += `#${fragment.link || fragment.autoLink}`;
                            break;
                        default:
                            return;
                    }
                    const title = fragment.title.textContent;
                    toc.push(Object.freeze({ depth, title, path }));
                });
            }
            __classPrivateFieldSet(this, _toc, Object.freeze(toc));
        }
        return __classPrivateFieldGet(this, _toc);
    }
    get document() { return __classPrivateFieldGet(this, _document); }
    get path() {
        if (!__classPrivateFieldGet(this, _pathCache)) {
            const basepath = __classPrivateFieldGet(this, _document).basepath;
            if (this.filename.substring(0, basepath.length) !== basepath) {
                throw new Error("path outside basepath");
            }
            let path = this.filename.substring(basepath.length);
            if (path_1.basename(path).split(".")[0] === "index") {
                path = path_1.dirname(path);
            }
            else {
                path = path_1.dirname(path) + "/" + path_1.basename(path).split(".")[0];
                if (path.substring(0, 2) === "//") {
                    path = path.substring(1);
                } //@TODO??
            }
            if (path.substring(path.length - 1) !== "/") {
                path += "/";
            }
            __classPrivateFieldSet(this, _pathCache, __classPrivateFieldGet(this, _document).config.getPath(path));
        }
        return __classPrivateFieldGet(this, _pathCache);
    }
    _setDocument(document) {
        if (__classPrivateFieldGet(this, _document)) {
            throw new Error("parent already set");
        }
        __classPrivateFieldSet(this, _document, document);
        this.fragments.forEach((f) => f._setDocument(document));
    }
    static fromFile(filename) {
        const fragments = [];
        let tag = null;
        let value = null;
        let body = [];
        let inCode = false;
        const mtime = fs_1.default.statSync(filename).mtime;
        // Parse out all the fragments
        const lines = fs_1.default.readFileSync(filename).toString().split("\n");
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
                body = [];
                inCode = (tag === FragmentType.CODE);
            }
            else if (inCode) {
                // The only escape in code blocks is a \_
                if (line.substring(0, 2) === "\\_") {
                    line = line.substring(1);
                }
                body.push(line);
            }
            else {
                body.push(line.trim());
            }
        });
        // Commit any left over started fragment
        if (tag) {
            fragments.push(Fragment.from(tag, value, body.join("\n").trim()));
        }
        return new Page(path_1.resolve(filename), fragments, { modifiedDate: mtime });
    }
}
exports.Page = Page;
_toc = new WeakMap(), _document = new WeakMap(), _pathCache = new WeakMap();
class Document {
    constructor(basepath, pages, config) {
        _links.set(this, void 0);
        _toc_1.set(this, void 0);
        this.basepath = basepath;
        this.pages = Object.freeze(pages);
        this.config = config;
        pages.forEach((page) => page._setDocument(this));
        const links = {};
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
        const uniquePaths = {};
        this.pages.forEach((page) => {
            // Make sure page paths are all unique (this can happen
            // if there is are two files "foo/index.wrm" and "foo.wrm")
            if (uniquePaths[page.path]) {
                throw new Error(`duplicate page path ${JSON.stringify(page.path)}`);
            }
            uniquePaths[page.path] = true;
            page.fragments.forEach((fragment) => {
                if (fragment.link) {
                    const pagePath = page.path + ((fragment.tag !== FragmentType.SECTION) ? ("#" + fragment.link) : "");
                    const existing = links[fragment.link];
                    if (existing) {
                        // @TODO: Fill this in with sources
                        throw new Error(`duplicate link ${JSON.stringify(fragment.link)} [ ${JSON.stringify(existing.url)}, ${JSON.stringify(pagePath)} ]`);
                    }
                    links[fragment.link] = Object.freeze({
                        name: fragment.value.replace(/(\*\*|\/\/|__|\^\^|``)/g, ""),
                        source: page.filename,
                        url: pagePath
                    });
                }
            });
        });
        __classPrivateFieldSet(this, _links, Object.freeze(links));
    }
    get names() {
        return Object.keys(__classPrivateFieldGet(this, _links));
    }
    getLinkName(name) {
        const link = __classPrivateFieldGet(this, _links)[name];
        if (link == null) {
            throw new Error(`missing link "${name}"`);
        }
        return link.name;
    }
    getLinkUrl(name) {
        const link = __classPrivateFieldGet(this, _links)[name];
        if (link == null) {
            throw new Error(`missing link "${name}"`);
        }
        return link.url;
    }
    getPage(path) {
        return this.pages.filter((p) => (p.path === path))[0] || null;
    }
    get copyright() {
        return this.parseMarkdown(this.config.copyright);
    }
    get toc() {
        if (__classPrivateFieldGet(this, _toc_1) == null) {
            const rootPage = this.getPage(this.config.getPath("/"));
            if (rootPage == null) {
                throw new Error("missing root page");
            }
            __classPrivateFieldSet(this, _toc_1, rootPage.toc.filter((e) => (e.path.indexOf("#") === -1)));
        }
        return __classPrivateFieldGet(this, _toc_1);
    }
    parseMarkdown(markdown, styles) {
        const nodes = markdown_1.parseMarkdown(markdown, styles);
        nodes.forEach((n) => n._setDocument(this, null, null));
        return nodes;
    }
    evaluate(script) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let p = 0; p < this.pages.length; p++) {
                const page = this.pages[p];
                for (let f = 0; f < page.fragments.length; f++) {
                    const fragment = page.fragments[f];
                    if (fragment instanceof CodeFragment) {
                        try {
                            yield fragment.evaluate(script);
                        }
                        catch (error) {
                            throw new Error(`${error.message} [${page.filename}]`);
                        }
                    }
                }
            }
        });
    }
    static fromFolder(path, config) {
        //if (!config) { config = Config.fromRoot(path); }
        const readdir = function (path, basepath) {
            if (!basepath) {
                basepath = path;
            }
            basepath = path_1.resolve(basepath);
            return fs_1.default.readdirSync(path).map((filename) => {
                const childpath = path_1.resolve(path, filename);
                const stat = fs_1.default.statSync(childpath);
                if (stat.isDirectory()) {
                    //                    console.log("Processing Directroy:", childpath);
                    return readdir(childpath, basepath);
                }
                else if (path_1.extname(childpath) === ".wrm") {
                    //                    console.log("  File:", childpath);
                    try {
                        return [Page.fromFile(childpath)];
                    }
                    catch (error) {
                        throw new Error(`${error.message} [${childpath}]`);
                    }
                }
                return [];
            }).reduce((accum, pages) => {
                pages.forEach((page) => { accum.push(page); });
                return accum;
            }, []);
        };
        //        console.log("Processing Directroy:", resolve(path));
        return new Document(path_1.resolve(path), readdir(path), config);
    }
}
exports.Document = Document;
_links = new WeakMap(), _toc_1 = new WeakMap();
