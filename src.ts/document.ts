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

import fs from "fs";
import { extname, relative, resolve } from "path";

import { Config } from "./config.js";
import {
    parseBlock, parseMarkdown, StylesAll,
    Node, TextNode
} from "./markdown.js";
import { Script } from "./script.js";
import {
    ApiDocument, ApiSection, ApiSubsection,
    Export, ObjectExport, ReturnsExport
} from "./jsdocs.js";


type DirectiveInfo = {
    // Supports markdown title
    title?: "text" | "markdown" | "none",
    exts: Array<string>,     // Supported extension
};

const Directives: Readonly<{ [ tag: string ]: DirectiveInfo }> = Object.freeze({
    section:     { title: "markdown", exts: [ "inherit", "note", "nav", "src", "priority" ] },
    subsection:  { title: "markdown", exts: [ "inherit", "note", "src" ] },
    heading:     { title: "markdown", exts: [ "inherit", "note", "src" ] },
    code:        { title: "text",     exts: [ "lang" ] },  // body is specially handled
    "null":      { title: "none",     exts: [ ] },
    "export":    { title: "text",     exts: [ ] },
    //note:        { heading: "text, exts: [ ] },
    //warning:     { heading: "text", exts: [ ] },
    //table:       { heading: "text", exts: [ "style" ] }, // body is specially handled
});

export abstract class Fragment {
    readonly titleNode: Node;

    readonly directive: string;

    readonly value: string;
    readonly anchor: string;

    readonly #exts: Map<string, string>

    constructor(directive: string, value: string) {
        this.directive = directive;

        this.value = value;

        this.#exts = new Map();

        while (true) {
            const match = value.match(/^(.*)@([a-z0-9_]*)<((?:[^>]|\\>)*)>\s*$/i);
            if (!match) { break; }

            if (match[2]) {
                const extName = match[2].toLowerCase();
                if (Directives[directive].exts.indexOf(extName) === -1) {
                    throw new Error(`_${ directive }: does not support ${ JSON.stringify(extName.toUpperCase()) } extension`);
                }
                this.#exts.set(extName, match[3].replace("\\>", ">").replace("\\<", "<"));
            } else {
                this.anchor = match[3];
            }
            value = match[1].trim();
        }

        if (directive === "" || Directives[directive].title === "text") {
            this.titleNode = new TextNode(value);
        } else if (Directives[directive].title === "markdown") {
            this.titleNode = parseBlock(value, StylesAll);
        } else {
            this.titleNode = new TextNode(value.trim());
        }
    }

    get title(): string { return this.titleNode.textContent; }

    getExtension(key: string): null | string {
        return this.#exts.has(key) ? this.#exts.get(key): null;
    }
}

let nextId = 1;

export abstract class SectionWithBody<T extends Subsection | Exported = Subsection | Exported> extends Fragment implements Iterable<T> {
    readonly body: Array<Content>;

    #parent: null | SectionWithBody;
    #children: Array<T>;

    readonly sid: string;

    constructor(directive: string, value: string) {
        super(directive, value);

        this.body = [ ];
        this.#parent = null;
        this.#children = [ ];

        this.sid = `${ directive }_${ nextId++ }`;
    }

    abstract get path(): string;

    get parent(): null | SectionWithBody { return this.#parent; }

    get depth(): number {
        return this.parent.depth + 1;
    }

    get children(): ReadonlyArray<T> { return this.#children.slice(); }
    _addChild(child: T): void {
        if (child.parent) { throw new Error("already has a parent"); }
        this.#children.push(child);
        child._setParent(this);
    }
    _setParent(parent: SectionWithBody): void {
        if (this.#parent) { throw new Error("got parent"); }
        this.#parent = parent;
    }

    get recursive(): boolean { return true; }

    get length(): number { return this.children.length; }

    [Symbol.iterator](): Iterator<T> {
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: this.children[index++], done: false }
                }
                return { value: undefined, done: true };
            }
        };
    }

    async evaluate(config: Config): Promise<void> {
        for (const content of this.body) {
            if (!(content instanceof CodeContent)) { continue; }
            await content.evaluate(config);
        }

        for (const sub of this.children) {
            await sub.evaluate(config);
        }
    }

    get text(): string {
        return [
            this.body.map((c) => c.text).join("\n"),
            this.children.map((c) => c.text).join("\n"),
        ].join("\n\n");
    }
}

export class Section extends SectionWithBody<Subsection | Exported> {
    readonly anchor: string;
    #path: string;

    #mtime: number;

    dependencies: Array<string>;

    constructor(value: string, path: string) {
        super("section", value);
        this.#path = path;

        this.#mtime = 0;

        this.dependencies = [ ];
    }

    get path(): string { return this.#path; }

    get mtime(): number { return this.#mtime; }
    _setMtime(mtime: number) { this.#mtime = mtime; }

    get priority(): number {
        const priority = this.getExtension("priority");
        if (priority == null) { return 0; }
        return parseInt(priority);
    }

    get depth(): number {
        return 0; //this.path.split("/").length - 1;
    }

    get navTitle(): string {
        const nav = this.getExtension("nav");
        if (nav != null) { return nav; }
        return this.title;
    }

    static fromContent(content: string, path: string): Section {
        let section: null | Section = null;
        let subsection: null | Subsection = null;

        let inCode = false;

        let tag = "", value = "";

        let body: Array<string> = [ ];
        const flushBody = () => {
            if (tag === "") { return; }

            let content = body.join("\n");
            if (tag !== "code") { content = content.trim(); }

            if (tag === "section") {
                if (section != null) { throw new Error("duplicate section"); }
                section = new Section(value, path);
                section.body.push(Content.nullContent(content));

            } else if (tag === "subsection") {
                if (section == null) { throw new Error("missing section"); }
                subsection = new Subsection(value, section.path);
                subsection.body.push(Content.nullContent(content));
                section._addChild(subsection);

            } else {
                const cont = Content.fromContent(tag, value, content, path);
                if (subsection) {
                    subsection.body.push(cont);
                } else if (section) {
                    section.body.push(cont);
                } else {
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
                if (!Directives[tag]) { throw new Error(`unknown directive: ${ tag }`); }
                value = match[2].trim();
                body = [ ];
                inCode = (tag === "code");

            } else if (inCode) {
                // In a code block; allows escaping am underscore as the
                // first character in a code block.
                if (line.startsWith("\\_")) { line = line.substring(1); }
                body.push(line);

            } else {
                body.push(line.trim());
            }
        }

        flushBody();

        return section;
    }

    static fromApi(api: ApiSection, path: string): Section {
        let value = api.title;
        if (api.anchor) { value += ` @<${ api.anchor}>`; }
        value += ` @nav<${ api.navTitle }>`

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
                if (apiSub.anchor) { value += ` @<${ apiSub.anchor }>`; }

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

            } else if (apiSub instanceof Export) {
                section._addChild(new Exported(apiSub, section.path));

            } else {
                throw new Error("unsupported subsection");
            }
        }

        return section;
    }
}

export class Subsection extends SectionWithBody<Exported> {
    readonly parentPath: string;

    constructor(value: string, parentPath: string) {
        super("subsection", value);
        this.parentPath = parentPath;
    }

    get path(): string {
        let path = "";
        if (this.parentPath) { path += this.parentPath + "/"; }
        path += `#${ this.anchor || this.sid }`;
        return path;
    }
}

export class Exported extends SectionWithBody<Exported> {
    readonly exported: Export;
    readonly parentPath: string;

    constructor(exported: Export, parentPath: string) {
        let title = exported.name;
        if (exported instanceof ReturnsExport && exported.parent) {
            title = `${ exported.prefix }.${ title }`;
        }
        const value = `${ title } @<${ exported.id }>`;
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

    get examples(): Array<Script> {
        return this.exported.examples();
    }

    get path(): string {
        if (this.anchor == null) { throw new Error(`anchor required for path: ${ this.value }`); }
        return `${ this.parentPath }/#${ this.anchor }`;
    }

    get recursive(): boolean {
        return (this.exported instanceof ObjectExport);
    }

    async evaluate(config: Config): Promise<void> {
        super.evaluate(config);
        await this.exported.evaluate(config);
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

export abstract class Content extends Fragment {
    readonly tag: string;

    constructor(tag: string, value: string) {
        if (value.indexOf("@<") === -1) {
            value += ` @<cid_${ nextSid++ }>`
        }
        super(tag, value);
        this.tag = tag;
    }

    abstract get text(): string;
    abstract evaluate(config: Config): Promise<void>;

    static nullContent(body: string): Content {
        return Content.fromContent("null", "", body);
    }

    static fromContent(tag: string, value: string, body: string, filename?: string): Content {
        // @TODO: handle special Contents here
        if (tag === "code") { return new CodeContent(value, body, (filename != null) ? (filename + "/code.js"): "%unknown%"); }
        return new BodyContent(tag, value, parseMarkdown(body));
    }

    static fromFlatworm(flatworm: string): Array<Content> {
        console.log("@TODO: fromFlatworm");
        return [ ];
    }
}

export class BodyContent extends Content {
    readonly body: Array<Node>;

    constructor(tag: string, value: string, body: Array<Node>) {
        super(tag, value);
        this.body = body;
    }

    async evaluate(config: Config): Promise<void> { }

    get text(): string {
        return this.body.map((c) => c.textContent).join("\n")
    }
}

export class CodeContent extends Content {
    source: string;
    filename: string;

    script: Script;

    constructor(value: string, source: string, path?: string) {
        super("code", value);

        const lines = source.split("\n");
        while (lines.length && lines[0].trim() === "") { lines.shift(); }
        while (lines.length && lines[lines.length - 1].trim() === "") {
            lines.pop();
        }
        this.source = lines.join("\n");

        this.script = new Script(this.source, this.language, path);
        this.filename = this.script.filename;
    }

    get text(): string {
        return this.source;
    }

    get language(): string {
        return this.getExtension("lang");
    }

    async evaluate(config: Config): Promise<void> {
        await this.script.evaluate(config);
    }
}


//export class TableContent extends Content {

//}

export class Document implements Iterable<Section>{
    readonly config: Config;
    readonly sections: Array<Section>;

    constructor(config: Config) {
        this.config = config;
        this.sections = [ ];
    }

    get length(): number { return this.sections.length; }

    [Symbol.iterator](): Iterator<Section> {
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: this.sections[index++], done: false }
                }
                return { value: undefined, done: true };
            }
        };
    }

    async evaluate(): Promise<void> {
        for (const section of this.sections) {
            await section.evaluate(this.config);
        }
    }

    static async fromPath(path: string): Promise<Document> {
        return await Document.fromConfig(await Config.fromPath(path));
    }

    static fromConfig(config: Config): Document {
        const doc = new Document(config);

        // Ingest all documentation sections
        const readdir = function(path: string) {
            const filenames = fs.readdirSync(path);
            for (const _filename of filenames) {
                const filename = resolve(path, _filename);
                const stat = fs.statSync(filename);
                if (stat.isDirectory()) {
                    readdir(filename);
                } else if (extname(filename) === ".wrm") {
                    let path = relative(config.docRoot, filename);
                    if (path.endsWith("index.wrm")) {
                        path = path.substring(0, path.length - 9);
                    } else {
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
        for (const [ path, apiSection ] of api.toc) {
            const section = Section.fromApi(apiSection, path)
            doc.sections.push(section);
        }

        // Build a lookup table (for looking up priority)
        const lookup: Map<string, Section> = doc.sections.reduce((accum, section) => {
            accum.set(section.path, section);
            return accum;
        }, <Map<string, Section>>(new Map()));

        // Sort the sections based on their tree-hierarchy
        doc.sections.sort((a, b) => {
            const compsA = a.path.split("/"), compsB = b.path.split("/");

            // The root page (i.e. "") always comes first
            if (compsA.length === 1 && compsA[0] === "") { return -1; }
            if (compsB.length === 1 && compsB[0] === "") { return 1; }

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
                if (priorityCmp !== 0) { return priorityCmp; }

                // Same priority; return the sort order
                return cmp;
            }

            // Whichever has components left is last
            return compsA.length - compsB.length;
        });

        // Attach the document to each markdown Node
        const setDoc = (item: Node | SectionWithBody | Content) => {

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

    async populateMtime(): Promise<void> {
        const now = (new Date()).getTime();

        const tsCache: Map<string, number> = new Map();

        const getTs = async (path: string) => {
            let ts = tsCache.get(path);
            if (ts == null) {
                ts = await this.config.getTimestamp(path);
                if (ts == null) { ts = -1; }
                tsCache.set(path, ts);
            }
            return ts;
        };

        const getGenDate = async function(deps: Array<string>) {
            let latest = -1;
            for (const dep of deps) {
                const ts = await getTs(dep);
                if (ts > latest) { latest = ts; }
            }
            if (latest === -1) { return now; }
            return latest;
        };

        for (const section of this) {
            section._setMtime(await getGenDate(section.dependencies));
        }
    }

    getLinkName(anchor: string): string {
        return "@TODO";
    }

    getLinkUrl(anchor: string): string {
        return "@TODO";
    }
}
