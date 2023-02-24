// @TODO: Move link stuff to document
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
var _HtmlGenerator_output, _HtmlGenerator_links, _HtmlRenderer_links, _HtmlRenderer_targets;
import fs from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from 'url';
import { BodyContent, CodeContent, Subsection, Exported, } from "./document2.js";
import { ElementNode, LinkNode, ListNode, TextNode } from "./markdown.js";
import { FunctionExport, ReturnsExport, TypeBasic, TypeTodo, TypeFunction, TypeGroup, TypeIdentifier, TypeLiteral, TypeMapping, TypeWrapped } from "./jsdocs.js";
function htmlify(value) {
    if (value == null) {
        return "undef";
    }
    return value.replace(/&/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// @TODO: Rename path => link or href?
function prepareToc(section, renderer) {
    const countDepth = (value) => {
        return (value.split("/").length - 1) + (value.split("#").length - 1);
    };
    const result = [];
    // Get all the TOC entries
    let current = -1;
    {
        let minDepth = -1, i = 0;
        for (const { path, title } of renderer) {
            // Ignore the root
            if (!path) {
                continue;
            }
            // Get the depth and track the minimum depth
            const depth = countDepth(path);
            if (minDepth === -1 || depth < minDepth) {
                minDepth = depth;
            }
            // Found the current entry
            if (section.path === path) {
                current = i;
            }
            i++;
            result.push({ depth, path, title });
        }
        // Adjust the depth based on the minimum depth
        result.forEach((e) => { e.depth -= minDepth; });
    }
    const hideGrandkids = function (offset) {
        for (let i = offset.start; i < offset.end; i++) {
            if (result[i].depth > offset.depth + 1) {
                result[i].hidden = true;
            }
        }
    };
    if (current === -1) {
        hideGrandkids({ depth: -1, start: 0, end: result.length });
        // Remove all hidden entries
        return result.filter((e) => (!e.hidden));
    }
    result[current].current = true;
    // Get all ancestor sections (including yourself)
    const ancestors = [current];
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
    const hideNieces = function (myself, offset) {
        // Find all siblings for myself in the range
        const siblings = [];
        for (let i = offset.start; i < offset.end; i++) {
            if (result[i].depth === result[myself].depth) {
                siblings.push(i);
            }
        }
        siblings.push(offset.end);
        // No siblings
        if (siblings.length === 1) {
            return offset;
        }
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
        if (offset.depth !== -1) {
            hideGrandkids(offset);
        }
    }
    // Remove all hidden entries
    return result.filter((e) => (!e.hidden));
}
export class OutputFile {
    constructor(filename, content) {
        this.filename = filename;
        this.content = content;
    }
}
;
const foldType = {
    "const": "CONSTANTS",
    "interface": "TYPES",
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
    constructor(renderer, section) {
        _HtmlGenerator_output.set(this, void 0);
        _HtmlGenerator_links.set(this, void 0);
        this.renderer = renderer;
        this.section = section;
        __classPrivateFieldSet(this, _HtmlGenerator_output, [], "f");
        __classPrivateFieldSet(this, _HtmlGenerator_links, [new Map()], "f");
    }
    get output() { return __classPrivateFieldGet(this, _HtmlGenerator_output, "f").join(""); }
    getLink(anchor) {
        for (const links of __classPrivateFieldGet(this, _HtmlGenerator_links, "f")) {
            const link = links.get(anchor);
            if (link) {
                return link;
            }
        }
        return this.renderer.getLink(anchor);
    }
    pushLinks(exported) {
        const links = new Map();
        __classPrivateFieldGet(this, _HtmlGenerator_links, "f").unshift(links);
        const addLinks = (exported) => {
            for (const child of exported) {
                if (links.has(child.name)) {
                    continue;
                }
                links.set(child.name, {
                    title: child.name,
                    link: `${this.section.path}#${child.id}`,
                    style: "code"
                });
            }
        };
        addLinks(exported);
        for (const s of exported.allSupers) {
            addLinks(s);
        }
    }
    popLinks() {
        __classPrivateFieldGet(this, _HtmlGenerator_links, "f").shift();
    }
    append(line) {
        __classPrivateFieldGet(this, _HtmlGenerator_output, "f").push(line);
    }
    renderNode(node) {
        if (node instanceof TextNode) {
            return node.content;
        }
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
                }
                else {
                    style = "normal";
                }
                let external = "", target = "";
                if (link.indexOf(":/\/") >= 0) {
                    external = "external";
                    target = ` target="_blank"`;
                }
                return `<span class="style-link style-${style} ${external}"><a class="link-lit" href="${this.renderer.resolveLink(link)}"${target}>${content}</a></span>`;
            }
            console.log(`WARNING: missing link ${JSON.stringify(node.link)} (section: ${this.section.path})`);
            return `<span class="style-link missing-link">${content}</span>`;
        }
        if (node instanceof ListNode) {
            const items = node.items.map((i) => `<li>${this.renderNode(i)}</li>`);
            return `<ul class="style-list">${items.join("")}</ul>`;
        }
        if (node instanceof ElementNode) {
            let extraCls = "", extraAttr = "";
            if (node.style === "param" || node.style === "code") {
                extraCls = "notranslate ";
                extraAttr = ` translate="no"`;
            }
            return `<span class="${extraCls}style-${node.style}"${extraAttr}>${node.children.map((c) => this.renderNode(c)).join("")}</span>`;
        }
        console.log(node);
        throw new Error();
    }
    renderType(type) {
        if (type instanceof TypeBasic) {
            return `<span class="type basic">${type.type}</span>`;
        }
        else if (type instanceof TypeTodo) {
            return `<span class="type todo">${type.type}</span>`;
        }
        else if (type instanceof TypeFunction) {
            const params = type.params.map((p) => `<span class="">${p.name}${p.optional ? "?" : ""}: ${this.renderType(p.type)}</span>`);
            return `<span class="type wrapped">(${params.join(", ")}) => ${this.renderType(type.returns)}</span>`;
        }
        else if (type instanceof TypeGroup) {
            const types = type.types.map((t) => this.renderType(t));
            if (type.relation === "|" || type.relation === "&") {
                const symbol = ` ${type.relation} `;
                return `<span class="type group">${types.join(symbol)}</span>`;
            }
            let relation = type.relation;
            const link = this.renderer.getLink(relation);
            if (link) {
                relation = `<a class="link-lit" href="${this.renderer.resolveLink(link.link)}">${relation}</a>&thinsp;`;
            }
            return `<span class="type group">${relation}&lt;&thinsp;${types.join(", ")}&thinsp;&gt;</span>`;
        }
        else if (type instanceof TypeIdentifier) {
            const link = this.renderer.getLink(type.type);
            if (link) {
                return `<span class="type identifier"><a class="link-lit" href="${this.renderer.resolveLink(link.link)}">${type.type}</a></span>`;
            }
            return `<span class="type identifier">${type.type}</span>`;
        }
        else if (type instanceof TypeLiteral) {
            return `<span class="type literal">${type.type}</span>`;
        }
        else if (type instanceof TypeMapping) {
            const keys = Object.keys(type.children);
            keys.sort((a, b) => (a.localeCompare(b)));
            const mapping = keys.map((k) => `${k}: ${this.renderType(type.children[k])} `);
            return `<span class="type mapping">{ ${mapping.join(", ")} }</span>`;
        }
        else if (type instanceof TypeWrapped) {
            return `<span class="type wrapped">${type.wrapper}&lt;${this.renderType(type.child)} }&gt;</span>`;
        }
        console.log(type);
        throw new Error("unhandled");
    }
    appendNodes(nodes) {
        for (const node of nodes) {
            this.append(`<p>${this.renderNode(node)}</p>`);
        }
    }
    appendCode(script) {
        this.append(`<div class="notranslate code-block" translate="no">`);
        script.forEach(({ line, type }) => {
            this.append(`<span class="code-${type}">${htmlify(line)}</span>\n`);
        });
        this.append(`</div>`);
    }
    appendExported(exported) {
        const ex = exported.exported;
        const type = "todo";
        this.append(`<div class="type-${type} show-links">`);
        this.append(`<div class="notranslate signature" translate="no">`);
        this.append(`<a class="link anchor" name="${ex.id}" href="#${ex.id}">&nbsp;</a>`);
        const srcLink = this.renderer.getLink(`src:${ex.id}`);
        if (srcLink) {
            this.append(`<a class="link source" href="${srcLink.link}">&lt;src&gt;</a>`);
        }
        let isCtor = false;
        const prefix = (exported.exported).prefix;
        if (prefix) {
            if (exported.exported.name === "constructor") {
                this.append(`<span class="symbol new">new</span> <span class="name">${prefix}</span>`);
                isCtor = true;
            }
            else {
                this.append(`<span class="parent">${prefix}</span><span class="symbol dot">.</span>`);
            }
        }
        // Name
        if (!isCtor) {
            this.append(`<span class="name">${ex.name}</span>`);
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
                this.append(`<span class="param" data-text="${param.name}"><span class="param-name">${param.name}</span>${param.optional ? "?" : ""}: ${this.renderType(param.type)}</span>`);
            }
            this.append(`<span class="symbol close-paren paren">)</span>`);
        }
        // Return
        if (!isCtor && ex instanceof ReturnsExport) {
            this.append(`<span class="symbol arrow">&rArr; </span>`);
            this.append(`<span class="returns">${this.renderType(ex.returns)}</span>`);
        }
        this.append(`</div>`); // signature
        // Body
        this.append(`<div class="docs indent">`);
        this.appendContent(exported.body);
        this.append(`</div>`);
        // @TODO: examples
        this.append(`</div>`); // type-
    }
    appendContent(contents) {
        for (const content of contents) {
            if (content instanceof BodyContent) {
                if (content.tag !== "null") {
                    this.append(`<div class="title-${content.tag}">${this.renderNode(content.titleNode)}</div>`);
                }
                this.append(`<div>`);
                this.appendNodes(content.body);
                this.append(`</div>`);
            }
            else if (content instanceof CodeContent) {
                if (content.title.trim()) {
                    this.append(`<div class="title-${content.tag}">${content.title}</div>`);
                }
                this.appendCode(content.script);
            }
            else {
                console.log(content);
                throw new Error("unsupported content type");
            }
        }
    }
    appendLinkable(type, anchor, title, body, exported) {
        this.append(`<div class="type-${type} show-links">`);
        this.append(`<div class="title-${type}">`);
        if (anchor) {
            const link = this.renderer.getLink(anchor);
            this.append(`<a class="link anchor" name="${anchor}" href="${this.renderer.resolveLink(link.link)}">&nbsp;</a>`);
        }
        if (exported) {
            this.append(`<span class="type">${exported.type}</span>&nbsp;`);
        }
        this.append(this.renderNode(title));
        this.append(`</div>`);
        if (exported && exported.supers.length) {
            this.append(`<div class="supers">inherits from `);
            let comma = false;
            for (const s of exported.allSupers) {
                if (comma) {
                    this.append(`, `);
                }
                comma = true;
                const link = this.renderer.getLink(s.id);
                if (link) {
                    this.append(`<a class="link-lit" href="${this.renderer.resolveLink(link.link)}">`);
                }
                this.append(`<span class="super">${s.name}</a>`);
                if (link) {
                    this.append(`</a>`);
                }
            }
            this.append(`</div>`);
        }
        this.append(`<div class="docs">`);
        this.appendContent(body);
        this.append(`</div>`);
        this.append(`</div>`);
    }
    appendHeader() {
        //const prefix = this.renderer.document.config.prefix;
        this.append(`<html><head>`);
        this.append(`<link rel="stylesheet" href="${this.renderer.resolveLink("static/style-v2.css")}">`);
        this.append(`<meta property="og:title" content="Documentation">`);
        this.append(`<meta property="og:description" content="Documentation for ethers, a complete, tiny and simple Ethereum library.">`);
        this.append(`<meta property="og:image" content="${this.renderer.resolveLink("static/social.jpg")}">`);
        this.append(`</head><body>`);
    }
    appendSidebar() {
        const config = this.renderer.document.config;
        this.append(`<div class="sidebar"><div class="header">`);
        this.append(`<a class="logo" href="${this.renderer.resolveLink("")}"><div class="image"></div><div class="name">${config.title}</div><div class="version">${config.subtitle}</div></a>`);
        this.append(`</div><div class="toc">`);
        this.append(`<div class="title"><a href="${this.renderer.resolveLink("")}">DOCUMENTATION</a></div>`);
        for (const { depth, path, title, current, selected, highlit } of prepareToc(this.section, this.renderer)) {
            this.append(`<div data-depth="${depth}" class="depth-${depth}${current ? " current" : ""}${selected ? " selected" : ""}${highlit ? " highlight" : ""}"><a href="${this.renderer.resolveLink(path)}">${title}</a></div>`);
            if (!current) {
                continue;
            }
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
    beginContent() {
        this.append(`<div class="content">`);
    }
    endContent() {
        this.append(`</div>`);
    }
    appendBreadcrumbs() {
        this.append(`<div class="breadcrumbs">`);
        // The breadcrumbs; but on the root drop the empty string
        // since the root is always included
        const breadcrumbs = this.section.path.split("/").filter(Boolean);
        for (let i = 0; i <= breadcrumbs.length; i++) {
            let path = breadcrumbs.slice(0, i).join("/");
            if (i !== breadcrumbs.length) {
                const link = this.renderer.getLinkable(path);
                if (link == null) {
                    continue;
                }
                if (path !== "") {
                    path += "/";
                }
                this.append(`<a href="${this.renderer.resolveLink(path)}">${link.title}</a> <span class="symbol">&raquo;</span>`);
            }
            else {
                this.append(`<i>${this.section.title}</i>`);
            }
        }
        this.append(`</div>`);
    }
    appendCopyright() {
        const paths = this.renderer.document.sections.map((s) => s.path);
        const i = paths.indexOf(this.section.path);
        let prev = (i > 0) ? this.renderer.getLinkable(paths[i - 1]) : null;
        let next = (i < paths.length - 1) ? this.renderer.getLinkable(paths[i + 1]) : null;
        const genDate = "calcualte...";
        this.append(`<div class="footer"><div class="nav"><div class="clearfix"></div>`);
        if (prev) {
            this.append(`<div class="previous"><a href="${this.renderer.resolveLink(prev.path)}"><span class="arrow">&larr;</span>&nbsp;${prev.title}</a></div>`);
        }
        if (next) {
            this.append(`<div class="next"><a href="${this.renderer.resolveLink(next.path)}">${next.title}<span class="arrow">&rarr;</span></a></div>`);
        }
        this.append(`<div class="clearfix"></div></div><div class="copyright">The content of this site is licensed under the Creative Commons License. Generated on ${genDate}.</div></div>`);
    }
    appendFooter() {
        this.append(`<script type="module" src="${this.renderer.resolveLink("static/script-v2.js")}"></script></body></html>`);
    }
    appendChildren(type, item) {
        let ex = null;
        if (item instanceof Exported) {
            ex = (item.exported);
            this.pushLinks(ex);
        }
        this.appendLinkable(type, item.anchor, item.titleNode, item.body, ex);
        let lastType = "";
        for (const sub of item) {
            if (sub instanceof Exported) {
                const type = foldType[sub.exported.type];
                if (type !== lastType && type) {
                    lastType = type;
                    this.append(`<div class="title-heading">${type}</div>`);
                }
                if (sub.recursive) {
                    this.appendChildren("export", sub);
                }
                else {
                    this.appendExported(sub);
                }
            }
            else {
                this.appendChildren("subsection", sub);
            }
        }
        if (ex) {
            this.popLinks();
        }
    }
    render() {
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
_HtmlGenerator_output = new WeakMap(), _HtmlGenerator_links = new WeakMap();
export class HtmlRenderer {
    constructor(document) {
        _HtmlRenderer_links.set(this, void 0);
        _HtmlRenderer_targets.set(this, void 0);
        this.document = document;
        // Create a map of all link anchors
        __classPrivateFieldSet(this, _HtmlRenderer_links, new Map(document.config.links), "f");
        // Map href (e.g. "foo/bar") to their section
        __classPrivateFieldSet(this, _HtmlRenderer_targets, [], "f");
        __classPrivateFieldGet(this, _HtmlRenderer_targets, "f").push({ title: "Documentation", path: "", anchor: null });
        const srcBaseUrl = this.document.config.srcBaseUrl;
        const addLink = (item, style) => {
            try {
                const path = item.path;
                if (path) {
                    __classPrivateFieldGet(this, _HtmlRenderer_targets, "f").push(item);
                }
            }
            catch (error) { }
            if (srcBaseUrl && item instanceof Exported) {
                const ex = item.exported;
                __classPrivateFieldGet(this, _HtmlRenderer_links, "f").set(`src:${ex.id}`, {
                    link: (srcBaseUrl.replace(/{FILENAME}/g, ex.filename).replace(/{LINENO}/g, String(ex.lineno))),
                    style: "normal",
                    title: `source:${ex.id}`
                });
            }
            if (!item.anchor) {
                return;
            }
            if (__classPrivateFieldGet(this, _HtmlRenderer_links, "f").has(item.anchor)) {
                console.log("DUP:", item);
                throw new Error(`duplicate anchor: ${item.anchor}`);
            }
            const title = item.title;
            const link = item.path;
            __classPrivateFieldGet(this, _HtmlRenderer_links, "f").set(item.anchor, { title, link, style });
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
                        if (!(content instanceof Exported)) {
                            continue;
                        }
                        addLink(content, "code");
                        for (const ex of content) {
                            addLink(ex, "code");
                        }
                    }
                }
                else {
                    // Exported
                    addLink(subsection, "code");
                    for (const ex of subsection) {
                        addLink(ex, "code");
                    }
                }
            }
        }
        // Add links
    }
    get length() { return __classPrivateFieldGet(this, _HtmlRenderer_targets, "f").length; }
    [(_HtmlRenderer_links = new WeakMap(), _HtmlRenderer_targets = new WeakMap(), Symbol.iterator)]() {
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: __classPrivateFieldGet(this, _HtmlRenderer_targets, "f")[index++], done: false };
                }
                return { value: undefined, done: true };
            }
        };
    }
    getLink(anchor) {
        return __classPrivateFieldGet(this, _HtmlRenderer_links, "f").get(anchor);
    }
    getLinkable(href) {
        const matching = __classPrivateFieldGet(this, _HtmlRenderer_targets, "f").filter((t) => t.path === href);
        if (matching == null) {
            throw new Error(`no linkable found for ${href}`);
        }
        return matching[0];
    }
    resolveLink(href) {
        // @TODO: Use config.prefix
        return `/${href}`;
    }
    render() {
        const output = [];
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
            "style-v2.css",
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
//# sourceMappingURL=renderer-html2.js.map