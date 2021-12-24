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
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _Fragment_page, _Fragment_autoLink, _Fragment_parent, _CodeFragment_code, _TableFragment_cells, _Page_toc, _Page_document, _Page_pathCache, _Document_links, _Document_toc;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Document = exports.Page = exports.TableFragment = exports.TableStyle = exports.TocFragment = exports.CodeFragment = exports.Fragment = exports.FragmentType = void 0;
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
    table: { heading: true, exts: ["style"] }, // body is specially handled
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
        _Fragment_page.set(this, void 0);
        // An automatically generated  link target for this
        _Fragment_autoLink.set(this, void 0);
        // The closest heading, subsection or section Fragment that contains this
        _Fragment_parent.set(this, void 0);
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
            const returns = (ret ? (0, markdown_1.parseBlock)(ret, [markdown_1.MarkdownStyle.LINK]) : null);
            this.title = new markdown_1.PropertyNode(isConstructor, name, params, returns);
        }
        else if (Directives[tag].title) {
            this.title = (0, markdown_1.parseBlock)(this.value, markdown_1.StylesAll);
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
    get page() { return __classPrivateFieldGet(this, _Fragment_page, "f"); }
    get autoLink() { return __classPrivateFieldGet(this, _Fragment_autoLink, "f"); }
    get parent() { return __classPrivateFieldGet(this, _Fragment_parent, "f"); }
    _setDocument(document) {
        this.body.forEach((n) => n._setDocument(document, this.page, this));
        if (this.title) {
            this.title._setDocument(document, this.page, this);
        }
    }
    _setPage(page, parents) {
        if (__classPrivateFieldGet(this, _Fragment_page, "f")) {
            throw new Error("parent already set");
        }
        __classPrivateFieldSet(this, _Fragment_page, page, "f");
        // Set the immediate parent fragmet
        if (parents) {
            __classPrivateFieldSet(this, _Fragment_parent, parents.filter((p) => (p != null)).pop(), "f");
        }
        else {
            __classPrivateFieldSet(this, _Fragment_parent, null, "f");
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
        __classPrivateFieldSet(this, _Fragment_autoLink, components.join("--"), "f");
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
        return new Fragment(tag, value, (0, markdown_1.parseMarkdown)(body));
    }
}
exports.Fragment = Fragment;
_Fragment_page = new WeakMap(), _Fragment_autoLink = new WeakMap(), _Fragment_parent = new WeakMap();
class CodeFragment extends Fragment {
    constructor(heading, source) {
        super(FragmentType.CODE, heading, [new markdown_1.TextNode(source)]);
        _CodeFragment_code.set(this, void 0);
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
        if (__classPrivateFieldGet(this, _CodeFragment_code, "f") == null) {
            throw new Error("CodeFragment must be evaluate to access code");
        }
        return __classPrivateFieldGet(this, _CodeFragment_code, "f");
    }
    evaluate(script) {
        return __awaiter(this, void 0, void 0, function* () {
            if (__classPrivateFieldGet(this, _CodeFragment_code, "f")) {
                throw new Error("CodeFragment already evaluated");
            }
            if (this.language === "javascript") {
                try {
                    let scriptName = (0, path_1.join)(this.page.filename, "script.js");
                    if (this.heading.trim()) {
                        let fragment = this.title.textContent;
                        fragment = fragment.replace(/[^a-z0-9]/ig, "-");
                        fragment = fragment.replace(/-+/g, "-");
                        fragment = fragment.replace(/(^-+)|(-+$)/g, "");
                        scriptName += "#" + fragment;
                    }
                    __classPrivateFieldSet(this, _CodeFragment_code, Object.freeze(yield script.run(scriptName, this.source)), "f");
                }
                catch (error) {
                    console.log(this, error);
                    throw error;
                }
            }
            else if (this.language === "script") {
                __classPrivateFieldSet(this, _CodeFragment_code, Object.freeze(this.source.split("\n").map((line) => {
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
                })), "f");
            }
        });
    }
    get evaluated() {
        return (__classPrivateFieldGet(this, _CodeFragment_code, "f") != null);
    }
}
exports.CodeFragment = CodeFragment;
_CodeFragment_code = new WeakMap();
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
        _TableFragment_cells.set(this, void 0);
        __classPrivateFieldSet(this, _TableFragment_cells, {}, "f");
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
                    cell = __classPrivateFieldGet(this, _TableFragment_cells, "f")[getCellName(ri - 1, ci)];
                }
                else {
                    cell = new markdown_1.CellNode(ri, ci, col.align, col.rows, col.cols, [(0, markdown_1.parseBlock)(col.content, markdown_1.StylesInline)]);
                }
                // Fill the cell across its columns
                for (let i = 0; i < col.cols; i++) {
                    __classPrivateFieldGet(this, _TableFragment_cells, "f")[getCellName(ri, ci)] = cell;
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
        return __classPrivateFieldGet(this, _TableFragment_cells, "f")[getCellName(row, col)];
    }
    _setDocument(document) {
        super._setDocument(document);
        const done = {};
        Object.keys(__classPrivateFieldGet(this, _TableFragment_cells, "f")).forEach((name) => {
            const cell = __classPrivateFieldGet(this, _TableFragment_cells, "f")[name];
            if (done[cell.id]) {
                return;
            }
            done[cell.id] = true;
            cell._setDocument(document, this.page, this);
        });
    }
}
exports.TableFragment = TableFragment;
_TableFragment_cells = new WeakMap();
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
        _Page_toc.set(this, void 0);
        _Page_document.set(this, void 0);
        _Page_pathCache.set(this, void 0);
        this.filename = (0, path_1.resolve)(filename);
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
    static searchPage(basepath) {
        return new Page((0, path_1.resolve)(basepath, "search"), [new Fragment(FragmentType.SECTION, "Search", [])]);
    }
    get toc() {
        if (__classPrivateFieldGet(this, _Page_toc, "f") == null) {
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
            __classPrivateFieldSet(this, _Page_toc, Object.freeze(toc), "f");
        }
        return __classPrivateFieldGet(this, _Page_toc, "f");
    }
    get document() { return __classPrivateFieldGet(this, _Page_document, "f"); }
    get path() {
        if (!__classPrivateFieldGet(this, _Page_pathCache, "f")) {
            const basepath = __classPrivateFieldGet(this, _Page_document, "f").basepath;
            if (this.filename.substring(0, basepath.length) !== basepath) {
                throw new Error("path outside basepath");
            }
            let path = this.filename.substring(basepath.length);
            if ((0, path_1.basename)(path).split(".")[0] === "index") {
                path = (0, path_1.dirname)(path);
            }
            else {
                path = (0, path_1.dirname)(path) + "/" + (0, path_1.basename)(path).split(".")[0];
                if (path.substring(0, 2) === "//") {
                    path = path.substring(1);
                } //@TODO??
            }
            if (path.substring(path.length - 1) !== "/") {
                path += "/";
            }
            __classPrivateFieldSet(this, _Page_pathCache, __classPrivateFieldGet(this, _Page_document, "f").config.getPath(path), "f");
        }
        return __classPrivateFieldGet(this, _Page_pathCache, "f");
    }
    _setDocument(document) {
        if (__classPrivateFieldGet(this, _Page_document, "f")) {
            throw new Error("parent already set");
        }
        __classPrivateFieldSet(this, _Page_document, document, "f");
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
        return new Page((0, path_1.resolve)(filename), fragments, { modifiedDate: mtime });
    }
}
exports.Page = Page;
_Page_toc = new WeakMap(), _Page_document = new WeakMap(), _Page_pathCache = new WeakMap();
class Document {
    constructor(basepath, pages, config) {
        _Document_links.set(this, void 0);
        _Document_toc.set(this, void 0);
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
        __classPrivateFieldSet(this, _Document_links, Object.freeze(links), "f");
    }
    get names() {
        return Object.keys(__classPrivateFieldGet(this, _Document_links, "f"));
    }
    getLinkName(name) {
        const link = __classPrivateFieldGet(this, _Document_links, "f")[name];
        if (link == null) {
            throw new Error(`missing link "${name}"`);
        }
        return link.name;
    }
    getLinkUrl(name) {
        const link = __classPrivateFieldGet(this, _Document_links, "f")[name];
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
        if (__classPrivateFieldGet(this, _Document_toc, "f") == null) {
            const rootPage = this.getPage(this.config.getPath("/"));
            if (rootPage == null) {
                throw new Error("missing root page");
            }
            __classPrivateFieldSet(this, _Document_toc, rootPage.toc.filter((e) => (e.path.indexOf("#") === -1)), "f");
        }
        return __classPrivateFieldGet(this, _Document_toc, "f");
    }
    parseMarkdown(markdown, styles) {
        const nodes = (0, markdown_1.parseMarkdown)(markdown, styles);
        nodes.forEach((n) => n._setDocument(this, null, null));
        return nodes;
    }
    evaluate(script) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let p = 0; p < this.pages.length; p++) {
                script.resetPageContext();
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
            basepath = (0, path_1.resolve)(basepath);
            return fs_1.default.readdirSync(path).map((filename) => {
                const childpath = (0, path_1.resolve)(path, filename);
                const stat = fs_1.default.statSync(childpath);
                if (stat.isDirectory()) {
                    //                    console.log("Processing Directroy:", childpath);
                    return readdir(childpath, basepath);
                }
                else if ((0, path_1.extname)(childpath) === ".wrm") {
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
        const pages = readdir(path);
        pages.push(Page.searchPage((0, path_1.resolve)(path)));
        //        console.log("Processing Directroy:", resolve(path));
        return new Document((0, path_1.resolve)(path), pages, config);
    }
}
exports.Document = Document;
_Document_links = new WeakMap(), _Document_toc = new WeakMap();
