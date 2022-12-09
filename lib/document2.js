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
var _Fragment_exts;
import fs from "fs";
import { extname, relative, resolve } from "path";
import { Config } from "./config2.js";
import { parseBlock, parseMarkdown, StylesAll, TextNode } from "./markdown.js";
const Directives = Object.freeze({
    section: { title: true, exts: ["inherit", "note", "nav", "src", "priority"] },
    subsection: { title: true, exts: ["inherit", "note", "src"] },
    heading: { title: true, exts: ["inherit", "note", "src"] },
    //    definition:  { title: true,   exts: [ ] },
    //    property:    {                exts: [ "src" ] },
    code: { heading: true, exts: ["lang"] },
    //    toc:         {                exts: [ ] },
    "null": { exts: [] },
    note: { heading: true, exts: [] },
    warning: { heading: true, exts: [] },
    table: { heading: true, exts: ["style"] }, // body is specially handled
});
export class Fragment {
    constructor(directive, value) {
        _Fragment_exts.set(this, void 0);
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
        if (Directives[directive].title) {
            this.titleNode = parseBlock(value, StylesAll);
        }
        else if (Directives[directive].heading) {
            this.titleNode = new TextNode(value);
        }
        else if (value.trim() !== "") {
            throw new Error(`_${directive}: does not support VALUE`);
        }
    }
    get title() { return this.titleNode.textContent; }
    getExtension(key) {
        return __classPrivateFieldGet(this, _Fragment_exts, "f").has(key) ? __classPrivateFieldGet(this, _Fragment_exts, "f").get(key) : null;
    }
}
_Fragment_exts = new WeakMap();
export class Section extends Fragment {
    constructor(value, path) {
        super("section", value);
        this.path = path;
        this.body = [];
        this.subsections = [];
    }
    get priority() {
        const priority = this.getExtension("priority");
        if (priority == null) {
            return 0;
        }
        return parseInt(priority);
    }
    static fromContent(anchor, content) {
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
                section = new Section(value, anchor);
                section.body.push(Content.nullContent(content));
            }
            else if (tag === "subsection") {
                if (section == null) {
                    throw new Error("missing section");
                }
                subsection = new Subsection(value, "");
                subsection.contents.push(Content.nullContent(content));
                section.subsections.push(subsection);
            }
            else {
                const cont = Content.fromContent(tag, value, content);
                if (subsection) {
                    subsection.contents.push(cont);
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
}
export class Subsection extends Fragment {
    constructor(value, anchor) {
        super("subsection", value);
        this.contents = [];
    }
}
export class Content extends Fragment {
    constructor(tag, value) {
        super(tag, value);
        this.tag = tag;
    }
    static nullContent(body) {
        return Content.fromContent("null", "", body);
    }
    static fromContent(tag, value, body) {
        // @TODO: handle special Contents here
        if (tag === "code") {
            return new CodeContent(value, body);
        }
        return new BodyContent(tag, value, parseMarkdown(body));
    }
}
export class BodyContent extends Content {
    constructor(tag, value, body) {
        super(tag, value);
        this.body = body;
    }
}
export class CodeContent extends Content {
    constructor(value, source) {
        super("code", value);
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
}
export class TableContent extends Content {
}
export class Document {
    constructor(config) {
        this.config = config;
        this.sections = [];
    }
    static fromPath(path) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Document.fromConfig(yield Config.fromPath(path));
        });
    }
    static fromConfig(config) {
        const doc = new Document(config);
        const readdir = function (path) {
            const filenames = fs.readdirSync(path);
            for (const _filename of filenames) {
                const filename = resolve(path, _filename);
                const stat = fs.statSync(filename);
                if (stat.isDirectory()) {
                    readdir(filename);
                }
                else if (extname(filename) === ".wrm") {
                    let anchor = relative(config.docRoot, filename);
                    if (anchor.endsWith("index.wrm")) {
                        anchor = anchor.substring(0, anchor.length - 9);
                        //if (anchor !== "/") { anchor = "/" + anchor; }
                    }
                    else {
                        anchor = anchor.substring(0, anchor.length - 4);
                    }
                    const content = fs.readFileSync(filename).toString();
                    doc.sections.push(Section.fromContent(anchor, content));
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
//# sourceMappingURL=document2.js.map