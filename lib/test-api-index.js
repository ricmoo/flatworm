/*
import fs from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from 'url';

import { Config } from "./config2.js";
import {
    BodyContent, CodeContent, Content,
    Document, Section
} from "./document2.js";

import {
    ElementNode, LinkNode, ListNode, Node, TextNode,
    parseMarkdown
} from "./markdown.js";

//import { SearchBuilder } from "./search.js";

import type { Script } from "./script2.js";

import {
    ApiDocument,
    ClassExport, ConstExport, PropertyExport, Export, FunctionExport,
    ObjectExport, ReturnsExport,
    TypeExport,
    Type, TypeBasic, TypeFunction, TypeIdentifier, TypeGroup,
    TypeLiteral, TypeMapping, TypeTodo, TypeWrapped,
    ApiSection, ApiSubsection
} from "./jsdocs.js";

export type IndexEntryType = "class" | "constant" | "function" |
    "method" | "property" | "static_method" | "type" | "other";

export type IndexEntry = {
    text: string;
    sort: string;
    indent: number;
    type: IndexEntryType;
    highlight: null | { start: number, length: number };
    link: string;
};


type LinkMap = Map<string, { link: string, title: string, style: string }>

function renderNode(node: Node, links: LinkMap): string {
    if (node instanceof TextNode) { return node.content; }

    if (node instanceof LinkNode) {
        let content = node.link;
        if (node.children.length) {
            content = node.children.map((c) => renderNode(c, links)).join("");
        }

        if (links.has(node.link)) {
            let { link, style, title } = links.get(node.link);
            if (node.children.length === 0 && title) {
                content = title;
            } else {
                style = "normal";
            }
            let external = "", target = "";
            if (link.indexOf(":/\/") >= 0) {
                external = "external";
                target = ` target="_blank"`;
            }
            return `<span class="style-link style-${ style } ${ external }"><a class="link-lit" href="${ link }"${ target }>${ content }</a></span>`;
        }

        return `<span class="style-link missing-link">${ content }</span>`;
    }

    if (node instanceof ListNode) {
        const items = node.items.map((i) => `<li>${ renderNode(i, links) }</li>`);
        return `<ul class="style-list">${ items.join("") }</ul>`;
    }

    if (node instanceof ElementNode) {
        return `<span class="style-${ node.style }">${ node.children.map((c) => renderNode(c, links)).join("") }</span>`;
    }

    console.log(node);
    throw new Error();
}

function renderNodes(docs: Array<Node>, links: LinkMap): string {
    return docs.map((n) => `<p>${ renderNode(n, links) }</p>`).join("\n");
}

function renderDocs(docs: string, links: LinkMap): string {
    return renderNodes(parseMarkdown(docs), links);//.map((n) => `<p>${ renderNode(n, links) }</p>`).join("\n");
}

function renderContents(contents: Array<Content>, links: LinkMap): string {
    const output: Array<string> = [ ];

    for (const content of contents) {
        if (content instanceof BodyContent) {
            if (content.tag !== "null") {
                output.push(`<div class="title-${ content.tag }">${ renderNode(content.titleNode, links) }</div>`)
            }

            output.push(`<div><p>${ renderNodes(content.body, links) }</p></div>`);
        } else if (content instanceof CodeContent) {
            if (content.title.trim()) {
                output.push(`<div class="title-${ content.tag }">${ content.title }</div>`)
            }
            addExample(output, content.script);
        } else {
            throw new Error("not implemented");
        }
    }

    return output.join("");
}

export class IndexGroup {
    readonly header: string;
    readonly #entries: Array<IndexEntry>

    constructor(header: string) {
        this.header = header;
        this.#entries = [ ];
    }

    addEntry(entry: IndexEntry): void {
        this.#entries.push(entry);
    }

    get entries(): Array<IndexEntry> {
        const entries = this.#entries.slice();
        entries.sort((a, b) => (nameCompare(a.sort, b.sort)));
        return entries;
    }
}

function splitCamelFirstWord(v: string): Array<string> {
    // Single letter or non-letter; e.g. "P" or "_foo"
    if (v.length < 2 || !v.match(/^[a-z]/i)) { return [ v ]; }

    if (v.substring(0, 3).toUpperCase() === v.substring(0, 3)) {
        // Fully an acronym; e.g. "HTML"
        if (v === v.toUpperCase()) { return [ v ]; }

        // Contains an acronym as its first word; e.g. HDNodeWallet
        const match = v.match(/^([A-Z][A-Z]+)([A-Z].*)$/);
        if (match == null) {
            console.log({ v });
            throw new Error(`bad name1: ${ JSON.stringify(v) }`);
        }

        return [ match[1], match[2] ];
    }

    const match = v.match(/^([A-Za-z][a-z0-9]+)([A-Z].*)?$/);
    if (match == null) {
        console.log({ v });
        throw new Error(`bad name2: ${ JSON.stringify(v) }`);
    }

    return [ match[1], match[2] ];
}

function camelCase(v: string): string {
    const words = splitCamelFirstWord(v);
    if (words[0]) { words[0] = words[0].toLowerCase(); }
    return words.join("");
}

function CamelCase(v: string): string {
    const words = splitCamelFirstWord(v);
    if (words[0]) {
        words[0] = words[0][0].toUpperCase() + words[0].substring(1);
    }
    return words.join("");
}

export function getIndex(api: ApiDocument): Array<IndexGroup> {
    const groups: Map<string, IndexGroup> = new Map();
    const result: Array<IndexGroup> = [ ];

    const getGroup = function(name: string) {
        let header = name[0].toUpperCase();
        if (!header.match(/^[A-Z]$/)) { header = "*"; }
        let group = groups.get(header);
        if (!group) {
            group = new IndexGroup(header);
            groups.set(header, group);
            result.push(group);
        }
        return group;
    };

    for (const obj of api.objs) {
        const name = obj.name;
        const group = getGroup(name);
        if (obj instanceof ClassExport) {
            group.addEntry({
                text: name,
                sort: `${ name }%0-%`.toLowerCase(),
                indent: 0,
                type: "class",
                highlight: { start: 0, length: name.length },
                link: ""
            });

            const supers: Array<string> = [ ];
            const superProps: Set<string> = new Set();
            const superStaticProps: Set<string> = new Set();
            for (const s of obj.allSupers) {//of api.getSupers(obj.name)) {
                supers.push(s.name);
                for (const n of s.methods.keys()) { superProps.add(n); }
                for (const n of s.properties.keys()) { superProps.add(n); }
                if (s instanceof ClassExport) {
                    for (const n of s.staticMethods.keys()) { superStaticProps.add(n); }
                }
            }

            const classObjs: Array<{ type: IndexEntryType, objs: Map<string, ReturnsExport>, prefix: string, suffix: string, skip: Set<string> }> = [
                { type: "method", objs: obj.methods, prefix: camelCase(name), suffix: "()", skip: superProps },
                { type: "static_method", objs: obj.staticMethods, prefix: CamelCase(name), suffix: "()", skip: superStaticProps },
                { type: "property", objs: obj.properties, prefix: camelCase(name), suffix: "", skip: superProps  },
            ];

            for (const { prefix, skip, suffix, type, objs } of classObjs) {
                for (const obj of objs.values()) {
                    // Unnamed property; like Iterator property
                    if (obj.name == null) { continue; }

                    // Don't include super properties
                    if (skip.has(obj.name)) { continue; }

                    let text = `${ prefix }.${ obj.name }${ suffix }`;
                    let sort = `${ name }%5-%${ text }`.toLowerCase();
                    const highlight = { start: 0, length: prefix.length };
                    if (obj.name === "constructor") {
                        text = `new ${ name }()`
                        sort = `${ name }%1-%${ text }`.toLowerCase();
                        highlight.start = 4;
                    }

                    const entry: IndexEntry = {
                        text, sort, type, highlight,
                        indent: 1,
                        link: ""
                    }
                    group.addEntry(entry);

                    if (obj.name !== "constructor") {
                        getGroup(obj.name).addEntry(Object.assign({ }, entry, {
                            highlight: { start: (prefix.length + 1), length: text.length },
                            sort: `${ obj.name }${ suffix }%5-%${ prefix }`.toLowerCase(),
                            indent: 0
                        }));
                    }
                }
            }

            if (supers.length) {
                supers.sort(nameCompare)
                group.addEntry({
                    text: `related: ${ supers.join(", ") }`,
                    sort: `${ name }%9-%related`,
                    indent: 1, type: "other",
                    highlight: { start: 0, length: 8 },
                    link: ""
                });
            }

        } else if (obj instanceof FunctionExport) {
            group.addEntry({
                text: `${ name }()`,
                sort: name.toLowerCase(),
                indent: 0,
                type: "function",
                highlight: { start: 0, length: (name.length + 2) },
                link: ""
            });
        } else if (obj instanceof TypeExport) {
            group.addEntry({
                text: `${ name }`,
                sort: name.toLowerCase(),
                indent: 0,
                type: "type",
                highlight: { start: 0, length: name.length },
                link: ""
            });
        }
    }

    result.sort((a, b) => {
        return a.header.localeCompare(b.header);
    });
    return result;
}

function nameCompare(a: string, b: string): number {
    const ma = a.match(/^(.*[a-z_])([0-9]+)([^0-9].*)?$/i);
    const mb = b.match(/^(.*[a-z_])([0-9]+)([^0-9].*)?$/i);
    if (ma && mb && ma[1] === mb[1] && ma[3] === mb[3]) {
        return parseInt(ma[2]) - parseInt(mb[2]);
    }
    return a.localeCompare(b);
}

function htmlify(value: string): string {
    if (value == null) { return "undef"; }
    return value.replace(/&/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function generateIndex(api: ApiDocument) {
    const index = getIndex(api);
    ///console.log("=====================");
    const output: Array<string> = [ ];
    output.push(`<html><head><link rel="stylesheet" href="./style.css"></head><body>`);
    output.push(`<div class="search-container"><div class="search-box"><input id="search" placeholder="Search API" autocorrect="off" autocomplete="off" type="text" /></div></div>`);

    output.push(`<div class="tabs">`);
    for (const group of index) {
        output.push(`<a class="tab" data-text="${ group.header }" href="#${ group.header }">${ group.header }</a>`);
    }
    output.push(`</div>`);

    output.push(`<div class="content">`);
    for (const group of index) {
        ///console.log(`=== ${ group.header } ===`);
        output.push(`<div data-text="${ group.header }" class="group">`);
        output.push(`<a name="${ group.header }"></a>`);
        output.push(`<div class="header">${ group.header }</div>`);
        for (const entry of group.entries) {
            let text = entry.text;
            let initHide = (group.header === "*") ? "init-hide": "";
            if (entry.highlight) {
                const { start, length } = entry.highlight;
                text = text.substring(0, start) + "<b>" + text.substring(start, start + length) + "</b>" + text.substring(start + length);
            }
            if (!text.startsWith("<b>related:</b>")) {
                text = text.replace(/\s+/g, "&nbsp;");
                if (entry.indent) { initHide = "init-hide"; }
            }
            output.push(`<div data-text="${ entry.text.replace(/"/g, "&quot;") }" class="entry ${ entry.type } indent-${ entry.indent } ${ initHide }">${ text }</div>`);
            ///console.log(`${ repeat(" ", entry.indent * 3) }- ${ entry.text }`);
        }
        output.push(`</div>`);
    }
    output.push(`</div><script type="module" src="./script.js"></script></body></html>`);

    fs.writeFileSync("test.html", output.join("\n"));
}

function nameSort(a: Export, b: Export) {
    return nameCompare(a.name.toLowerCase(), b.name.toLowerCase());
}


function showType(type: Type, links: LinkMap): string {
    if (type instanceof TypeBasic) {
        return `<span class="type basic">${ type.type }</span>`
    } else if (type instanceof TypeTodo) {
        return `<span class="type todo">${ type.type }</span>`
    } else if (type instanceof TypeFunction) {
        const params = type.params.map((p) => `<span class="">${ p.name }${ p.optional ? "?": "" }: ${ showType(p.type, links) }</span>`);
        return `<span class="type wrapped">(${ params.join(", ") }) => ${ showType(type.returns, links) }</span>`
    } else if (type instanceof TypeGroup) {
        const types = type.types.map((t) => showType(t, links));
        if (type.relation === "|" || type.relation === "&") {
            const symbol = ` ${ type.relation } `;
            return `<span class="type group">${ types.join(symbol) }</span>`
        }
        let relation = type.relation;
        if (links.has(relation)) {
            const link = links.get(relation);
            relation = `<a class="link-lit" href="${ link }">${ relation }</a>&thinsp;`;
        }
        return `<span class="type group">${ relation }&lt;&thinsp;${ types.join(", ") }&thinsp;&gt;</span>`
    } else if (type instanceof TypeIdentifier) {
        const link = links.get(type.type);
        if (link) {
            return `<span class="type identifier"><a class="link-lit" href="${ link.link }">${ type.type }</a></span>`
        }
        return `<span class="type identifier">${ type.type }</span>`
    } else if (type instanceof TypeLiteral) {
        return `<span class="type literal">${ type.type }</span>`
    } else if (type instanceof TypeMapping) {
        const keys = Object.keys(type.children);
        keys.sort((a, b) => (a.localeCompare(b)));
        const mapping = keys.map((k) => `${ k }: ${ showType(type.children[k], links) } `);
        return `<span class="type mapping">{ ${ mapping.join(", ") } }</span>`
    } else if (type instanceof TypeWrapped) {
        return `<span class="type wrapped">${ type.wrapper }&lt;${ showType(type.child, links) } }&gt;</span>`
    }
    console.log(type);
    throw new Error("unhandled");
};


type _TocOffset = { depth: number, start: number, end: number };
type _LocalTocEntry = {
    depth: number,
    link: string,
    title: string,
    selected?: boolean,
    highlit?: boolean,
    hidden?: boolean,
    current?: boolean
};

function prepareLocalToc(path: string, toc: Array<{ path: string, entry: TocEntry, section: ApiSection | Section }>): Array<_LocalTocEntry> {
    const countDepth = (value: string) => {
        return (value.split("/").length - 1) + (value.split("#").length - 1);
    };

    const result: Array<_LocalTocEntry> = [ ];

    // Get all the TOC entries
    let current = -1;
    {
        let minDepth = -1, i = 0;
        for (const { entry } of toc) {

            // Ignore the root
            if (!entry.path) { continue; }

            // Get the depth and track the minimum depth
            const depth = countDepth(entry.link);
            if (minDepth === -1 || depth < minDepth) { minDepth = depth; }

            // Found the current entry
            if (path === entry.path) { current = i; }
            i++

            const { link, title } = entry;
            result.push({ depth, link, title });
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

function addHeader(api: ApiDocument, config: Config, output: Array<string>, section: ApiSection | Section, links: LinkMap, toc: Array<{ path: string, entry: TocEntry, section: ApiSection | Section }>): void {
    // Remove the root "documentation" node and get just the entries
    //const toc = _toc.filter((e) => (!!e.path)).map((e) => e.entry);

    output.push(`<html><head>`);
    output.push(`<link rel="stylesheet" href="/${ config.prefix }/static/style-v2.css">`);
    output.push(`<meta property="og:title" content="Documentation">`);
    output.push(`<meta property="og:description" content="Documentation for ethers, a complete, tiny and simple Ethereum library.">`);
    output.push(`<meta property="og:image" content="/${ config.prefix }/static/social.jpg">`);
    output.push(`</head><body>`);

    output.push(`<div class="sidebar"><div class="header">`);
    output.push(`<a class="logo" href="/${ config.prefix }/"><div class="image"></div><div class="name">${ config.title }</div><div class="version">${ config.subtitle }</div></a>`);
    output.push(`</div><div class="toc">`);
    output.push(`<div class="title"><a href="/${ config.prefix }/">DOCUMENTATION</a></div>`);

    for (const { depth, link, title, current, selected, highlit } of prepareLocalToc(section.path, toc)) {
        output.push(`<div data-depth="${ depth }" class="depth-${ depth }${ current ? " current": ""}${ selected ? " selected": "" }${ highlit ? " highlight": "" }"><a href="${ link }">${ title }</a></div>`);
        if (!current) { continue; }
        if (section instanceof ApiSection) {
            const subToc = addExports(api, [ ], links, section.objs);
            for (let i = 0; i < subToc.length; i++) {
                const { link, title } = subToc[i];
                const dedent = (i === (subToc.length - 1)) ? " dedent": "";
                output.push(`<div class="depth-${ depth + 1 } highlight sub${ dedent }"><a href="${ link }">${ title }</a></div>`);
            }
        } else {
            const subs = section.subsections;
            for (let i = 0; i < subs.length; i++) {
                const sub = subs[i];
                const anchor = links.get(sub.anchor);
                if (anchor == null) { continue; }
                const dedent = (i === (subs.length - 1)) ? " dedent": "";
                output.push(`<div class="depth-${ depth + 1 } highlight sub${ dedent }"><a href="${ anchor.link }">${ sub.title }</a></div>`);
            }
        }
    }
    output.push(`</div></div>`);
    output.push(`<div class="content"><div class="breadcrumbs">`);

    // The breadcrumbs; but on the root drop the empty string
    // since the root is always included
    const breadcrumbs = section.path.split("/").filter(Boolean);

    for (let i = 0; i <= breadcrumbs.length; i++) {
        let path = breadcrumbs.slice(0, i).join("/");
        const entry = toc.filter((e) => (e.path === path)).pop();
        if (i !== breadcrumbs.length) {
            if (entry == null) { continue; }
            if (path !== "") { path += "/"; }
            output.push(`<a href="/${ config.prefix }/${ path }">${ entry.section.navTitle }</a> <span class="symbol">&raquo;</span>`);
        } else {
            output.push(`<i>${ section.title }</i>`);
        }
    }

    output.push(`</div>`);
}

function addSection(output: Array<string>, links: LinkMap, section: Section): void {
    const anchor = section.anchor ? links.get(section.anchor): null;
    output.push(`<div class="show-links">`);
    if (anchor) {
        output.push(`<div class="section-title"><a class="link anchor" href="${ anchor.link }"></a>${ renderNode(section.titleNode, links) }</div>`);
    } else {
        output.push(`<div class="section-title">${ renderNode(section.titleNode, links) }</div>`);
    }

    output.push(`<div class="docs">${ renderContents(section.body, links) }</div>`);

    output.push(`</div>`);

    for (const subsection of section.subsections) {
        const anchor = subsection.anchor ? links.get(subsection.anchor): null;
        output.push(`<div class="show-links">`);
        if (anchor) {
            output.push(`<div class="title"><a class="link anchor" name="${ subsection.anchor }" href="${ anchor.link }"></a>${ renderNode(subsection.titleNode, links) }</div>`);
        } else {
            output.push(`<div class="title">${ renderNode(subsection.titleNode, links) }</div>`);
        }
        output.push(`<div class="docs">${ renderContents(subsection.body, links) }</div>`);
        output.push(`</div>`);
    }
}

function addSectionInfo(output: Array<string>, links: LinkMap, section: ApiSection): void {
    const anchor = links.get(section.anchor);
    output.push(`<div class="show-links">`);
    if (anchor) {
        output.push(`<div class="section-title"><a class="link anchor" href="${ anchor.link }">&nbsp;</a>${ section.title }</div>`);
    } else {
        output.push(`<div class="section-title">${ section.title }</div>`);
    }

    output.push(`<div class="docs">${ renderDocs(section.flatworm, links) }</div>`);

    output.push(`</div>`);
}

function addFooter(config: Config, output: Array<string>, previous: null | NavEntry, next: null | NavEntry, genDate: string): void {
    output.push(`<div class="footer"><div class="nav"><div class="clearfix"></div>`);
    if (previous) {
        output.push(`<div class="previous"><a href="${ previous.link }"><span class="arrow">&larr;</span>&nbsp;${ previous.title }</a></div>`);
    }
    if (next) {
        output.push(`<div class="next"><a href="${ next.link }">${ next.title }<span class="arrow">&rarr;</span></a></div>`);
    }
    output.push(`<div class="clearfix"></div></div><div class="copyright">The content of this site is licensed under the Creative Commons License. Generated on ${ genDate }.</div></div>`);
    output.push(`</div><script type="module" src="/${ config.prefix }/static/script-v2.js"></script></body></html>`);
}

function addExample(output: Array<string>, script: Script): void {
    output.push(`<div class="code-block">`);
    script.forEach(({ line, type }) => {
        output.push(`<span class="code-${ type }">${ htmlify(line) }</span>\n`);
    });
    output.push(`</div>`);
}

function addReturnsExport(output: Array<string>, links: LinkMap, obj: ReturnsExport): void {
    output.push(`<div class="type-${ obj.type } prop-info show-links">`);

    const srcLink = links.get(`src:${ obj.id }`);
    if (srcLink) {
        output.push(`<div class="signature"><a class="link anchor" name="${ obj.id }" href="#${ obj.id }">&nbsp;</a><a class="link source" href="${ srcLink.link }">&lt;src&gt;</a>`);
    } else {
        output.push(`<div class="signature"><a class="link anchor" name="${ obj.id }" href="#${ obj.id }">&nbsp;</a>`);
    }

    if (obj.prefix) {
        if (obj.name === "constructor") {
            output.push(`<span class="symbol new">new</span> <span class="name">${ obj.prefix }</span>`);
        } else {
            output.push(`<span class="parent">${ obj.prefix }</span><span class="symbol dot">.</span><span class="name">${ obj.name }</span>`);
        }
    } else {
        output.push(`<span class="name">${ obj.name }</span>`);
    }

    if (obj instanceof FunctionExport) {
        output.push(`<span class="symbol open-paren paren">(</span>`);
        let comma = false;
        for (const param of obj.params) {
            if (comma) {
                output.push(`<span class="symbol comma">, </span>`);
            }
            comma = true;
            output.push(`<span class="param" data-text="${ param.name }"><span class="param-name">${ param.name }</span>${ param.optional ? "?": "" }: ${ showType(param.type, links) }</span>`);
        }
        output.push(`<span class="symbol close-paren paren">)</span>`);
    }

    // Don't show return type for constructors
    if (obj.name !== "constructor") {
        output.push(`<span class="symbol arrow"><!--&#8680;-->&rArr; </span>`);
        output.push(`<span class="returns">${ showType(obj.returns, links) }</span>`);
    }

    // Categories (e.g. read-only)
    if (obj instanceof PropertyExport && obj.isReadonly) {
        output.push(`<span class="readonly category">read-only</span>`);
    }
    if (obj instanceof FunctionExport && obj.isAbstract) {
        output.push(`<span class="abstract category">abstract</span>`);
    }

    output.push(`</div>`);

    output.push(`<div class="docs">${ renderDocs(obj.flatworm, links) }</div>`);
    output.push(`</div>`);

    for (const example of obj.examples()) {
        addExample(output, example);
    }
}

// @TODO: remove API since supers exists on obj
function addObjectExport(api: ApiDocument, output: Array<string>, _links: LinkMap, obj: ObjectExport): Omit<TocEntry, "path"> {
    const name = obj.name;
    const toc: Omit<TocEntry, "path"> = { link: `#${ name }`, title: name, style: "code" };

    const links = new Map(_links);
    for (const [ name, ] of obj.methods) {
        if (links.has(name)) { continue; }
        const link = links.get(`${ obj.name }-${ name }`);
        if (!link) { continue; }
        links.set(name, link);
    }
    for (const [ name, ] of obj.properties) {
        if (links.has(name)) { continue; }
        const link = links.get(`${ obj.name }-${ name }`);
        if (!link) { continue; }
        links.set(name, link);
    }
    if (obj instanceof ClassExport) {
        if (obj.ctor && !links.has("constructor")) {
            links.set("constructor", {
                link: `${ obj.name }_new`,
                style: "normal",
                title: "constructor"
            });
        }
        for (const [ name, ] of obj.staticMethods) {
            if (links.has(name)) { continue; }
            const link = links.get(`${ obj.name }_${ name }`);
            if (!link) { continue; }
            links.set(name, link);
        }
    }

    const srcLink = links.get(`src:${ obj.id }`);

    output.push(`<div class="cls">`);
    output.push(`<div class="cls-info show-links">`);
    if (srcLink) {
        output.push(`<div class="title"><a class="link anchor" name="${ obj.name }" href="#${ obj.name }">&nbsp;</a><a class="link source" href="${ srcLink.link }">&lt;src&gt;</a><span class="type">${ obj.type }</span> <span>${ name }</span></div>`);
    } else {
        output.push(`<div class="title"><a class="link anchor" name="${ obj.name }" href="#${ obj.name }">&nbsp;</a><span class="type">${ obj.type }</span> <span>${ name }</span></div>`);
    }

    const superProps: Set<string> = new Set();
    const supers = obj.allSupers;
    if (supers.length) {
        output.push(`<div class="supers">inherits from`);
        let comma = "";
        for (const s of supers) {
            s.methods.forEach((obj) => { superProps.add(obj.name); });
            s.properties.forEach((obj) => { superProps.add(obj.name); });

            output.push(comma);
            comma = ", ";

            const link = links.get(s.name);
            if (link) {
                output.push(`<span class="super"><a class="link-lit" href="${ link.link }">${ s.name }</a></span>`);
            } else {
                output.push(`<span class="super">${ s.name }</span>`);
            }
        }
        output.push(`</div>`);
    }

    output.push(`<div class="cls docs">${ renderDocs(obj.flatworm, links) }</div>`);
    output.push(`</div>`);

    for (const example of obj.examples()) {
        addExample(output, example);
    }

    let staticMethods: Array<FunctionExport> = [ ];
    const creates = [ ];
    if (obj instanceof ClassExport) {
        staticMethods = Array.from(obj.staticMethods.values());
        for (let i = staticMethods.length - 1; i >= 0; i--) {
            const sm = staticMethods[i];
            if (sm.returns.type.indexOf(obj.name) >= 0) {
                creates.push(sm);
                staticMethods.splice(i, 1);
            }
        }
        staticMethods.sort(nameSort);
        if (obj.ctor) { creates.unshift(obj.ctor); }
    }

    const fields: Array<{ header: string, children: Array<ReturnsExport> }> = [
        {
            header: "PROPERTIES",
            children: Array.from(obj.properties.values()).sort(nameSort).filter((o) => !superProps.has(o.name))
        },
        {
            header: "CREATING INSTANCES",
            children: creates
        },
        {
            header: "METHODS",
            children:Array.from(obj.methods.values()).sort(nameSort).filter((o) => !superProps.has(o.name))
        },
        {
            header: "STATIC METHODS",
            children: staticMethods
        }
    ];

    for (const { header, children } of fields) {
        if (children.length === 0) { continue; }

        if (header) {
          output.push(`<div class="header">${ header }</div>`);
        }

        for (const child of children) {
            addReturnsExport(output, links, child);
        }
    }
    output.push(`</div>`);

    return toc;
}

function addTypeExport(output: Array<string>, links: LinkMap, obj: TypeExport): void {
    const srcLink = links.get(`src:${ obj.id }`);

    output.push(`<div class="type-type show-links">`);
    if (srcLink) {
        output.push(`<div class="signature"><a class="link anchor" name="${ obj.name }" href="#${ obj.name }">&nbsp;</a><a class="link source" href="${ srcLink.link }">&lt;src&gt;</a>`);
    } else {
        output.push(`<div class="signature"><a class="link anchor" name="${ obj.name }" href="#${ obj.name }">&nbsp;</a>`);
    }
    output.push(`<span class="name">${ obj.name }</span>`);
    output.push(`<span class="symbol arrow"><!--&#8680;-->&rArr; </span>`);
    const docTags = obj.docTags;
    if ("_returns" in docTags) {
        output.push(`<span class="returns">${ docTags._returns }</span>`);
    } else {
        output.push(`<span class="returns">${ showType(obj.returns, links) }</span>`);
    }
    output.push("</div>");
    output.push(`<div class="prop-info"><div class="docs">${ renderDocs(obj.flatworm, links) }</div></div>`);
    output.push("</div>");
}

type NavEntry = {
    link: string,
    title: string
};

export type TocEntry = {
    path: string;
    link: string;
    style: string;
    title: string;
};

// @TODO: remove api; supers is on obj
function addExports(api: ApiDocument, output: Array<string>, links: LinkMap, objs: Array<Export | ApiSubsection>): Array<Omit<TocEntry, "path">> {
    const toc = [ ];

    // Show all types
    const types = <Array<TypeExport>>objs.filter((o) => (o instanceof TypeExport));
    if (types.length) {
        toc.push({ link: "#-Types", title: "Types", style: "italic" });
        types.sort(nameSort);
        output.push(`<div class="show-links"><div class="header"><a class="link anchor" name="-Types" href="#-Types">&nbsp;</a>TYPES</div></div>`);
        for (const obj of types) {
            addTypeExport(output, links, obj);
        }
    }

    // Show all types
    const consts = <Array<ConstExport>>objs.filter((o) => (o instanceof ConstExport));
    if (consts.length) {
        toc.push({ link: "#-Consts", title: "Constants", style: "italic" });
        types.sort(nameSort);
        output.push(`<div class="show-links"><div class="header"><a class="link anchor" name="-Consts" href="#-Types">&nbsp;</a>CONSTANTS</div></div>`);
        for (const obj of consts) {
            addTypeExport(output, links, obj);
        }
    }

    // Show all functions
    const funcs = <Array<FunctionExport>>objs.filter((o) => (o instanceof FunctionExport));
    if (funcs.length) {
        toc.push({ link: "#-Functions", title: "Functions", style: "italic" });
        output.push(`<div class="show-links"><div class="header"><a class="link anchor" name="-Functions" href="#-Functions">&nbsp;</a>FUNCTIONS</div></div>`);
        for (const obj of funcs) {
            addReturnsExport(output, links, obj);
        }
    }

    // Show all Classes and Interfaces
    for (const obj of objs) {
        if (obj instanceof ObjectExport) {
            toc.push(addObjectExport(api, output, links, obj));
        } else if (!(obj instanceof Export)) {
            output.push(`<div class="subsection-info show-links">`);
            if (obj.anchor) {
                toc.push({ link: `#-${ obj.anchor }`, title: obj.title, style: "normal" });
                output.push(`<div class="title"><a class="link anchor" name="-${ obj.anchor }" href="#-${ obj.anchor }">&nbsp;</a><span>${ obj.title }</span></div>`);
            } else {
                output.push(`<div class="title"><span>${ obj.title }</span></div>`);
            }
            output.push(`<div class="docs">${ renderDocs(obj.flatworm, links) }</div>`);
            output.push(`</div>`);
            output.push(`<div class="subsection">`);
            addExports(api, output, links, obj.objs);
            output.push(`</div>`);
        }
    }

    return toc;
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

export async function generate(api: ApiDocument, doc: Document, config: Config) {
    const BASE_URL = config.srcBaseUrl;

    const toc = api.toc;

// @TODO: use obj.id
    const links = config.links;

    const addLink = (filename: string, obj: Export | ApiSubsection) => {
        if (obj instanceof ObjectExport) {
            links.set(obj.name, {
                link: `${ filename }#${ obj.name }`,
                style: "code",
                title: obj.name
            });
            links.set(`-Properties-${ obj.name }`, {
                link: `${ filename }#-Properties-${ obj.name }`,
                style: "normal",
                title: "properties"
            });
            links.set(`-Methods-${ obj.name }`, {
                link: `${ filename }#-Types-${ obj.name }`,
                style: "normal",
                title: "methods"
            });
            links.set(`src:${ obj.id }`, {
                link: (BASE_URL.replace(/{FILENAME}/g, obj.filename).replace(/{LINENO}/g, String(obj.lineno))),
                style: "normal",
                title: `source:${ obj.id }`
            });
            for (const [ name, o ] of obj.methods) {
                const anchor = `${ obj.name }-${ name }`;
                links.set(anchor, {
                    link: `${ filename }#${ anchor }`,
                    style: "code",
                    title: name
                });
                links.set(`src:${ o.id }`, {
                    link: (BASE_URL.replace(/{FILENAME}/g, o.filename).replace(/{LINENO}/g, String(o.lineno))),
                    style: "normal",
                    title: `source:${ o.id }`
                });
            }
            for (const [ name, o ] of obj.properties) {
                const anchor = `${ obj.name }-${ name }`;
                links.set(anchor, {
                    link: `${ filename }#${ anchor }`,
                    style: "code",
                    title: name
                });
                links.set(`src:${ o.id }`, {
                    link: (BASE_URL.replace(/{FILENAME}/g, o.filename).replace(/{LINENO}/g, String(o.lineno))),
                    style: "normal",
                    title: `source:${ o.id }`
                });
            }
            if (obj instanceof ClassExport) {
                links.set(`-StaticMethods-${ obj.name }`, {
                    link: `${ filename }#-StaticMethods-${ obj.name }`,
                    style: "normal",
                    title: "Static Methods"
                });
                for (const [ name, o ] of obj.staticMethods) {
                    const anchor = `${ obj.name }_${ name }`;
                    links.set(anchor, {
                        link: `${ filename }#${ anchor }`,
                        style: "code",
                        title: name
                    });
                    links.set(`src:${ o.id }`, {
                        link: (BASE_URL.replace(/{FILENAME}/g, o.filename).replace(/{LINENO}/g, String(o.lineno))),
                        style: "normal",
                        title: `source:${ o.id }`
                    });
                }
                if (obj.ctor) {
                    const name = `${ obj.name }_new`;
                    links.set(name, {
                        link: `${ filename }#${ name }`,
                        style: "normal",
                        title: "constructor"
                    });
                    links.set(`src:${ obj.ctor.id }`, {
                        link: (BASE_URL.replace(/{FILENAME}/g, obj.ctor.filename).replace(/{LINENO}/g, String(obj.ctor.lineno))),
                        style: "normal",
                        title: `source:${ obj.ctor.id }`
                    });
                }
            }
        } else if (obj instanceof Export) {
            links.set(obj.name, {
                link: `${ filename }#${ obj.name }`,
                style: "code",
                title: obj.name
            });
            links.set(`src:${ obj.id }`, {
                link: (BASE_URL.replace(/{FILENAME}/g, obj.filename).replace(/{LINENO}/g, String(obj.lineno))),
                style: "normal",
                title: `source:${ obj.id }`
            });
        } else {
            if (obj.anchor) {
                const link = `${ filename }#-${ obj.anchor }`;
                links.set(obj.anchor, {
                    link,
                    style: "normal",
                    title: obj.title
                });
            }
            for (const o of obj.objs) {
                addLink(filename, o);
            }
        }
    };

    const mainToc: Array<{ path: string, entry: TocEntry, section: Section | ApiSection }> = [ ];

    const now = (new Date()).getTime();

    for (const section of doc.sections) {

        //if (section.path === "") { continue; }
        const title = section.title;
        const filename = join("/", config.prefix, section.path + "/");
        mainToc.push({
            path: section.path,
            entry: { path: section.path, link: filename, style: "normal", title },
            section
        });

        if (section.anchor) {
            if (links.has(section.anchor)) { throw new Error(`duplicate anchor: ${ section.anchor }`); }
            links.set(section.anchor, {
                link: filename,
                style: "normal",
                title: section.title
            });
        }

        for (const subsection of section.subsections) {
            if (!subsection.anchor) { continue; }
            if (links.has(subsection.anchor)) { throw new Error(`duplicate anchor: ${ subsection.anchor }`); }
            links.set(subsection.anchor, {
                link: `${ filename }#${ subsection.anchor }`,
                style: "normal",
                title: section.title
            });
        }
    }

    for (const [ path, section ] of toc) {
        const filename = join("/", config.prefix, path + "/");

        const entry = { path, link: filename, style: "normal", title: section.title };
        mainToc.push({ path, entry, section });

        if (section.anchor) {
            //addExports([ ], links, section.objs).forEach((entry) => {
            //    mainToc.push({
            //        link: `${ filename }#${ entry.link }`,
            //        title: entry.title,
            //        style: "normal"
            //    });
            //});

            links.set(section.anchor, entry);
        }

        for (const obj of section.objs) {
            addLink(filename, obj);
        }
    }

    const pris: Map<string, number> = mainToc.reduce((accum, {
    entry, section }) => {
        if (section instanceof Section) {
            accum.set(entry.link, section.priority);
        }
        return accum;
    }, <Map<string, number>>(new Map()));

    mainToc.sort((a, b) => {
        const compsA = a.entry.link.split("#")[0].split("/");
        while (compsA.length && compsA[0] === "") { compsA.shift(); }
        while (compsA[compsA.length - 1] === "") { compsA.pop(); }
        const compsB = b.entry.link.split("#")[0].split("/");
        while (compsB.length && compsB[0] === "") { compsB.shift(); }
        while (compsB[compsB.length - 1] === "") { compsB.pop(); }
        let prefix = "/";
        while (compsA.length && compsB.length) {
            const compA = compsA.shift(), compB = compsB.shift();
            const cmp = compA.localeCompare(compB);
            if (cmp === 0) {
                prefix += compA + "/";
                continue;
            }

            const priA = pris.get(`${prefix}${compA}/`) || 0;
            const priB = pris.get(`${prefix}${compB}/`) || 0;
            if (priA !== priB) { return priB - priA; }

            if (compsA.length === 0 && compsB.length === 0) {
                return a.entry.title.localeCompare(b.entry.title);
            }

            return cmp;
        }
        return compsA.length - compsB.length;
    });

    const tsCache: Map<string, number> = new Map();
    const getTs = async (path: string) => {
        let ts = tsCache.get(path);
        if (ts == null) {
            ts = await config.getTimestamp(path);
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

//    const searcher = new SearchBuilder();

    for (let i = 0; i < mainToc.length; i++) {
        const { path, section } = mainToc[i];

        const output: Array<string> = [ ];
        addHeader(api, config, output, section, links, mainToc);

        if (section instanceof Section) {
            addSection(output, links, section);

        } else {
            addSectionInfo(output, links, section);
            const localToc = addExports(api, [ ], links, section.objs);

            output.push(`<ul class="toc">`)
            for (const entry of localToc) {
                output.push(`<li class="style-${ entry.style }"><a class-"link-lit" href="${ entry.link }">${ entry.title }</a></li>`);
            }
            output.push(`</ul>`)

            addExports(api, output, links, section.objs);
        }

        let previousEntry: null | NavEntry = null;
        let nextEntry: null | NavEntry = null;
        if (mainToc[i - 1]) {
            const { entry, section } = mainToc[i - 1];
            previousEntry = { link: entry.link, title: section.title };
        }
        if (mainToc[i + 1]) {
            const { entry, section } = mainToc[i + 1];
            nextEntry = { link: entry.link, title: section.title };
        }
        addFooter(config, output, previousEntry, nextEntry, getTimestamp(await getGenDate(section.dependencies)));

        const filename = resolve("output/docs", config.prefix, path, "index.html");
        fs.mkdirSync(dirname(filename), { recursive: true });
        fs.writeFileSync(filename, output.join(""));
    }

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
        "style-v2.css"
    ].forEach((_filename) => {
        const filename = resolve(__dirname, "../static", _filename);
        const target = resolve("output/docs", config.prefix, "static", _filename);
        const content = fs.readFileSync(filename);
        fs.mkdirSync(dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    });

    config.staticFiles.forEach((_filename) => {
        const filename = config.resolve(_filename);
        const target = resolve("output/docs", config.prefix, "static", _filename);
        const content = fs.readFileSync(filename);
        fs.mkdirSync(dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    });

}

(async function() {
    const path = resolve(process.argv[2]);
    const config = await Config.fromPath(path);

    const api = new ApiDocument(config.codeRoot);
//    await api.evaluate(config);

    const doc = Document.fromConfig(config);
//    await doc.evaluate();

    generate(api, doc, config);
})();
*/
//# sourceMappingURL=test-api-index.js.map