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
var _page, _autoLink, _parent, _source, _code, _toc, _document, _pathCache, _links, _toc_1;
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = require("path");
const markdown_1 = require("./markdown");
const Directives = Object.freeze({
    section: { title: true, exts: ["inherit", "note", "nav", "src"] },
    subsection: { title: true, exts: ["inherit", "note", "src"] },
    heading: { title: true, exts: ["inherit", "note", "src"] },
    definition: { body: true, title: true, exts: [] },
    property: { body: true, exts: ["src"] },
    code: { title: true, exts: [] },
    toc: { body: true, exts: [] },
    "null": { body: true, exts: [] },
    note: { body: true, heading: true, exts: [] },
    warning: { body: true, heading: true, exts: [] }
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
        this.body.forEach((n) => n._setDocument(document));
        if (this.title) {
            this.title._setDocument(document);
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
                return new CodeFragment(value);
            case FragmentType.TOC:
                return new TocFragment(body);
        }
        return new Fragment(tag, value, markdown_1.parseMarkdown(body));
    }
}
exports.Fragment = Fragment;
_page = new WeakMap(), _autoLink = new WeakMap(), _parent = new WeakMap();
class CodeFragment extends Fragment {
    constructor(filename) {
        super(FragmentType.CODE, filename, []);
        _source.set(this, void 0);
        _code.set(this, void 0);
        this._filename = filename;
    }
    get filename() {
        return path_1.resolve(path_1.dirname(this.page.filename), this._filename);
    }
    get source() {
        if (__classPrivateFieldGet(this, _source) == null) {
            __classPrivateFieldSet(this, _source, fs_1.default.readFileSync(this.filename).toString());
        }
        return __classPrivateFieldGet(this, _source);
    }
    get language() {
        switch (path_1.extname(this.filename)) {
            case ".js": return "javascript";
            case ".txt": return "text";
            case ".source": return "source";
        }
        return "unknown";
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
                __classPrivateFieldSet(this, _code, Object.freeze(yield script.run(this.filename, this.source)));
            }
        });
    }
    get evaluated() {
        return (__classPrivateFieldGet(this, _code) != null);
    }
}
exports.CodeFragment = CodeFragment;
_source = new WeakMap(), _code = new WeakMap();
class TocFragment extends Fragment {
    constructor(body) {
        super(FragmentType.TOC, "", []);
        this.items = Object.freeze(body.split("\n").map((l) => l.trim()).filter((l) => l.length));
    }
}
exports.TocFragment = TocFragment;
class Page {
    constructor(filename, fragments) {
        _toc.set(this, void 0);
        _document.set(this, void 0);
        _pathCache.set(this, void 0);
        this.filename = path_1.resolve(filename);
        this.fragments = Object.freeze(fragments);
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
                        throw new Error(`missing toc page %{ JSON.stringify(item) }`);
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
            __classPrivateFieldSet(this, _pathCache, path);
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
            }
            else {
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
                    body = [];
                }
                // Continue the fragment (might be new)
                body.push(line);
            }
        });
        // Commit any left over started fragment
        if (tag) {
            fragments.push(Fragment.from(tag, value, body.join("\n").trim()));
        }
        return new Page(path_1.resolve(filename), fragments);
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
                    const existing = links[fragment.link];
                    if (existing) {
                        // @TODO: Fill this in with sources
                        throw new Error("duplicate link");
                    }
                    links[fragment.link] = Object.freeze({
                        name: fragment.value.replace(/(\*\*|\/\/|__|\^\^|``)/g, ""),
                        source: page.filename,
                        url: (page.path + ((fragment.tag !== FragmentType.SECTION) ? ("#" + fragment.link) : ""))
                    });
                }
            });
        });
        __classPrivateFieldSet(this, _links, Object.freeze(links));
    }
    get copyright() {
        return this.parseMarkdown(this.config.copyright);
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
    get toc() {
        if (__classPrivateFieldGet(this, _toc_1) == null) {
            const rootPage = this.getPage("/");
            if (rootPage == null) {
                throw new Error("missing root page");
            }
            __classPrivateFieldSet(this, _toc_1, rootPage.toc.filter((e) => (e.path.indexOf("#") === -1)));
        }
        return __classPrivateFieldGet(this, _toc_1);
    }
    parseMarkdown(markdown, styles) {
        const nodes = markdown_1.parseMarkdown(markdown, styles);
        nodes.forEach((n) => n._setDocument(this));
        return nodes;
    }
    evaluate(script) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let p = 0; p < this.pages.length; p++) {
                const page = this.pages[p];
                for (let f = 0; f < page.fragments.length; f++) {
                    const fragment = page.fragments[f];
                    if (fragment instanceof CodeFragment) {
                        yield fragment.evaluate(script);
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
