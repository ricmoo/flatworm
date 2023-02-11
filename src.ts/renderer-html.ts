
// @TODO: Move link stuff to document

import fs from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from 'url';

import {
    BodyContent, CodeContent,
    SectionWithBody, Subsection, Exported,
} from "./document.js";
import {
    ElementNode, LinkNode, ListNode, Node, TextNode
} from "./markdown.js";
import {
    FunctionExport, ReturnsExport, ObjectExport,

    ExportType,

    Type, TypeBasic, TypeTodo, TypeFunction, TypeGroup,
    TypeIdentifier, TypeLiteral, TypeMapping, TypeWrapped
} from "./jsdocs.js";

import type { Script } from "./script.js";
import type {
    Document, Section,
    Content
} from "./document.js";


function htmlify(value: string): string {
    if (value == null) { return "undef"; }
    return value.replace(/&/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const Months = [
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"
];

function getTimestamp(value: number): string {
    const now = new Date(value);

    let hours = now.getHours();
    let meridian = "am";
    if (hours >= 12) {
        hours -= 12;
        meridian = "pm";
    } else if (hours === 0) {
        hours = 12;
    }

    let minutes = String(now.getMinutes());
    if (minutes.length < 2) { minutes = "0" + minutes; }

    return [
        Months[now.getMonth()], " ",
        now.getDate(), ", ",
        now.getFullYear(), ", ",
        hours, ":",
        minutes,
        meridian
    ].join("");
}

type TocEntry = {
    depth: number,
    path: string,
    title: string,
    selected?: boolean,
    highlit?: boolean,
    hidden?: boolean,
    current?: boolean
};
/*
type __TocEntry = {
    path: string;
    link: string;
    style: string;
    title: string;
};
type __TOC = {
  path: string;
  entry: __TocEntry
  section: ApiSection | Section;
}
*/
type _TocOffset = { depth: number, start: number, end: number };

// @TODO: Rename path => link or href?

function prepareToc(section: Section, renderer: HtmlRenderer): Array<TocEntry> {
    const countDepth = (value: string) => {
        return (value.split("/").length - 1) + (value.split("#").length - 1);
    };

    const result: Array<TocEntry> = [ ];

    // Get all the TOC entries
    let current = -1;
    {
        let minDepth = -1, i = 0;
        for (const { path, title } of renderer) {

            // Ignore the root
            if (!path) { continue; }

            // Get the depth and track the minimum depth
            const depth = countDepth(path);
            if (minDepth === -1 || depth < minDepth) { minDepth = depth; }

            // Found the current entry
            if (section.path === path) { current = i; }
            i++

            result.push({ depth, path, title });
        }

        // Adjust the depth based on the minimum depth
        result.forEach((e) => { e.depth -= minDepth });
    }

    const hideGrandkids = function(offset: _TocOffset) {
        for (let i = offset.start; i < offset.end; i++) {
            if (result[i].depth > offset.depth + 1) {
                result[i].hidden = true;
            }
        }
    }

    if (current === -1) {
        hideGrandkids({ depth: -1, start: 0, end: result.length });

        // Remove all hidden entries
        return result.filter((e) => (!e.hidden));
    }

    result[current].current = true;

    // Get all ancestor sections (including yourself)
    const ancestors: Array<number> = [ current ];
    {
        let depth = result[current].depth;
        for (let i = current; i >= 0; i--) {
            if (result[i].depth < depth) {
                ancestors.push(i);
                depth--;
            }
        }
    }

    // Remove the nieces
    const hideNieces = function(myself: number, offset: _TocOffset) {

        // Find all siblings for myself in the range
        const siblings: Array<number> = [ ];
        for (let i = offset.start; i < offset.end; i++) {
            if (result[i].depth === result[myself].depth) { siblings.push(i); }
        }

        siblings.push(offset.end);

        // No siblings
        if (siblings.length === 1) { return offset; }

        offset = { depth: -1, start: -1, end: -1 };

        for (let i = 1; i < siblings.length; i++) {
            const start = siblings[i - 1], end = siblings[i];

            // This is the direct anscestor for this depth; mark it selected
            if (myself >= start && myself < end) {
                result[start].selected = true;
                offset = { depth: result[myself].depth, start, end };
                continue;
            }
            // It's a niece; hide it
            for (let j = start + 1; j < end; j++) {
                result[j].hidden = true;
            }
        }

        return offset;
    };

    // Hide all nieces of all ancestors
    const root = hideNieces(ancestors.pop(), { depth: 0, start: 0, end: result.length });
    {
        // Remove each ancestor's nieces, starting with the oldest
        let offset = root;
        while (ancestors.length && offset.depth !== -1) {
            offset = hideNieces(ancestors.pop(), offset);
        }
        for (let i = root.start; i < root.end; i++) {
            result[i].highlit = true;
        }

        if (offset.depth !== -1) { hideGrandkids(offset); }
    }

    // Remove all hidden entries
    return result.filter((e) => (!e.hidden));
}

export class OutputFile {
    readonly filename: string;
    readonly content: string | Buffer;

    constructor(filename: string, content: string | Buffer) {
        this.filename = filename;
        this.content = content;
    }
}

export type Link = {
    title: string;
    link: string;  // rename to path
    style: string;
};

interface Linkable {
    anchor: null | string;
    title: string;
    navTitle?: string;
    path: string;
};

const foldType: Record<ExportType, string> = {
    "const": "CONSTANTS",

//    "interface": "TYPES",
    "interface": "",
    "type": "TYPES",

    "function": "FUNCTIONS",

    "property": "PROPERTIES",

    "constructor": "CREATING INSTANCES",
    "create": "CREATING INSTANCES",

    "method": "METHODS",

    "static method": "STATIC METHODS",

//    "abstract class": "ABSTRACT CLASS",
//    "class": "CLASS"
    "abstract class": "",
    "class": ""
};

class HtmlGenerator {
    readonly renderer: HtmlRenderer;
    readonly section: Section;
    readonly #output: Array<string>;

    #links: Array<Map<string, Link>>;

    constructor(renderer: HtmlRenderer, section: Section) {
        this.renderer = renderer;
        this.section = section;
        this.#output = [ ];
        this.#links = [ new Map() ];
    }

    get output(): string { return this.#output.join(""); }

    getLink(anchor: string): null | Link {
        for (const links of this.#links) {
            const link = links.get(anchor);
            if (link) { return link; }
        }
        return this.renderer.getLink(anchor);
    }

    pushLinks(exported: ObjectExport): void {
        const links = new Map();
        this.#links.unshift(links);

        const addLinks = (exported: ObjectExport) => {
            for (const child of exported) {
                if (links.has(child.name)) { continue; }
                links.set(child.name, {
                    title: child.name,
                    link: `${ this.section.path }#${ child.id }`,
                    style: "code"
                });
            }
        };

        addLinks(exported);
        for (const s of exported.allSupers) { addLinks(s); }
    }

    popLinks(): void {
        this.#links.shift();
    }

    append(line: string): void {
        this.#output.push(line);
    }

    renderNode(node: Node): string {
        if (node instanceof TextNode) { return node.content; }

        if (node instanceof LinkNode) {
            let content = node.link;
            if (node.children.length) {
                content = node.children.map((c) => this.renderNode(c)).join("");
            }

            const foundLink = this.getLink(node.link);
            if (foundLink) {
                let { link, style, title } = foundLink;
                if (node.children.length === 0 && title) {
                    content = title;
                } else {
                    style = "normal";
                }

                let extraCls = "", extraAttr = "";
                if (style === "code") {
                    extraCls = "notranslate ";
                    extraAttr = ` translate="no"`
                }

                let external = "", target = "";
                if (link.indexOf(":/\/") >= 0) {
                    external = "external";
                    target = ` target="_blank"`;
                }
                return `<span class="${ extraCls }style-link style-${ style } ${ external }"${extraAttr}><a class="link-lit" href="${ this.renderer.resolveLink(link) }"${ target }>${ content }</a></span>`;
            }

            console.log(`WARNING: missing link ${ JSON.stringify(node.link) } (section: ${ this.section.path })`);

            return `<span class="style-link missing-link">${ content }</span>`;
        }

        if (node instanceof ListNode) {
            const items = node.items.map((i) => `<li>${ this.renderNode(i) }</li>`);
            return `<ul class="style-list">${ items.join("") }</ul>`;
        }

        if (node instanceof ElementNode) {
            let extraCls = "", extraAttr = "";
            if (node.style === "param" || node.style === "code") {
                extraCls = "notranslate ";
                extraAttr = ` translate="no"`
            }
            return `<span class="${ extraCls }style-${ node.style }"${ extraAttr }>${ node.children.map((c) => this.renderNode(c)).join("") }</span>`;
        }

        console.log(node);
        throw new Error();

    }

    renderType(type: Type): string {
        if (type instanceof TypeBasic) {
            return `<span class="type basic">${ type.type }</span>`
        } else if (type instanceof TypeTodo) {
            return `<span class="type todo">${ type.type }</span>`
        } else if (type instanceof TypeFunction) {
            const params = type.params.map((p) => `<span class="">${ p.name }${ p.optional ? "?": "" }: ${ this.renderType(p.type) }</span>`);
            return `<span class="type wrapped">(${ params.join(", ") }) => ${ this.renderType(type.returns) }</span>`
        } else if (type instanceof TypeGroup) {
            const types = type.types.map((t) => this.renderType(t));
            if (type.relation === "|" || type.relation === "&") {
                const symbol = ` ${ type.relation } `;
                return `<span class="type group">${ types.join(symbol) }</span>`
            }
            let relation = type.relation;
            const link = this.renderer.getLink(relation);
            if (link) {
                relation = `<a class="link-lit" href="${ this.renderer.resolveLink(link.link) }">${ relation }</a>&thinsp;`;
            }
            return `<span class="type group">${ relation }&lt;&thinsp;${ types.join(", ") }&thinsp;&gt;</span>`

        } else if (type instanceof TypeIdentifier) {
            const link = this.renderer.getLink(type.type);
            if (link) {
                return `<span class="type identifier"><a class="link-lit" href="${ this.renderer.resolveLink(link.link) }">${ type.type }</a></span>`
            }
            return `<span class="type identifier">${ type.type }</span>`
        } else if (type instanceof TypeLiteral) {
            return `<span class="type literal">${ type.type }</span>`
        } else if (type instanceof TypeMapping) {
            const keys = Object.keys(type.children);
            keys.sort((a, b) => (a.localeCompare(b)));
            const mapping = keys.map((k) => `${ k }: ${ this.renderType(type.children[k]) } `);
            return `<span class="type mapping">{ ${ mapping.join(", ") } }</span>`
        } else if (type instanceof TypeWrapped) {
            return `<span class="type wrapped">${ type.wrapper }&lt;${ this.renderType(type.child) } }&gt;</span>`
        }
        console.log(type);
        throw new Error("unhandled");
    }

    appendNodes(nodes: Array<Node>): void {
        for (const node of nodes) {
            this.append(`<p>${ this.renderNode(node) }</p>`);
        }
    }

    appendCode(script: Script): void {
        this.append(`<div class="notranslate code-block" translate="no">`);
        script.forEach(({ line, type }) => {
            this.append(`<span class="code-${ type }">${ htmlify(line) }</span>\n`);
        });
        this.append(`</div>`);
    }

    appendExported(exported: Exported): void {
        const ex = exported.exported;

        const type = "todo"

        this.append(`<div class="type-${ type } show-links">`);

        this.append(`<div class="notranslate signature" translate="no">`);
        this.append(`<a class="link anchor" name="${ ex.id }" href="#${ ex.id }">&nbsp;</a>`);

        const srcLink = this.renderer.getLink(`src:${ ex.id }`);
        if (srcLink) {
            this.append(`<a class="link source" href="${ srcLink.link }">&lt;src&gt;</a>`);
        }

        let isCtor = false;
        const prefix = (<ReturnsExport>(exported.exported)).prefix;
        if (prefix) {
            if (exported.exported.name === "constructor") {
                this.append(`<span class="symbol new">new</span> <span class="name">${ prefix }</span>`);
                isCtor = true;
            } else {
                this.append(`<span class="parent">${ prefix }</span><span class="symbol dot">.</span>`);
            }
        }

        // Name
        if (!isCtor) {
            this.append(`<span class="name">${ ex.name }</span>`);
        }

        // Parameters
        if (ex instanceof FunctionExport) {
            this.append(`<span class="symbol open-paren paren">(</span>`);
            let comma = false;
            for (const param of ex.params) {
                if (comma) {
                    this.append(`<span class="symbol comma">, </span>`);
                }
                comma = true;
                this.append(`<span class="param" data-text="${ param.name }"><span class="param-name">${ param.name }</span>${ param.optional ? "?": "" }: ${ this.renderType(param.type) }</span>`);
            }
            this.append(`<span class="symbol close-paren paren">)</span>`);
        }

        // Return
        if (!isCtor && ex instanceof ReturnsExport) {
            this.append(`<span class="symbol arrow">&rArr; </span>`);
            this.append(`<span class="returns">${ this.renderType(ex.returns) }</span>`);
        }

        this.append(`</div>`); // signature

        // Body
        this.append(`<div class="docs indent">`);
        this.appendContent(exported.body);
        this.append(`</div>`);

        // Examples
        for (const example of exported.examples) {
            this.appendCode(example);
        }

        this.append(`</div>`); // type-
    }

    appendContent(contents: Array<Content>): void {
        for (const content of contents) {
            if (content instanceof BodyContent) {
                if (content.tag !== "null") {
                    this.append(`<div class="title-${ content.tag }">${ this.renderNode(content.titleNode) }</div>`);
                }
                this.append(`<div>`);
                this.appendNodes(content.body);
                this.append(`</div>`);

            } else if (content instanceof CodeContent) {
                if (content.title.trim()) {
                    this.append(`<div class="title-${ content.tag }">${ content.title }</div>`)
                }
                this.appendCode(content.script);

            } else {
                console.log(content);
                throw new Error("unsupported content type");
            }
        }
    }


    appendLinkable(type: string, anchor: null | string, title: Node, body: Array<Content>, exported?: null | Exported) {
        const objExport: null | ObjectExport = (exported && exported.exported instanceof ObjectExport) ? exported.exported: null;

        this.append(`<div class="type-${ type } show-links">`);

        this.append(`<div class="title-${ type }">`);
        if (anchor) {
            const link = this.renderer.getLink(anchor);
            this.append(`<a class="link anchor" name="${ anchor }" href="${ this.renderer.resolveLink(link.link) }">&nbsp;</a>`);
        }

        if (objExport) {
            this.append(`<span class="type">${ objExport.type }</span>&nbsp;`);
        }
        this.append(this.renderNode(title));
        this.append(`</div>`);

        if (objExport && objExport.supers.length) {
            this.append(`<div class="supers">inherits from `);
            let comma = false;
            for (const s of objExport.allSupers) {
                if (comma) { this.append(`, `); }
                comma = true;

                const link = this.renderer.getLink(s.id);
                if (link) { this.append(`<a class="link-lit" href="${ this.renderer.resolveLink(link.link) }">`); }
                this.append(`<span class="super">${ s.name }</a>`);
                if (link) { this.append(`</a>`); }
            }
            this.append(`</div>`);
        }

        this.append(`<div class="docs">`);
        this.appendContent(body);
        this.append(`</div>`);

        if (exported) {
            for (const ex of exported.examples) {
                this.appendCode(ex);
            }
        }

        this.append(`</div>`);
    }

    appendHeader(): void {
        //const prefix = this.renderer.document.config.prefix;
        this.append(`<html><head>`);
        this.append(`<link rel="stylesheet" href="${ this.renderer.resolveLink("static/style.css") }">`);
        this.append(`<meta property="og:title" content="Documentation">`);
        this.append(`<meta property="og:description" content="Documentation for ethers, a complete, tiny and simple Ethereum library.">`);
        this.append(`<meta property="og:image" content="${ this.renderer.resolveLink("static/social.jpg") }">`);
        this.append(`</head><body>`);
    }

    appendSidebar(): void {
        const config = this.renderer.document.config;
        this.append(`<div class="sidebar"><div class="header">`);
        this.append(`<a class="logo" href="${ this.renderer.resolveLink("") }"><div class="image"></div><div class="name">${ config.title }</div><div class="version">${ config.subtitle }</div></a>`);
        this.append(`</div><div class="toc">`);
        this.append(`<div class="title"><a href="${ this.renderer.resolveLink("") }">DOCUMENTATION</a></div>`);

        for (const { depth, path, title, current, selected, highlit } of prepareToc(this.section, this.renderer)) {
            this.append(`<div data-depth="${ depth }" class="depth-${ depth }${ current ? " current": ""}${ selected ? " selected": "" }${ highlit ? " highlight": "" }"><a href="${ this.renderer.resolveLink(path) }">${ title }</a></div>`);
            if (!current) { continue; }
            /*
            if (section instanceof ApiSection) {
                const subToc = addExports(api, [ ], links, section.objs);
                for (let i = 0; i < subToc.length; i++) {
                    const { path, title } = subToc[i];
                    const dedent = (i === (subToc.length - 1)) ? " dedent": "";
                    this.append(`<div class="depth-${ depth + 1 } highlight sub${ dedent }"><a href="${ path }">${ title }</a></div>`);
                }
            } else {
                const subs = section.subsections;
                for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    const anchor = links.get(sub.anchor);
                    if (anchor == null) { continue; }
                    const dedent = (i === (subs.length - 1)) ? " dedent": "";
                    this.append(`<div class="depth-${ depth + 1 } highlight sub${ dedent }"><a href="${ anchor.link }">${ sub.title }</a></div>`);
                }
            }
            */
        }

        this.append(`</div></div>`);
    }

    beginContent(): void {
       this.append(`<div class="content">`);
    }

    endContent(): void {
       this.append(`</div>`);
    }

    appendBreadcrumbs(): void {
       this.append(`<div class="breadcrumbs">`);

       // The breadcrumbs; but on the root drop the empty string
       // since the root is always included
       const breadcrumbs = this.section.path.split("/").filter(Boolean);

        for (let i = 0; i <= breadcrumbs.length; i++) {
            let path = breadcrumbs.slice(0, i).join("/");
            if (i !== breadcrumbs.length) {
                const link = this.renderer.getLinkable(path);
                if (link == null) { continue; }
                if (path !== "") { path += "/"; }
                this.append(`<a href="${ this.renderer.resolveLink(path) }">${ link.navTitle || link.title }</a> <span class="symbol">&raquo;</span>`);
            } else {
                this.append(`<i>${ this.section.title }</i>`);
            }
        }

       this.append(`</div>`);
    }

    appendCopyright(): void {
        const paths = this.renderer.document.sections.map((s) => s.path);
        const i = paths.indexOf(this.section.path);

        let prev = (i > 0) ? this.renderer.getLinkable(paths[i - 1]): null;
        let next = (i < paths.length - 1) ? this.renderer.getLinkable(paths[i + 1]): null;

        this.append(`<div class="footer"><div class="nav"><div class="clearfix"></div>`);
        if (prev) {
            this.append(`<div class="previous"><a href="${ this.renderer.resolveLink(prev.path) }"><span class="arrow">&larr;</span>&nbsp;${ prev.title }</a></div>`);
        }
        if (next) {
            this.append(`<div class="next"><a href="${ this.renderer.resolveLink(next.path) }">${ next.title }<span class="arrow">&rarr;</span></a></div>`);
        }
        this.append(`<div class="clearfix"></div></div><div class="copyright">The content of this site is licensed under the Creative Commons License. Generated on ${ getTimestamp(this.section.mtime) }.</div></div>`);
    }

    appendFooter(): void {
        this.append(`<script type="module" src="${ this.renderer.resolveLink("static/script-v2.js") }"></script></body></html>`);
    }

    appendChildren(type: string, item: SectionWithBody): void {
        let ex: null | Exported = null;
        if (item instanceof Exported) {
            ex = item;
            this.pushLinks(<ObjectExport>(item.exported));
        }

        this.appendLinkable(type, item.anchor, item.titleNode, item.body, ex);
        let lastType: string = "";
        for (const sub of item) {
            if (sub instanceof Exported) {
                const type = foldType[sub.exported.type];
                if (type !== lastType && type) {
                    lastType = type;
                    this.append(`<div class="title-heading">${ type }</div>`)
                }
                if (sub.recursive) {
                    this.appendChildren("export", sub);
                } else {
                    this.appendExported(sub);
                }
            } else {
                this.appendChildren("subsection", sub);
            }
        }
        if (ex) { this.popLinks(); }
    }

    render(): void {
        const sec = this.section;
        this.appendHeader();
        this.appendSidebar();
        this.beginContent();
        this.appendBreadcrumbs();

        //this.appendOrdered(sec);
        this.appendChildren("section", sec);

        this.appendCopyright();

        this.endContent();

        this.appendFooter();
    }
}

export class HtmlRenderer implements Iterable<Linkable> {
    readonly document: Document;

    #links: Map<string, Link>;
    #targets: Array<Linkable>;

    constructor(document: Document) {
        this.document = document;

        // Create a map of all link anchors
        this.#links = new Map(document.config.links);

        // Map href (e.g. "foo/bar") to their section
        this.#targets = [ ];
        this.#targets.push({ title: "Documentation", path: "", anchor: null });

        const srcBaseUrl = this.document.config.srcBaseUrl;

        const addLink = (item: Linkable, style: string) => {
            try {
                const path = item.path;
                if (path) { this.#targets.push(item); }
            } catch (error) { }

            if (srcBaseUrl && item instanceof Exported) {
                const ex = item.exported;
                this.#links.set(`src:${ ex.id }`, {
                    link: (srcBaseUrl.replace(/{FILENAME}/g, ex.filename).replace(/{LINENO}/g, String(ex.lineno))),
                    style: "normal",
                    title: `source:${ ex.id }`
                });
            }

            if (!item.anchor) { return; }

            if (this.#links.has(item.anchor)) {
                console.log("DUP:", item);
                throw new Error(`duplicate anchor: ${ item.anchor }`);
            }

            const title = item.title;
            const link = item.path;
            this.#links.set(item.anchor, { title, link, style });
        };

        // Add links for every section, subsection and exported
        for (const section of document) {
            addLink(section, "normal");
            for (const subsection of section) {
                if (subsection instanceof Subsection) {
                    // Subsection
                    addLink(subsection, "normal");
                    for (const content of subsection) {
                        // @TODO: May wish to support heading here?
                        if (!(content instanceof Exported)) { continue; }
                        addLink(content, "code");
                        for (const ex of content) { addLink(ex, "code"); }
                    }

                } else {
                    // Exported
                    addLink(subsection, "code");
                    for (const ex of subsection) { addLink(ex, "code"); }
                }
            }
        }

        // Add links
    }

    get length(): number { return this.#targets.length; }

    [Symbol.iterator](): Iterator<Linkable> {
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: this.#targets[index++], done: false }
                }
                return { value: undefined, done: true };
            }
        };
    }

    getLink(anchor: string): Link {
        return this.#links.get(anchor);
    }

    getLinkable(href: string): Linkable {
        const matching = this.#targets.filter((t) => t.path === href);
        if (matching == null) { throw new Error(`no linkable found for ${ href }`); }
        return matching[0];
    }

    resolveLink(href: string): string {
        // @TODO: Use config.prefix
        return `/${ href }`;
    }

    render(): Array<OutputFile> {
        const output: Array<OutputFile> = [ ];

        const __dirname = dirname(fileURLToPath(import.meta.url));

        [
            "link.svg",
            "lato/index.html",
            "lato/Lato-Italic.ttf",
            "lato/Lato-Black.ttf",
            "lato/Lato-Regular.ttf",
            "lato/Lato-BlackItalic.ttf",
            "lato/OFL.txt",
            "lato/README.txt",

            "liberation/LiberationMono-Italic.ttf",
            "liberation/LiberationMono-Bold.ttf",
            "liberation/LiberationMono-Regular.ttf",
            "liberation/LiberationMono-BoldItalic.ttf",

    //        "search.js",
    //        "script-v2.js",
            "style.css",
        ].forEach((_filename) => {
            const filename = resolve(__dirname, "../static", _filename);
            const target = join("static", _filename);
            const content = fs.readFileSync(filename);
            output.push(new OutputFile(target, content));
        });

        const config = this.document.config;
        config.staticFiles.forEach((_filename) => {
            const filename = config.resolve(_filename);
            const target = join("static", _filename);
            const content = fs.readFileSync(filename);
            output.push(new OutputFile(target, content));
        });

        for (const section of this.document) {
            const filename = section.path; // @TODO: Add prefix
            const content = new HtmlGenerator(this, section);
            content.render();
            output.push(new OutputFile(filename, content.output));
        }
        return output;
    }
}
