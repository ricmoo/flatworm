import fs from "fs";
import { dirname, join, resolve } from "path";

import { Config } from "./config2.js";

import {
    ElementNode, LinkNode, ListNode, Node, TextNode,
    parseMarkdown
} from "./markdown.js";

import {
    API,
    ClassExport, ConstExport, PropertyExport, Export, FunctionExport,
    ObjectExport, ReturnsExport,
    TypeExport,
    Type, TypeBasic, TypeFunction, TypeIdentifier, TypeGroup,
    TypeLiteral, TypeMapping, TypeTodo, TypeWrapped
} from "./jsdocs.js";

import type { Section, Subsection } from "./jsdocs.js";


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
            if (link.indexOf(":") >= 0) {
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

function renderDocs(docs: string, links: LinkMap): string {
    return parseMarkdown(docs).map((n) => `<p>${ renderNode(n, links) }</p>`).join("\n");
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

export function getIndex(api: API): Array<IndexGroup> {
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
            for (const s of api.getSupers(obj.name)) {
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

/*
function repeat(c: string, width: number): string {
    let result = c;
    while (result.length < width) { result += result; }
    return result.substring(0, width);
}
*/
/*
function htmlify(value: string): string {
    if (value == null) { return "undef"; }
    return value.replace(/&/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
*/
export function generateIndex(api: API) {
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



function addHeader(output: Array<string>, links: LinkMap, toc: Array<TocEntry>, section: Section): void {
    const anchor = links.get(section.anchor);
    output.push(`<html><head><link rel="stylesheet" href="/style-all.css"></head><body>`);

    output.push(`<div class="sidebar"><div class="header">`);
    output.push(`<a class="logo" href="/"><div class="image"></div><div class="name">ethers</div><div class="version">v6-beta</div></a>`);
    output.push(`</div><div class="toc">`);
    output.push(`<div class="title"><a href="/">DOCUMENTATION</a></div>`);
    const countDepth = (value: string) => {
        return (value.split("/").length - 1) + (value.split("#").length - 1);
    };

    const minDepth = toc.reduce((accum, e) => {
        const depth = countDepth(e.link);
        if (accum === -1 || depth < accum) { return depth; }
        return accum;
    }, <number>(-1));

    for (const entry of toc) {
        output.push(`<div class="depth-${ countDepth(entry.link) - minDepth}"><a href="${ entry.link }">${ entry.title }</a></div>`);
    }
    output.push(`</div></div>`);

    output.push(`<div class="content">`);
    output.push(`<div class="show-links">`);
    if (anchor) {
        output.push(`<div class="section-title"><a class="link anchor" href="${ anchor.link }">&nbsp;</a>${ section.title }</div>`);
    } else {
        output.push(`<div class="section-title">${ section.title }</div>`);
    }
    output.push(`<div class="docs">${ renderDocs(section.flatworm, links) }</div>`);
    output.push(`</div>`);
}

function addFooter(output: Array<string>, previous: null | TocEntry, next: null | TocEntry): void {
    output.push(`<div class="footer"><div class="nav"><div class="clearfix"></div>`);
    if (previous) {
        output.push(`<div class="previous"><a href="${ previous.link }"><span class="arrow">&larr;</span>&nbsp;${ previous.title }</a></div>`);
    }
    if (next) {
        output.push(`<div class="next"><a href="${ next.link }">${ next.title }<span class="arrow">&rarr;</span></a></div>`);
    }
    output.push(`<div class="clearfix"></div></div><div class="copyright">The content of this site is licensed under the Creative Commons License. Generated on DATE HERE.</div></div>`);
    output.push(`</div><script type="module" src="./script-all.js"></script></body></html>`);
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
}
// @TODO: remove API since supers exists on obj
function addObjectExport(api: API, output: Array<string>, _links: LinkMap, obj: ObjectExport): TocEntry {
    const name = obj.name;
    const toc: TocEntry = { link: `#${ name }`, title: name, style: "code" };

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
    const supers = api.getSupers(obj.name);
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

export type TocEntry = {
    link: string;
    style: string;
    title: string;
};

// @TODO: remove api; supers is on obj
function addExports(api: API, output: Array<string>, links: LinkMap, objs: Array<Export | Subsection>): Array<TocEntry> {
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

export async function generate(api: API, config: Config) {
//    const BASE_URL = "http://localhost:8080/lcov-report/ethers-v6/src.ts/{FILENAME}.html#L{LINENO}";
//    const BASE_URL = "https:/\/github.com/ethers-io/ethers.js/blob/v6-beta-exports/src.ts/{FILENAME}#L{LINENO}"
    const BASE_URL = config.srcBaseUrl;

    const toc = api.toc;

// @TODO: use obj.id
    const links: LinkMap = new Map();
    {
        const lines = fs.readFileSync("./config.links").toString().split("\n");
        for (let line of lines) {
            line = line.trim();
            if (line === "" || line[0] === "#") { continue; }
            const match = line.match(/(\S+)\s+\[([^\]]+)\]\(([^\)]+)\)/);
            if (match == null) {
                console.log(line);
                throw new Error("bad link");
            }
            const key = match[1], title = match[2], link = match[3];

            links.set(key, { link, title, style: "normal" });
        }
    }

    const addLink = (filename: string, obj: Export | Subsection) => {
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

    const mainToc: Array<{ path: string, entry: TocEntry, section: Section }> = [ ];

    for (const [ path, section ] of toc) {
        const filename = join("/output", path + "/");

        const entry = { link: filename, style: "normal", title: section.title };
        mainToc.push({ path, entry, section });

        if (section.anchor) {
            /*
            addExports([ ], links, section.objs).forEach((entry) => {
                mainToc.push({
                    link: `${ filename }#${ entry.link }`,
                    title: entry.title,
                    style: "normal"
                });
            });
            */

            links.set(section.anchor, entry);
        }
        for (const obj of section.objs) {
            addLink(filename, obj);
        }
    }

    mainToc.sort((a, b) => {
        const compsA = a.entry.link.split("#")[0].split("/");
        const compsB = b.entry.link.split("#")[0].split("/");
        while (compsA.length && compsB.length) {
            const cmp = compsA.shift().localeCompare(compsB.shift());
            if (cmp !== 0) { return cmp; }
        }
        return compsA.length - compsB.length;
    });
/*
    const mainToc: Array<{ title: string, link: string }> = [ ];
    for (const [ , section ] of toc) {
        const toc = addExports([ ], links, section.objs);
    }
*/

    //const paths = Array.from(toc.keys());
    //console.log("PATHS:", paths, mainToc);
    for (let i = 0; i < mainToc.length; i++) {
        const { path, section } = mainToc[i];
        //const path = paths[i];
        //const section = toc.get(path);

        const output: Array<string> = [ ];
        addHeader(output, links, mainToc.map(e => e.entry), section);

        const localToc = addExports(api, [ ], links, section.objs);

        output.push(`<ul class="toc">`)
        for (const entry of localToc) {
            output.push(`<li class="style-${ entry.style }"><a class-"link-lit" href="${ entry.link }">${ entry.title }</a></li>`);
        }
        output.push(`</ul>`)

        addExports(api, output, links, section.objs);

        let previousEntry: null | TocEntry = null;
        let nextEntry: null | TocEntry = null;
        if (mainToc[i - 1]) {
            const { entry, section } = mainToc[i - 1];
            previousEntry = { link: entry.link, title: section.title, style: "normal" };
        }
        if (mainToc[i + 1]) {
            const { entry, section } = mainToc[i + 1];
            nextEntry = { link: entry.link, title: section.title, style: "normal" };
        }
        addFooter(output, previousEntry, nextEntry);

        const filename = resolve("output/docs", path, "index.html");
        fs.mkdirSync(dirname(filename), { recursive: true });
        fs.writeFileSync(filename, output.join(""));
    }

}

(async function() {
    const path = resolve(process.argv[2]);
    const config = await Config.fromScript(path);
    const api = new API(config.codeRoot);
    console.log(api);
    generate(api, config);
})();
