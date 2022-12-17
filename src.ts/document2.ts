import fs from "fs";
import { extname, relative, resolve } from "path";

import { Config } from "./config2.js";
import {
    parseBlock, parseMarkdown, StylesAll,
    TextNode
} from "./markdown.js";
import type { Node } from "./markdown.js";
import { Script } from "./script2.js";


type DirectiveInfo = {
    title?: boolean,     // Supports markdown title
    heading?: boolean,   // Supports plain text title
    exts: Array<string>, // Supported extension
};

const Directives: Readonly<{ [ tag: string ]: DirectiveInfo }> = Object.freeze({
    section:     { title: true,   exts: [ "inherit", "note", "nav", "src", "priority" ] },
    subsection:  { title: true,   exts: [ "inherit", "note", "src" ] },
    heading:     { title: true,   exts: [ "inherit", "note", "src" ] },
//    definition:  { title: true,   exts: [ ] },
//    property:    {                exts: [ "src" ] },
    code:        { heading: true, exts: [ "lang" ] },  // body is specially handled
//    toc:         {                exts: [ ] },
    "null":      {                exts: [ ] },
    note:        { heading: true, exts: [ ] },
    warning:     { heading: true, exts: [ ] },
    table:       { heading: true, exts: [ "style" ] }, // body is specially handled
});

export abstract class Fragment {
    readonly titleNode: Node;
    readonly value: string;
    readonly anchor: string;

    readonly #exts: Map<string, string>

    constructor(directive: string, value: string) {
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

        if (Directives[directive].title) {
            this.titleNode = parseBlock(value, StylesAll);
        } else if (Directives[directive].heading) {
            this.titleNode = new TextNode(value);
        } else if (value.trim() !== "") {
            throw new Error(`_${ directive }: does not support VALUE`);
        }
    }
    get title(): string { return this.titleNode.textContent; }

    getExtension(key: string): null | string {
        return this.#exts.has(key) ? this.#exts.get(key): null;
    }
}

export class Section extends Fragment {
    readonly path: string;
    readonly body: Array<Content>;
    readonly subsections: Array<Subsection>

    readonly filename: null | string;

    constructor(value: string, path: string, filename?: string) {
        super("section", value);
        this.path = path;
        this.filename = (filename != null) ? filename: null;

        this.body = [ ];
        this.subsections = [ ];
    }

    get dependencies(): Array<string> {
        if (this.filename) { return [ this.filename ]; }
        return [ ];
    }

    get priority(): number {
        const priority = this.getExtension("priority");
        if (priority == null) { return 0; }
        return parseInt(priority);
    }

    get navTitle(): string {
        const nav = this.getExtension("nav");
        if (nav == null) { return this.title; }
        return nav;
    }

    async evaluate(config: Config): Promise<void> {
        for (const content of this.body) {
            if (!(content instanceof CodeContent)) { continue; }
            await content.evaluate(config);
        }

        for (const sub of this.subsections) {
            await sub.evaluate(config);
        }
    }

    static fromContent(anchor: string, content: string, filename?: string): Section {
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
                section = new Section(value, anchor, filename);
                section.body.push(Content.nullContent(content));

            } else if (tag === "subsection") {
                if (section == null) { throw new Error("missing section"); }
                subsection = new Subsection(value, "");
                subsection.contents.push(Content.nullContent(content));
                section.subsections.push(subsection);

            } else {
                const cont = Content.fromContent(tag, value, content);
                if (subsection) {
                    subsection.contents.push(cont);
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
                if (line.startsWith("\\_")) { line = line.substring(1); }
                body.push(line);

            } else {
                body.push(line.trim());
            }
        }

        flushBody();

        return section;
    }
}

export class Subsection extends Fragment {
    readonly contents: Array<Content>

    constructor(value: string, anchor: string) {
        super("subsection", value);

        this.contents = [ ];
    }

    async evaluate(config: Config): Promise<void> {
        for (const content of this.contents) {
            if (!(content instanceof CodeContent)) { continue; }
            await content.evaluate(config);
        }
    }
}

export abstract class Content extends Fragment {
    readonly tag: string;

    constructor(tag: string, value: string) {
        super(tag, value);
        this.tag = tag;
    }

    static nullContent(body: string): Content {
        return Content.fromContent("null", "", body);
    }

    static fromContent(tag: string, value: string, body: string): Content {
        // @TODO: handle special Contents here
        if (tag === "code") { return new CodeContent(value, body); }
        return new BodyContent(tag, value, parseMarkdown(body));
    }
}

export class BodyContent extends Content {
    readonly body: Array<Node>;

    constructor(tag: string, value: string, body: Array<Node>) {
        super(tag, value);
        this.body = body;
    }
}

export class CodeContent extends Content {
    source: string;

    script: Script;

    constructor(value: string, source: string) {
        super("code", value);

        const lines = source.split("\n");
        while (lines.length && lines[0].trim() === "") { lines.shift(); }
        while (lines.length && lines[lines.length - 1].trim() === "") { lines.pop(); }
        this.source = lines.join("\n");

        this.script = new Script(this.source, this.language);
    }

    get language(): string {
        return this.getExtension("lang");
    }

    async evaluate(config: Config): Promise<void> {
        await this.script.evaluate(config);
    }

}

export class TableContent extends Content {

}

export class Document {
    readonly config: Config;
    readonly sections: Array<Section>;

    constructor(config: Config) {
        this.config = config;
        this.sections = [ ];
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
        const readdir = function(path: string) {
            const filenames = fs.readdirSync(path);
            for (const _filename of filenames) {
                const filename = resolve(path, _filename);
                const stat = fs.statSync(filename);
                if (stat.isDirectory()) {
                    readdir(filename);
                } else if (extname(filename) === ".wrm") {
                    let anchor = relative(config.docRoot, filename);
                    if (anchor.endsWith("index.wrm")) {
                        anchor = anchor.substring(0, anchor.length - 9);
                    } else {
                       anchor = anchor.substring(0, anchor.length - 4);
                    }
                    if (anchor[anchor.length - 1] === "/") {
                        anchor = anchor.substring(0, anchor.length - 1);
                    }
                    const content = fs.readFileSync(filename).toString();
                    doc.sections.push(Section.fromContent(anchor, content, filename));
                }
            }
        };
        readdir(config.docRoot);
        return doc;
    }
}
/*
(async function() {
    const doc = await Document.fromPath("/Users/dev/Development/ethers/ethers-v6/docs.wrm/config.js");
    console.dir(doc, { depth: null });
})().catch((e) => { console.log(e); } );
*/
