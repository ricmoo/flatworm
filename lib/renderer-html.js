// @TODO: Move link stuff to document
// @TODO: Move TOC logic (including depth) to SectionWithBody
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
var _Generator_output, _Generator_links, _HtmlRenderer_links, _HtmlRenderer_targets;
import fs from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from 'url';
import { BodyContent, CodeContent, Section, Subsection, Exported, } from "./document.js";
import { ElementNode, LinkNode, ListNode, TextNode } from "./markdown.js";
import { FunctionExport, ReturnsExport, ObjectExport, PropertyExport, TypeBasic, TypeTodo, TypeFunction, TypeGroup, TypeIdentifier, TypeLiteral, TypeMapping, TypeWrapped } from "./jsdocs.js";
import { OutputFile, Renderer } from "./renderer.js";
function htmlify(value) {
    if (value == null) {
        return "undef";
    }
    return value.replace(/&/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const Months = [
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"
];
function getTimestamp(value) {
    const now = new Date(value);
    let hours = now.getHours();
    let meridian = "am";
    if (hours >= 12) {
        hours -= 12;
        meridian = "pm";
    }
    else if (hours === 0) {
        hours = 12;
    }
    let minutes = String(now.getMinutes());
    if (minutes.length < 2) {
        minutes = "0" + minutes;
    }
    return [
        Months[now.getMonth()], " ",
        now.getDate(), ", ",
        now.getFullYear(), ", ",
        hours, ":",
        minutes,
        meridian
    ].join("");
}
// @TODO: Rename path => link or href?
function prepareToc(renderer, section) {
    const countDepth = (entry) => {
        const value = entry.path;
        let count = value.split("/#")[0].split("/").length - 1;
        return count + entry.depth;
    };
    const result = [];
    // Get all the TOC entries
    let current = -1;
    let parent = null;
    {
        let minDepth = -1, i = 0;
        for (const entry of renderer) {
            const { path, title } = entry;
            // Ignore the root
            if (!path || path.startsWith("#")) {
                continue;
            }
            // Get the depth and track the minimum depth
            const depth = countDepth(entry);
            if (minDepth === -1 || depth < minDepth) {
                minDepth = depth;
            }
            // Found the current entry
            if (section && section.path === path) {
                current = i;
                parent = entry;
            }
            i++;
            const sub = (parent && entry.parent === parent);
            if (result.length && !sub && result[result.length - 1].sub) {
                result[result.length - 1].dedent = true;
            }
            result.push({ depth, path, sub, title });
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
    if (!section) {
        return result;
    }
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
;
const foldType = {
    // Bare types
    "const": "CONSTANTS",
    "type": "TYPES",
    "function": "FUNCTIONS",
    // Objects (Classes and Interfaces)
    "property": "PROPERTIES",
    "method": "METHODS",
    // Classes
    "constructor": "CREATING INSTANCES",
    "create": "CREATING INSTANCES",
    "static method": "STATIC METHODS",
    // Give these the Subsetion treatment
    "interface": "",
    "abstract class": "",
    "class": ""
};
class Generator {
    constructor(renderer) {
        _Generator_output.set(this, void 0);
        _Generator_links.set(this, void 0);
        this.renderer = renderer;
        this.toc = [];
        __classPrivateFieldSet(this, _Generator_output, [], "f");
        __classPrivateFieldSet(this, _Generator_links, [new Map()], "f");
    }
    clear() { __classPrivateFieldSet(this, _Generator_output, [], "f"); }
    get output() { return __classPrivateFieldGet(this, _Generator_output, "f").join(""); }
    append(line) { __classPrivateFieldGet(this, _Generator_output, "f").push(line); }
    resolveLink(link) {
        return this.renderer.resolveLink(link);
    }
    resolveAnchor(item) {
        return item.anchor || item.sid;
    }
    getLink(anchor) {
        for (const links of __classPrivateFieldGet(this, _Generator_links, "f")) {
            const link = links.get(anchor);
            if (link) {
                return link;
            }
        }
        return this.renderer.getLink(anchor);
    }
    pushLinks(basePath, exported) {
        const links = new Map();
        __classPrivateFieldGet(this, _Generator_links, "f").unshift(links);
        const addLinks = (exported) => {
            for (const child of exported) {
                if (links.has(child.name)) {
                    continue;
                }
                links.set(child.name, {
                    title: child.name,
                    link: `${basePath}#${child.id}`,
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
        __classPrivateFieldGet(this, _Generator_links, "f").shift();
    }
    appendChildren(type, item) {
        let ex = null;
        if (item instanceof Exported) {
            ex = item;
            this.pushLinks(item.path, (item.exported));
        }
        this.toc.push(item);
        this.appendLinkable(item, ex);
        let lastType = "";
        for (const sub of item) {
            if (sub instanceof Exported) {
                const type = foldType[sub.exported.type];
                if (type !== lastType && type) {
                    lastType = type;
                    this.appendHeading(type);
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
    // Appends a heading
    appendHeading(title) {
    }
    // Appends a non-recursive Exported (e.g. function or type)
    appendExported(exported) {
    }
    // Appends a linkable section
    appendLinkable(item, exported) {
    }
}
_Generator_output = new WeakMap(), _Generator_links = new WeakMap();
class HtmlGenerator extends Generator {
    //    constructor(renderer: HtmlRenderer) {
    //        super(renderer);
    //    }
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
                let extraCls = "", extraAttr = "";
                if (style === "code") {
                    extraCls = "notranslate ";
                    extraAttr = ` translate="no"`;
                }
                let external = "", target = "";
                if (link.indexOf(":/\/") >= 0) {
                    external = "external";
                    target = ` target="_blank"`;
                }
                return `<span class="${extraCls}style-link style-${style} ${external}"${extraAttr}><a class="link-lit" href="${this.resolveLink(link)}"${target}>${content}</a></span>`;
            }
            console.log(`WARNING: missing link ${JSON.stringify(node.link)}`);
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
                relation = `<a class="link-lit" href="${this.resolveLink(link.link)}">${relation}</a>&thinsp;`;
            }
            return `<span class="type group">${relation}&lt;&thinsp;${types.join(", ")}&thinsp;&gt;</span>`;
        }
        else if (type instanceof TypeIdentifier) {
            const link = this.renderer.getLink(type.type);
            if (link) {
                return `<span class="type identifier"><a class="link-lit" href="${this.resolveLink(link.link)}">${type.type}</a></span>`;
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
            return `<span class="type wrapped">${type.wrapper}&lt;${this.renderType(type.child)}&gt;</span>`;
        }
        console.log(type);
        throw new Error("unhandled");
    }
    appendHeading(title) {
        this.append(`<div class="title-heading">${title}</div>`);
    }
    appendNodes(nodes) {
        for (const node of nodes) {
            this.append(`<p><a name="nid_${node.id}"></a>${this.renderNode(node)}</p>`);
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
        this.append(`<div class="type-export show-links">`);
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
            if (ex instanceof PropertyExport && ex.isReadonly) {
                this.append(`<span class="category readonly">read-only</span>`);
            }
            if (ex instanceof FunctionExport && ex.isAbstract) {
                this.append(`<span class="category abstract">abstract</span>`);
            }
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
    appendContent(contents) {
        for (const content of contents) {
            if (content instanceof BodyContent) {
                let addName = `<a name="${content.anchor}"></a>`;
                if (content.tag !== "null") {
                    this.append(`<div class="title-${content.tag}">${addName}${this.renderNode(content.titleNode)}</div>`);
                    addName = "";
                }
                this.append(`<div>${addName}`);
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
    appendLinkable(item, exported) {
        const objExport = (exported && exported.exported instanceof ObjectExport) ? exported.exported : null;
        this.append(`<div class="type-${item.directive} show-links">`);
        this.append(`<div class="title-${item.directive}">`);
        //const link = this.renderer.getLink(item.anchor);
        //this.append(`<a class="link anchor" name="${ item.anchor }" href="${ this.resolveLink(link.link) }">&nbsp;</a>`);
        const anchor = this.resolveAnchor(item);
        this.append(`<a class="link anchor" name="${anchor}" href="#${anchor}">&nbsp;</a>`);
        if (objExport) {
            this.append(`<span class="type">${objExport.type}</span>&nbsp;`);
        }
        this.append(this.renderNode(item.titleNode));
        this.append(`</div>`);
        if (objExport && objExport.supers.length) {
            this.append(`<div class="supers">inherits from `);
            let comma = false;
            for (const s of objExport.allSupers) {
                if (comma) {
                    this.append(`, `);
                }
                comma = true;
                const link = this.renderer.getLink(s.id);
                if (link) {
                    this.append(`<a class="link-lit" href="${this.resolveLink(link.link)}">`);
                }
                this.append(`<span class="super">${s.name}</a>`);
                if (link) {
                    this.append(`</a>`);
                }
            }
            this.append(`</div>`);
        }
        this.append(`<div class="docs">`);
        this.appendContent(item.body);
        this.append(`</div>`);
        if (exported) {
            for (const ex of exported.examples) {
                this.appendCode(ex);
            }
        }
        this.append(`</div>`);
    }
    render(section) {
        this.clear();
        this.appendChildren("section", section);
        return this.output;
    }
}
class WrappedHtmlGenerator extends HtmlGenerator {
    appendHeader() {
        this.append(`<html><head>`);
        this.append(`<link rel="stylesheet" href="${this.resolveLink("static/style.css")}">`);
        this.append(`<meta property="og:title" content="Documentation">`);
        this.append(`<meta property="og:description" content="Documentation for ethers, a complete, tiny and simple Ethereum library.">`);
        this.append(`<meta property="og:image" content="${this.resolveLink("static/social.jpg")}">`);
        this.append(`</head><body>`);
    }
    appendSidebar(target, title, section) {
        const config = this.renderer.document.config;
        this.append(`<div class="sidebar"><div class="header">`);
        this.append(`<a class="logo" href="${this.resolveLink("")}"><div class="image"></div><div class="name">${config.title}</div><div class="version">${config.subtitle}</div></a><div class="show-toc"><div class="icon-menu"></div><div class="icon-close"></div></div>`);
        this.append(`<div class="search"><form action="${this.resolveLink("search")}" method="GET"><input name="search" id="search" /></form></div>`);
        this.append(`</div><div class="toc">`);
        this.append(`<div class="title"><a href="${this.resolveLink("")}">DOCUMENTATION</a></div>`);
        for (const { depth, sub, dedent, path, title, current, selected, highlit } of prepareToc(this.renderer, section)) {
            this.append(`<div data-depth="${depth}" class="depth-${depth}${current ? " current" : ""}${selected ? " selected" : ""}${highlit ? " highlight" : ""}${dedent ? " dedent" : ""}${sub ? " sub" : ""}"><a href="${this.resolveLink(path)}">${title}</a></div>`);
        }
        this.append(`</div>`);
        if (target != null && title != null) {
            this.append(`<div class="alt-link"><a href="${target}">${title}</a></div>`);
        }
        this.append(`</div>`);
    }
    beginContent() {
        this.append(`<div class="content">`);
    }
    endContent() {
        this.append(`</div>`);
    }
    appendBreadcrumbs(section) {
        this.append(`<div class="breadcrumbs">`);
        // The breadcrumbs; but on the root drop the empty string
        // since the root is always included
        const breadcrumbs = section.path.split("/").filter(Boolean);
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
                this.append(`<a href="${this.resolveLink(path)}">${link.navTitle || link.title}</a> <span class="symbol">&raquo;</span>`);
            }
            else {
                this.append(`<i>${section.title}</i>`);
            }
        }
        this.append(`</div>`);
    }
    appendCopyright(section) {
        const paths = this.renderer.document.sections.map((s) => s.path);
        const i = paths.indexOf(section.path);
        let prev = (i > 0) ? this.renderer.getLinkable(paths[i - 1]) : null;
        let next = (i < paths.length - 1) ? this.renderer.getLinkable(paths[i + 1]) : null;
        this.append(`<div class="footer"><div class="nav"><div class="clearfix"></div>`);
        if (prev) {
            this.append(`<div class="previous"><a href="${this.resolveLink(prev.path)}"><span class="arrow">&larr;</span>&nbsp;${prev.title}</a></div>`);
        }
        if (next) {
            this.append(`<div class="next"><a href="${this.resolveLink(next.path)}">${next.title}<span class="arrow">&rarr;</span></a></div>`);
        }
        this.append(`<div class="clearfix"></div></div><div class="copyright">The content of this site is licensed under the Creative Commons License. Generated on ${getTimestamp(section.mtime)}.</div></div>`);
    }
    appendFooter() {
        this.append(`<script type="module" src="${this.resolveLink("static/script.js")}"></script></body></html>`);
    }
    render(section) {
        this.clear();
        this.appendHeader();
        this.appendSidebar(this.resolveLink("single-page"), "Single Page", section);
        this.beginContent();
        this.appendBreadcrumbs(section);
        this.appendChildren("section", section);
        this.appendCopyright(section);
        this.endContent();
        this.appendFooter();
        return this.output;
    }
}
function normalizeAnchor(anchor) {
    return anchor.replace("/#", "#").replace(/#/g, "__").replace(/\//g, "_");
}
class InPageHtmlGenerator extends HtmlGenerator {
    resolveAnchor(item) {
        return normalizeAnchor(item.path);
    }
    resolveLink(link) {
        // Static file
        if (link.indexOf(".") >= 0 || link === "search") {
            return super.resolveLink(link);
        }
        return `${super.resolveLink("single-page")}#${normalizeAnchor(link)}`;
    }
}
class InPageWrappedHtmlGenerator extends WrappedHtmlGenerator {
    resolveAnchor(item) {
        return normalizeAnchor(item.path);
    }
    resolveLink(link) {
        // Static file
        if (link.indexOf(".") >= 0 || link === "search") {
            return super.resolveLink(link);
        }
        return `${super.resolveLink("single-page")}#${normalizeAnchor(link)}`;
    }
}
export class HtmlRenderer extends Renderer {
    constructor(document) {
        super(document);
        _HtmlRenderer_links.set(this, void 0);
        _HtmlRenderer_targets.set(this, void 0);
        // Create a map of all link anchors
        __classPrivateFieldSet(this, _HtmlRenderer_links, new Map(document.config.links), "f");
        // Map href (e.g. "foo/bar") to their section
        __classPrivateFieldSet(this, _HtmlRenderer_targets, [], "f");
        __classPrivateFieldGet(this, _HtmlRenderer_targets, "f").push(new Section("Documentation", ""));
        const srcBaseUrl = this.document.config.srcBaseUrl;
        const addLink = (item, style) => {
            //try {
            //    const path = item.path;
            //    if (path) { this.#targets.push(item); }
            //} catch (error) { }
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
        // Build TOC
        for (const section of document) {
            const toc = new Generator(this);
            toc.appendChildren("section", section);
            for (const link of toc.toc) {
                __classPrivateFieldGet(this, _HtmlRenderer_targets, "f").push(link);
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
    render() {
        const rewrite = (filename) => {
            return this.resolveLink(filename).substring(1);
        };
        const output = [];
        const __dirname = dirname(fileURLToPath(import.meta.url));
        [
            "link.svg",
            "menu.svg",
            "close.svg",
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
            "search.js",
            "script.js",
            "style.css",
        ].forEach((_filename) => {
            const filename = resolve(__dirname, "../static", _filename);
            const target = join("static", _filename);
            const content = fs.readFileSync(filename);
            output.push(new OutputFile(rewrite(target), content));
        });
        const config = this.document.config;
        config.staticFiles.forEach((_filename) => {
            const filename = config.resolve(_filename);
            const target = join("static", _filename);
            const content = fs.readFileSync(filename);
            output.push(new OutputFile(rewrite(target), content));
        });
        for (const section of this.document) {
            const filename = section.path; // @TODO: Add prefix
            const content = new WrappedHtmlGenerator(this);
            content.render(section);
            output.push(new OutputFile(rewrite(filename), content.output));
        }
        // Add search page
        {
            const search = new WrappedHtmlGenerator(this);
            search.clear();
            search.appendHeader();
            search.appendSidebar(null, null, this.document.sections[0]);
            search.beginContent();
            search.append(`<div class="breadcrumbs"><i>Search</i></div>`);
            search.append(`<div class="title-section">Search</div>`);
            search.append("");
            search.append(`<div class="footer"><div class="copyright">The content of this site is licensed under the Creative Commons License. Generated on ${getTimestamp((new Date()).getTime())}.</div></div>`);
            search.endContent();
            search.append(`<script src="${this.resolveLink("static/search.js")} " type="text/javascript"></script>`);
            search.appendFooter();
            output.push(new OutputFile(rewrite("search"), search.output));
        }
        // Render single-page HTML
        {
            const single = new InPageWrappedHtmlGenerator(this);
            single.clear();
            single.appendHeader();
            single.appendSidebar(this.resolveLink(""), "Split Pages");
            single.beginContent();
            single.append(`<div class="breadcrumbs"><i>Documentation (single page)</i></div>`);
            let mtime = 0;
            for (const section of this.document) {
                if (section.mtime > mtime) {
                    mtime = section.mtime;
                }
                const inpage = new InPageHtmlGenerator(this);
                const content = inpage.render(section);
                single.append(content);
            }
            single.append(`<div class="footer"><div class="copyright">The content of this site is licensed under the Creative Commons License. Generated on ${getTimestamp(mtime)}.</div></div>`);
            single.endContent();
            single.appendFooter();
            let html = single.output.replace("<body>", '<body class="single-page">');
            output.push(new OutputFile(rewrite("single-page"), html));
        }
        return output;
    }
}
//# sourceMappingURL=renderer-html.js.map