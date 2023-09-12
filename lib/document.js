/**
 *  Normal Pages
 *  - Section
 *    - Subsection
 *      - CodeContent | BodyContent
 *
 *  API Pages
 *  - Section
 *    - Subsection | Exported
 *      - Exported
 */
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
var _Fragment_exts, _SectionWithBody_parent, _SectionWithBody_children, _Section_path, _Section_mtime;
import fs from "fs";
import { extname, relative, resolve } from "path";
import { Config } from "./config.js";
import { parseBlock, parseMarkdown, StylesAll, Node, TextNode } from "./markdown.js";
import { Script } from "./script.js";
import { ApiDocument, ApiSubsection, Export, ObjectExport, ReturnsExport } from "./jsdocs.js";
const Directives = Object.freeze({
    section: { title: "markdown", exts: ["inherit", "note", "nav", "src", "priority"] },
    subsection: { title: "markdown", exts: ["inherit", "note", "src"] },
    heading: { title: "markdown", exts: ["inherit", "note", "src"] },
    code: { title: "text", exts: ["lang"] },
    "null": { title: "none", exts: [] },
    "export": { title: "text", exts: [] },
    //note:        { heading: "text, exts: [ ] },
    //warning:     { heading: "text", exts: [ ] },
    //table:       { heading: "text", exts: [ "style" ] }, // body is specially handled
});
export class Fragment {
    constructor(directive, value) {
        _Fragment_exts.set(this, void 0);
        this.directive = directive;
        this.value = value;
        __classPrivateFieldSet(this, _Fragment_exts, new Map(), "f");
        while (true) {
            const match = value.match(/^(.*)@([a-z0-9_]*)<((?:[^>]|\\>)*)>\s*$/i);
            if (!match) {
                break;
            }
            if (match[2]) {
                const extName = match[2].toLowerCase();
                if (Directives[directive].exts.indexOf(extName) === -1) {
                    throw new Error(`_${directive}: does not support ${JSON.stringify(extName.toUpperCase())} extension`);
                }
                __classPrivateFieldGet(this, _Fragment_exts, "f").set(extName, match[3].replace("\\>", ">").replace("\\<", "<"));
            }
            else {
                this.anchor = match[3];
            }
            value = match[1].trim();
        }
        if (directive === "" || Directives[directive].title === "text") {
            this.titleNode = new TextNode(value);
        }
        else if (Directives[directive].title === "markdown") {
            this.titleNode = parseBlock(value, StylesAll);
        }
        else {
            this.titleNode = new TextNode(value.trim());
        }
    }
    get title() { return this.titleNode.textContent; }
    getExtension(key) {
        return __classPrivateFieldGet(this, _Fragment_exts, "f").has(key) ? __classPrivateFieldGet(this, _Fragment_exts, "f").get(key) : null;
    }
}
_Fragment_exts = new WeakMap();
let nextId = 1;
export class SectionWithBody extends Fragment {
    constructor(directive, value) {
        super(directive, value);
        _SectionWithBody_parent.set(this, void 0);
        _SectionWithBody_children.set(this, void 0);
        this.body = [];
        __classPrivateFieldSet(this, _SectionWithBody_parent, null, "f");
        __classPrivateFieldSet(this, _SectionWithBody_children, [], "f");
        this.sid = `${directive}_${nextId++}`;
    }
    get parent() { return __classPrivateFieldGet(this, _SectionWithBody_parent, "f"); }
    get depth() {
        return this.parent.depth + 1;
    }
    get children() { return __classPrivateFieldGet(this, _SectionWithBody_children, "f").slice(); }
    _addChild(child) {
        if (child.parent) {
            throw new Error("already has a parent");
        }
        __classPrivateFieldGet(this, _SectionWithBody_children, "f").push(child);
        child._setParent(this);
    }
    _setParent(parent) {
        if (__classPrivateFieldGet(this, _SectionWithBody_parent, "f")) {
            throw new Error("got parent");
        }
        __classPrivateFieldSet(this, _SectionWithBody_parent, parent, "f");
    }
    get recursive() { return true; }
    get length() { return this.children.length; }
    [(_SectionWithBody_parent = new WeakMap(), _SectionWithBody_children = new WeakMap(), Symbol.iterator)]() {
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: this.children[index++], done: false };
                }
                return { value: undefined, done: true };
            }
        };
    }
    evaluate(config) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const content of this.body) {
                if (!(content instanceof CodeContent)) {
                    continue;
                }
                yield content.evaluate(config);
            }
            for (const sub of this.children) {
                yield sub.evaluate(config);
            }
        });
    }
    get text() {
        return [
            this.body.map((c) => c.text).join("\n"),
            this.children.map((c) => c.text).join("\n"),
        ].join("\n\n");
    }
}
export class Section extends SectionWithBody {
    constructor(value, path) {
        super("section", value);
        _Section_path.set(this, void 0);
        _Section_mtime.set(this, void 0);
        __classPrivateFieldSet(this, _Section_path, path, "f");
        __classPrivateFieldSet(this, _Section_mtime, 0, "f");
        this.dependencies = [];
    }
    get path() { return __classPrivateFieldGet(this, _Section_path, "f"); }
    get mtime() { return __classPrivateFieldGet(this, _Section_mtime, "f"); }
    _setMtime(mtime) { __classPrivateFieldSet(this, _Section_mtime, mtime, "f"); }
    get priority() {
        const priority = this.getExtension("priority");
        if (priority == null) {
            return 0;
        }
        return parseInt(priority);
    }
    get depth() {
        return 0; //this.path.split("/").length - 1;
    }
    get navTitle() {
        const nav = this.getExtension("nav");
        if (nav != null) {
            return nav;
        }
        return this.title;
    }
    static fromContent(content, path) {
        let section = null;
        let subsection = null;
        let inCode = false;
        let tag = "", value = "";
        let body = [];
        const flushBody = () => {
            if (tag === "") {
                return;
            }
            let content = body.join("\n");
            if (tag !== "code") {
                content = content.trim();
            }
            if (tag === "section") {
                if (section != null) {
                    throw new Error("duplicate section");
                }
                section = new Section(value, path);
                section.body.push(Content.nullContent(content));
            }
            else if (tag === "subsection") {
                if (section == null) {
                    throw new Error("missing section");
                }
                subsection = new Subsection(value, section.path);
                subsection.body.push(Content.nullContent(content));
                section._addChild(subsection);
            }
            else {
                const cont = Content.fromContent(tag, value, content, path);
                if (subsection) {
                    subsection.body.push(cont);
                }
                else if (section) {
                    section.body.push(cont);
                }
                else {
                    throw new Error("missing section");
                }
            }
        };
        for (let line of content.split("\n")) {
            // Found a directive line
            const match = line.match(/^_([a-z]*)\s*:(.*)$/i);
            if (match) {
                flushBody();
                tag = match[1].trim().toLowerCase();
                if (!Directives[tag]) {
                    throw new Error(`unknown directive: ${tag}`);
                }
                value = match[2].trim();
                body = [];
                inCode = (tag === "code");
            }
            else if (inCode) {
                // In a code block; allows escaping am underscore as the
                // first character in a code block.
                if (line.startsWith("\\_")) {
                    line = line.substring(1);
                }
                body.push(line);
            }
            else {
                body.push(line.trim());
            }
        }
        flushBody();
        return section;
    }
    static fromApi(api, path) {
        let value = api.title;
        if (api.anchor) {
            value += ` @<${api.anchor}>`;
        }
        value += ` @nav<${api.navTitle}>`;
        const section = new Section(value, path);
        section.body.push(Content.nullContent(api.flatworm));
        api.dependencies.forEach((d) => section.dependencies.push(d));
        for (const ex of api.examples) {
            const lines = ex.split("\n");
            section.body.push(new CodeContent(lines[0], lines.slice(1).join("\n"), (section.path + "/example.js")));
        }
        for (const apiSub of api.objs) {
            if (apiSub instanceof ApiSubsection) {
                let value = apiSub.title;
                if (apiSub.anchor) {
                    value += ` @<${apiSub.anchor}>`;
                }
                const subsection = new Subsection(value, section.path);
                subsection.body.push(Content.nullContent(apiSub.flatworm));
                for (const ex of apiSub.examples) {
                    const lines = ex.split("\n");
                    section.body.push(new CodeContent(lines[0], lines.slice(1).join("\n"), (path + "/example.js")));
                }
                for (const ex of apiSub.objs) {
                    subsection._addChild(new Exported(ex, section.path));
                }
                section._addChild(subsection);
            }
            else if (apiSub instanceof Export) {
                section._addChild(new Exported(apiSub, section.path));
            }
            else {
                throw new Error("unsupported subsection");
            }
        }
        return section;
    }
}
_Section_path = new WeakMap(), _Section_mtime = new WeakMap();
export class Subsection extends SectionWithBody {
    constructor(value, parentPath) {
        super("subsection", value);
        this.parentPath = parentPath;
    }
    get path() {
        let path = "";
        if (this.parentPath) {
            path += this.parentPath + "/";
        }
        path += `#${this.anchor || this.sid}`;
        return path;
    }
}
export class Exported extends SectionWithBody {
    constructor(exported, parentPath) {
        let title = exported.name;
        if (exported instanceof ReturnsExport && exported.parent) {
            title = `${exported.prefix}.${title}`;
        }
        const value = `${title} @<${exported.id}>`;
        super("export", value);
        this.exported = exported;
        this.parentPath = parentPath;
        this.body.push(new BodyContent("null", "", parseMarkdown(exported.flatworm)));
        if (exported instanceof ObjectExport) {
            for (const child of exported) {
                this._addChild(new Exported(child, this.parentPath));
            }
        }
    }
    get examples() {
        return this.exported.examples();
    }
    get path() {
        if (this.anchor == null) {
            throw new Error(`anchor required for path: ${this.value}`);
        }
        return `${this.parentPath}/#${this.anchor}`;
    }
    get recursive() {
        return (this.exported instanceof ObjectExport);
    }
    evaluate(config) {
        const _super = Object.create(null, {
            evaluate: { get: () => super.evaluate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            _super.evaluate.call(this, config);
            yield this.exported.evaluate(config);
        });
    }
}
/*
export class ExportedContent extends Content implements Iterable<ExportedContent> {

    readonly exported: Export;
    readonly parentPath: string;

    readonly body: Array<BodyContent>;
    readonly examples: Array<CodeContent>;

    constructor(exported: Export, parentPath: string) {
        const value = `${ exported.name } @<${ exported.id }>`;
        super("", value);
        this.exported = exported
        this.parentPath = parentPath;

        this.body = [ new BodyContent("null", "", parseMarkdown(exported.flatworm)) ];
        this.examples = [ ];
    }

    get length(): number {
        let count = 0;
        if (this.exported instanceof ClassExport) {
            count += this.exported.staticMethods.size;
        }
        if (this.exported instanceof ObjectExport) {
            count += this.exported.methods.size;
            count += this.exported.properties.size;
        }
        return count;
    }

    [Symbol.iterator](): Iterator<ExportedContent> {
        const exported = this.exported;

        const items: Array<Export> = [ ];
        if (exported instanceof ClassExport) {
            for (const [ , ex ] of exported.staticMethods) { items.push(ex); }
        }
        if (exported instanceof ObjectExport) {
            for (const [ , ex ] of exported.methods) { items.push(ex); }
            for (const [ , ex ] of exported.properties) { items.push(ex); }
        }

        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    const value = new ExportedContent(items[index++], this.parentPath);
                    return { value, done: false };
                }
                return { value: undefined, done: true };
            }
        };
    }


    get text(): string {
        return this.body.map((c) => c.text).join("\n")
    }

    async evaluate(config: Config): Promise<void> {
        await this.exported.evaluate(config);
    }
}
*/
let nextSid = 1;
export class Content extends Fragment {
    constructor(tag, value) {
        if (value.indexOf("@<") === -1) {
            value += ` @<cid_${nextSid++}>`;
        }
        super(tag, value);
        this.tag = tag;
    }
    static nullContent(body) {
        return Content.fromContent("null", "", body);
    }
    static fromContent(tag, value, body, filename) {
        // @TODO: handle special Contents here
        if (tag === "code") {
            return new CodeContent(value, body, (filename != null) ? (filename + "/code.js") : "%unknown%");
        }
        return new BodyContent(tag, value, parseMarkdown(body));
    }
    static fromFlatworm(flatworm) {
        console.log("@TODO: fromFlatworm");
        return [];
    }
}
export class BodyContent extends Content {
    constructor(tag, value, body) {
        super(tag, value);
        this.body = body;
    }
    evaluate(config) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    get text() {
        return this.body.map((c) => c.textContent).join("\n");
    }
}
export class CodeContent extends Content {
    constructor(value, source, path) {
        super("code", value);
        const lines = source.split("\n");
        while (lines.length && lines[0].trim() === "") {
            lines.shift();
        }
        while (lines.length && lines[lines.length - 1].trim() === "") {
            lines.pop();
        }
        this.source = lines.join("\n");
        this.script = new Script(this.source, this.language, path);
        this.filename = this.script.filename;
    }
    get text() {
        return this.source;
    }
    get language() {
        return this.getExtension("lang");
    }
    evaluate(config) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.script.evaluate(config);
        });
    }
}
//export class TableContent extends Content {
//}
export class Document {
    constructor(config) {
        this.config = config;
        this.sections = [];
    }
    get length() { return this.sections.length; }
    [Symbol.iterator]() {
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: this.sections[index++], done: false };
                }
                return { value: undefined, done: true };
            }
        };
    }
    evaluate() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const section of this.sections) {
                yield section.evaluate(this.config);
            }
        });
    }
    static fromPath(path) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Document.fromConfig(yield Config.fromPath(path));
        });
    }
    static fromConfig(config) {
        const doc = new Document(config);
        // Ingest all documentation sections
        const readdir = function (path) {
            const filenames = fs.readdirSync(path);
            for (const _filename of filenames) {
                const filename = resolve(path, _filename);
                const stat = fs.statSync(filename);
                if (stat.isDirectory()) {
                    readdir(filename);
                }
                else if (extname(filename) === ".wrm") {
                    let path = relative(config.docRoot, filename);
                    if (path.endsWith("index.wrm")) {
                        path = path.substring(0, path.length - 9);
                    }
                    else {
                        path = path.substring(0, path.length - 4);
                    }
                    if (path[path.length - 1] === "/") {
                        path = path.substring(0, path.length - 1);
                    }
                    const content = fs.readFileSync(filename).toString();
                    const section = Section.fromContent(content, path);
                    section.dependencies.push(filename);
                    doc.sections.push(section);
                }
            }
        };
        readdir(config.docRoot);
        // Get the API sections
        const api = new ApiDocument(config.codeRoot);
        for (const [path, apiSection] of api.toc) {
            const section = Section.fromApi(apiSection, path);
            doc.sections.push(section);
        }
        // Build a lookup table (for looking up priority)
        const lookup = doc.sections.reduce((accum, section) => {
            accum.set(section.path, section);
            return accum;
        }, (new Map()));
        // Sort the sections based on their tree-hierarchy
        doc.sections.sort((a, b) => {
            const compsA = a.path.split("/"), compsB = b.path.split("/");
            // The root page (i.e. "") always comes first
            if (compsA.length === 1 && compsA[0] === "") {
                return -1;
            }
            if (compsB.length === 1 && compsB[0] === "") {
                return 1;
            }
            // Compare each component of the hierarchy
            let prefix = "";
            while (compsA.length && compsB.length) {
                const compA = compsA.shift(), compB = compsB.shift();
                let cmp = compA.localeCompare(compB);
                // They're the same; move to the next component
                if (cmp === 0) {
                    prefix += compA + "/";
                    continue;
                }
                // If a Section has higher priority, use it.
                const priorityA = lookup.get(`${prefix}${compA}`).priority;
                const priorityB = lookup.get(`${prefix}${compB}`).priority;
                const priorityCmp = priorityB - priorityA;
                if (priorityCmp !== 0) {
                    return priorityCmp;
                }
                // Same priority; return the sort order
                return cmp;
            }
            // Whichever has components left is last
            return compsA.length - compsB.length;
        });
        // Attach the document to each markdown Node
        const setDoc = (item) => {
            if (item instanceof Node) {
                item._setDocument(doc);
                return;
            }
            setDoc(item.titleNode);
            if (item instanceof SectionWithBody) {
                item.body.forEach(setDoc);
                item.children.forEach(setDoc);
            }
            if (item instanceof BodyContent) {
                item.body.forEach(setDoc);
            }
        };
        doc.sections.forEach(setDoc);
        const now = (new Date()).getTime();
        doc.sections.forEach((d) => { d._setMtime(now); });
        return doc;
    }
    populateMtime() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = (new Date()).getTime();
            const tsCache = new Map();
            const getTs = (path) => __awaiter(this, void 0, void 0, function* () {
                let ts = tsCache.get(path);
                if (ts == null) {
                    ts = yield this.config.getTimestamp(path);
                    if (ts == null) {
                        ts = -1;
                    }
                    tsCache.set(path, ts);
                }
                return ts;
            });
            const getGenDate = function (deps) {
                return __awaiter(this, void 0, void 0, function* () {
                    let latest = -1;
                    for (const dep of deps) {
                        const ts = yield getTs(dep);
                        if (ts > latest) {
                            latest = ts;
                        }
                    }
                    if (latest === -1) {
                        return now;
                    }
                    return latest;
                });
            };
            for (const section of this) {
                section._setMtime(yield getGenDate(section.dependencies));
            }
        });
    }
    getLinkName(anchor) {
        return "@TODO";
    }
    getLinkUrl(anchor) {
        return "@TODO";
    }
}
//# sourceMappingURL=document.js.map