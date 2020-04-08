"use strict";

const { createHash } = require("crypto");
const fs = require("fs");
const { createRequireFromPath } = require('module')
const { basename, dirname, extname, relative, resolve } = require("path");
const { inherit } = require("util");
const vm = require("vm");


/////////////////////////////
// Hash Injection
//   - Used to prevent changes to generated files from being
//     overritten

function hash(content, format) {
    if (format == null) { format = "html"; }

    const contentHash = createHash("sha256").update(content).digest("hex");
    if (format === "html") {
        return `<!-- ContentHash:${ contentHash } -->`;
    } else if (format === "markdown") {
        return `\n\n-----\n**Content Hash:** ${ contentHash }`;
    }

    throw new Error("unknown format: " + format);
}

const _checkLength = {
    html: hash("", "html").length,
    markdown: hash("", "markdown").length,
};

function checkHash(content, format) {
    if (format == null) { format = "html"; }

    let offset = content.length - _checkLength[format];
    let check = content.substring(0, offset);
    let contentHash = content.substring(offset);
    return (hash(check, format) === contentHash);
}

function injectHash(content, format) {
    if (format == null) { format = "html"; }

    return content + hash(content, format);
}

const _inspectScript = new vm.Script("_inspect(_)", { filename: "dummy.js" });

async function runContext(context, code) {
    let promise = false;

    const script = new vm.Script(code, { filename: "dummy.js" });
    let result = script.runInContext(context, { timeout: 5000 });
    if (result instanceof Promise) {
        result = await result;
        promise = true;
    }
    context._ = result;
    result = _inspectScript.runInContext(context);
    if (promise) { result = `{ Promise: ${ result } }`; }
    return result;
}

/////////////////////////////
// Markdown

function markdownLinkMarkdown(content, context) {

    // [Link Title](link)
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (all, title, url) => {
        if (url.indexOf(":") === -1) {
            url = (relative(context._currentPage.path, context.getAnchor(url).split("#")[0]) || "./");
        }
        return `[${ title }](${ url })`; //<a href="${ url }">${ title }</a>`;
    });

    // [[link]]
    content = content.replace(/\[\[([^\]]*)\]\]/ig, (all, url) => {
        let title = url;
        if (url.indexOf(":") === -1) {
            title = context.getName(url);
            url = (relative(context._currentPage.path, context.getAnchor(url).split("#")[0]) || "./");
        }
        return `[${ title }](${url})`;
    });

    return content;
}

function markdownLink(content, context, preserveHtml, format) {
    if (format == null) { format = "html"; }

    if (format === "markdown") {
        return markdownLinkMarkdown(content, context);
    } else if (format !== "html") {
        throw new Error("unknown format: " + format);
    }

    if (!preserveHtml) {
        // Collapse whitespace and escape HTML
        content = content.trim()
                  .replace(/\s+/g, " ")
                  .replace(/&/g, "&amp;")
                  .replace(/&amp;((#[0-9]+)|([a-z][a-z0-9]*));/ig, (all, symbol) => (`&${ symbol };`))
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
        preserveHtml = true;
    }

    // [Link Title](link)
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (all, title, url) => {
        if (url.indexOf(":") === -1) { url = context.getAnchor(url); }
        title = title.replace(/([a-z0-9+])\.([a-z0-9_])/gi, (all, a, b) => {
            return (a + "&thinsp;.&thinsp;" + b);
        });
        return `<a href="${ url }">${ title }</a>`;
    });

    // [[link]]
    content = content.replace(/\[\[([^\]]*)\]\]/ig, (all, url) => {
        let title = url;
        if (url.indexOf(":") === -1) {
            title = context.getName(url);
            url = context.getAnchor(url);
        }
        title = title.replace(/([a-z0-9+])\.([a-z0-9_])/gi, (all, a, b) => {
            return (a + "&thinsp;.&thinsp;" + b);
        });
        return `<a href="${ url }">${ title }</a>`;
    });

    return content;
}

function markdownTextMarkdown(content, context) {
    // __Underline__
    content = content.replace(/__(.*?)__/g, (all, body) => {
        return `*${ body }*`;
    });

    // ^^Superscript^^
    content = content.replace(/\^\^(.*?)\^\^/g, (all, body) => {
        if (body.match(/\s/)) { body = "(" + body + ")"; }
        return `^${ body }`;
    });

    // //Italic//
    //content = content.replace(/(^|(?<!:))\/\/(.*?)(?<!:)\/\//g, (all, d0, body, d1) => {
    content = content.replace(/(^|(?<!:))\/\/(.*?)(?<!:)\/\//g, (all, d0, body, d1) => {
        return `*${ body }*`;
    });

    // ``Code``
    content = content.replace(/``(.*?)``/g, (all, body) => {
        return "`" + body + "`";
    });

    // Links [name](href)
    content = markdownLink(content, context, false, "markdown");

    content = content.replace(/\\(.)/g, (all, chr) => (chr));

    return content;
}

function markdownText(content, context, preserveHtml, format) {
    if (format == null) { format = "html"; }

    if (format === "markdown") {
        return markdownTextMarkdown(content, context);
    } else if (format !== "html") {
        throw new Error("unknown format: " + format);
    }

    if (!preserveHtml) {
        // Collapse whitespace and escape HTML
        content = content.trim()
                  .replace(/\s+/g, " ")
                  .replace(/&/g, "&amp;")
                  .replace(/&amp;((#[0-9]+)|([a-z][a-z0-9]*));/ig, (all, symbol) => (`&${ symbol };`))
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
        preserveHtml = true;
    }

    // **Bold**
    content = content.replace(/\*\*(.*?)\*\*/g, (all, body) => {
        return `<b>${ body }</b>`
    });

    // __Underline__
    content = content.replace(/__(.*?)__/g, (all, body) => {
        return `<u>${ body }</u>`
    });

    // ^^Superscript^^
    content = content.replace(/\^\^(.*?)\^\^/g, (all, body) => {
        return `<sup>${ body }</sup>`
    });

    // //Italic//
    //content = content.replace(/(^|(?<!:))\/\/(.*?)(?<!:)\/\//g, (all, d0, body, d1) => {
    content = content.replace(/\/\/(.*?)\/\//g, (all, body) => {
        return `<i>${ body }</i>`
    });

    // ``Code``
    content = content.replace(/``(.*?)``/g, (all, body) => {
        return `<code class="inline">${ body }</code>`
    });

    content = content.replace(/\s---\s/g, "&mdash;");
    content = content.replace(/\s--\s/g, "&ndash;");

    // Links [name](href)
    content = markdownLink(content, context, preserveHtml, format);

    content = content.replace(/\\(.)/g, (all, chr) => (chr));

    return content;
}

function markdownParagraph(content, context, format) {
    if (format == null) { format = "html"; }

    // Process Lists
    const lines = content.split("\n");

    // A line began with a hypen (-), indicates the block is a list
    if (lines.filter((line) => (line.trim().substring(0, 1) === "-")).length > 0) {
        let header = "";
        let points = [ ];
        lines.forEach((line) => {
            line = line.trim();
            if (line.substring(0, 1) === "-") {
                points.push(line.substring(1) + " ");
            } else if (points.length === 0) {
                header += line + " ";
            } else {
                points[points.length - 1] += line + " ";
            }
        });

        if (format === "html") {
            if (header) {
                header = `<p class="prelist">${ markdownText(header, context, false, format) }</p>`;
            }
            const items = points.map((point) => (`<li>${ markdownText(point.trim(), context, false, format) }</li>`)).join("");
            return `${ header }<ul>${ items }</ul>`;

        } else if (format === "markdown") {
            const items = points.map((point) => (`* ${ markdownText(point.trim(), context, false, format) }`)).join("\n");
            return `${ header }\n\n${ items }\n\n`
        }

        throw new Error("unknown format: " + format)
    }

    if (format === "html") {
        return `<p>${ markdownText(content, context, false, format) }</p>`;
    } else if (format === "markdown") {
        return `${ markdownText(content, context, false, format) }\n\n`;
    }

    throw new Error("unknown format: " + format)
}

// Split the markdown into paragraphs to process individually.
function markdown(content, context, format) {
    if (format == null) { format = "html"; }

    let result = "";

    const lines = content.trim().split("\n");

    let paragraph = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") {
            result += markdownParagraph(paragraph.join("\n"), context, format);
            paragraph = [ ];
        } else {
            paragraph.push(line);
        }
    }

    if (paragraph.length) {
        result += markdownParagraph(paragraph.join("\n"), context, format);
    }

    return result;
}

/////////////////////////////
// Code Operations

function wrapRequire(name) {
    let first = name.substring(0, 1);
    if (first === "." || first === "/" || first === "\\") {
        name = resolve(process.cwd(), name);
        return require(name);
    }
    return require(name);
}

/////////////////////////////
// Node Structure

function Page (realpath, path, fragments) {
    this.realpath = realpath;
    this.path = path;
    this.title = null;
    this.navTitle = null;
    this.name = null;
    this.options = { };
    this.context = null;

    this.fragments = fragments;

    let parents = null;

    this.fragments.forEach((fragment) => {
        fragment.page = this;
        if (fragment.tag === "section") {
            if (this.title != null) { throw new Error("duplicate _section definition: " + realpath); }

            this.title = fragment.value;
            if (fragment.meta.nav) { this.navTitle = fragment.meta.nav; }

            fragment.parents = null;
            parents = [ fragment ];

            let match = fragment.value.match(/<([^>]*)>/);
            if (match) {
                this.name = match[1];
            } else {
                this.name = fragment.value.replace(/\s+/g, " ").split(" ").map((word) => {
                    return word.substring(0, 1).toUpperCase() + word.substring(1).toLowerCase();
                }).join("");
            }

        } else if (fragment.tag === "subsection") {
            if (parents == null) { throw new Error("subsection without section: " + realpath); }
            fragment.parents = [ parents[0] ];
            parents = [ parents[0], fragment ];

        } else if (fragment.tag === "heading") {
            if (parents.length < 1) { throw new Error("heading without subsection: " + realpath); }
            fragment.parents = [ parents[0], parents[1] ];
            while (parents.length > 2) { parents.pop(); }
            while (parents.length < 2) { parents.push(null); }
            parents.push(fragment);
        } else {
            fragment.parents = parents.slice();
        }
    });

    if (this.title == null) { throw new Error("missing section"); }
}

Page.prototype.getToc = function() {
    let result = [ ];

    let toc = this.fragments.filter((fragment) => (fragment.tag === "toc"));
    if (toc.length > 1) { throw new Error("too many _toc tags"); }

    if (toc.length) {
        result.push({
            title: this.title,
            path: this.path,
            depth: 0
        });

        toc[0].getLines().forEach((child) => {
            child = child.trim();
            if (child === "") { return; }

            let path = this.path + child + "/";
            let page = this.context.findPages({ path: path });
            if (page.length !== 1) { throw new Error("did not get exactly one page for: " + path); }
            page[0].getToc(this.context).forEach((child) => {
                child.depth += 1;
                result.push(child);
            })
        });

    } else {
        this.fragments.forEach((fragment) => {
            let depth = ({ section: 0, subsection: 1 })[fragment.tag];
            if (depth == null) { return; }
            result.push({
                title: fragment.value,
                //path: this.path + ((fragment.tag === "section") ? "": ("#" + namify(fragment.value))),
                path: this.path + ((fragment.tag === "section") ? "": ("#" + (fragment.link ||fragment.autoLink() ))),
                depth: depth
            });
        });
    }

    return result;
}

Page.prototype.render = async function(options, format) {
    if (format == null) { format = "html"; }

    const getParent = (page) => {
        let comps = page.path.split("/");
        comps.pop();
        comps.pop();
        comps.push("");
        let matches = this.context.findPages({ path: comps.join("/") });
        if (matches.length > 1) { throw new Error("multiple pages with the same path"); }
        return matches[0] || null;
    }

    let body = [ ];
    for (let i = 0; i < this.fragments.length; i++) {
        const fragment = this.fragments[i];
        const content = await fragment.render(this, options, format);
        body.push(content);
    }
    body = body.join("\n");

    if (format === "markdown") {
        if (this.context.config.markdown && this.context.config.markdown.banner) {
            body = this.context.config.markdown.banner + body;
        }
        return injectHash(body, format);
    }

    let breadcrumbs = [ `<span class="current">${ this.title }</span>` ];

    let parent = getParent(this);
    let page = parent;
    while(page) {
        breadcrumbs.unshift(`<a href="${ page.path }">${ page.navTitle || page.title }</a>`)
        page = getParent(page);
    }
    breadcrumbs = breadcrumbs.join("&nbsp;&nbsp;&raquo;&nbsp;&nbsp;");

    let count = this.path.split("/").length;

    let toc = this.context.getToc();

    // The sidebar navigation
    let sidelinks = `<div class="link title"><a href="/">${ toc.shift().title }</a></div>`;

    toc.forEach((entry) => {
        let entryCount = entry.path.split("/").length;
        if (entry.path.indexOf("#") >= 0) { entryCount++; }

        let classes = [ ];

        // Base node; always added
        if (entryCount === 3) { classes.push("base"); }

        if (entry.path.substring(0, this.path.length) === this.path) {
            if (entryCount === count) {
                // Myself
                classes.push("myself");
                classes.push("ancestor");
            } else if (entryCount === count + 1) {
                // Direct child
                classes.push("child");
            }
        }

        // Ancestor
        if (classes.indexOf("child") === -1) {
            let basepath = entry.path.split("#")[0];
            if (this.path.substring(0, basepath.length) === basepath) {
                classes.push("ancestor");
            }
        }

        // A sibling of an ancestor
        if (entry.path.indexOf("#") === -1) {
            let entryParent = entry.path.split("/");
            entryParent.pop();
            entryParent.pop();
            entryParent.push("");
            entryParent = entryParent.join("/");
            if (this.path.substring(0, entryParent.length) === entryParent) {
                classes.push("show");
            }
        }

        if (classes.length === 0) { classes.push("hide"); }

        classes.push("link");
        classes.push("depth-" + entry.depth);
        sidelinks += `<div class="${ classes.join(" ") }"><a href="${ entry.path }">${ entry.title }</a></div>`;
    });


    let pageIndex = null;
    let navItems = toc.filter((entry) => (entry.path.indexOf("#") === -1));
    navItems.forEach((entry, index) => {
        if (entry.path === this.path) { pageIndex = index; }
    });

    let linkPrevious = "", linkNext = "";
    if (pageIndex == null) {
        if (navItems.length) {
            linkNext = `<div class="nav next"><a href="${ navItems[0].path }">${ navItems[0].title }<span class="arrow">&rarr;</span></a></div>`;
        }
    } else {
        if (pageIndex === 0) {
            let page = this.context.findPages({ path: "/" })[0];
            linkPrevious = `<div class="nav previous"><a href="/"><span class="arrow">&larr;</span>${ page.title }</a></div>`;
        } else {
            linkPrevious = `<div class="nav previous"><a href="${ navItems[pageIndex - 1].path }"><span class="arrow">&larr;</span>${ navItems[pageIndex - 1].title }</a></div>`;
        }
        if (pageIndex + 1 < navItems.length) {
            linkNext = `<div class="nav next"><a href="${ navItems[pageIndex + 1].path }">${ navItems[pageIndex + 1].title }<span class="arrow">&rarr;</span></a></div>`;
        }
    }

    let sidebar = `<div class="header"><div class="logo"><a href="/"><div class="image"></div><div class="name">${ this.context.config.title || "TITLE" }</div><div class="version">${ this.context.config.subtitle || "SUBTITLE" }</div></a></div></div><div class="toc"><div>${ sidelinks }</div></div>`;
    let copyright = `The content of this site is licensed under the <a href="https://choosealicense.com/licenses/cc-by-4.0/">Creative Commons Attribution 4.0 International License</a>.`;

    return injectHash(`<html><head><title>${ this.title }</title><link rel="stylesheet" type="text/css" href="/static/style.css"></head><body><div class="sidebar">${ sidebar }</div><div class="content"><div class="breadcrumbs">${ breadcrumbs }</div>${ body }<div class="footer">${ linkPrevious } ${ linkNext }</div><div class="copyright">${ copyright }</div></div><script src="/script.js" type="text/javascript"></script></body></html>`, format);
};



function Fragment (tag, value) {
    this.tag = tag;
    this.link = null;
    this.parents = null;
    this._lines = [ ];
    this.path = null;
    this.meta = { }

    // If we have a link, set it and remove it from the value
    while (true) {
        const match = value.match(/^(.*)@([a-z0-9_]*)<((?:[^>]|\\>)*)>\s*$/i);
        if (match) {
            if (match[2]) {
                this.meta[match[2].toLowerCase()] = match[3].replace("\\>", ">").replace("\\<", "<");
            } else {
                this.link = match[3];
            }
            value = match[1].trim(); //this.value.substring(0, this.value.indexOf("<")).trim();
        } else {
            this.value = value.trim();
            break;
        }
    }
}

Fragment.prototype.addLine = function(line) {
    this._lines.push(line);
}

Fragment.prototype.getLines = function() {
    return this._lines.join("\n").trim().split("\n");
}

Fragment.prototype._evalJavaScript = async function() {
    if (this._evalJavaScriptCache) { return this._evalJavaScriptCache; }

    const code = this.page.context.readFile(this.value);

    const lines = code.split("\n");

    const contextObject = {
        _inspect: function(result) { return JSON.stringify(result); },
        console: console,
        require: wrapRequire
    };
    const context = vm.createContext(contextObject);

    const output = [ ];
    let script = [ ];
    let showing = true;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        let stripped = line.replace(/\s/, "");
        if (stripped.indexOf("//<hide>") === 0) {
            showing = false;
            continue;
        } else if (stripped.indexOf("//</hide>") === 0) {
            showing = true;
            continue;
        }

        if (line.trim().substring(0, 3) === "//!") {
            let padding = line.substring(0, line.indexOf("/"));
            try {
                let result = await runContext(context, script.join("\n"));
                output.push({ classes: [ "result", "ok" ], content: `${ padding }// ${ result }` });
                if (line.replace(/\s/g, "").substring(0, ) !== "//!") { throw new Error("expected an Error"); }
            } catch (error) {
                if (line.replace(/\s/g, "").substring(0, ) !== "//!error") { throw error; }
                output.push({ classes: [ "result", "error" ], content: `${ padding }// Error: ${ error.message }` });
            }
            script = [ ];
        } else {
            script.push(line);

            if (showing) {
                let classes = [ ];
                if (line.replace(/\s/g, "").match(/\/\/[^<]/)) {
                    classes.push("comment");
                }
                output.push({ classes: classes, content: line });
            }
        }
    }

    if (lines.length) {
        await runContext(context, script.join("\n"));
    }

    // Trim off leading empty lines
    while (output.length) {
        if (output[0].content.trim() !== "") { break; }
        output.splice(0, 1);
    }

    // Trim off trailing empty lines
    while (output.length) {
        if (output[output.length - 1].content.trim() !== "") { break; }
        output.splice(output.length - 1, 1);
    }

    this._evalJavaScriptCache = output;

    return output;
}

Fragment.prototype.autoLink = function() {
    const components = [ ];
    (this.parents || [ ]).forEach((fragment) => {
        if (!fragment) { return; }
        components.push(namify(fragment.link || fragment.value));
    });
    components.push(namify(this.link || this.value));
    return components.join("--");
}

Fragment.prototype.evalJavaScript = async function(format) {
    if (format == null) { format = "html"; }

    const output = await this._evalJavaScript();
    if (format === "html") {
        return output.map((line) => {
            if (line.classes.length) {
                return `<span class="${ line.classes.join(" ") }">${ line.content }</span>`;
            }
            return line.content;
        }).join("<br>");
    } else if (format === "markdown") {
        return output.map((line) => line.content).join("\n");
    }
    throw new Error("unknown format: " + format);
}

function renderName(text, format) {
    let nameComps = text.split(".");
    if (format === "html") {
        let result = `<span class="method">${ nameComps.pop() }</span>`;
        if (nameComps.length) {
            const dot = '<span class="symbol">.</span>'
            result = nameComps.map((n) => (`<span class="path">${ n }</span>`)).join(dot) + dot + result;
        }
        return result;
    } else if (format === "markdown") {
        let result = `**${nameComps.pop() }**`;
        if (nameComps.length) {
            result = nameComps.map((n) => (`*${ n }*`)).join(" . ") + " . " + result;
        }
        return result;
    }
    throw new Error("unknown format: " + format);
}

function renderParams(text, format) {
    if (text == null || text.trim() === "") { return ""; }

    let result = text.replace(/([a-z0-9_]+)(?:=([^,\)]))?/ig, (all, key, defaultValue) => {
        if (format === "html") {
            let result = `<span class="param">${ key }</span>`;
            if (defaultValue) {
                result += ` = <span class="default-value">${ defaultValue }</span>`;
            }
            return result;
        } else if (format === "markdown") {
            return all;
        }
        throw new Error("unknown format: " + format);
    });

    result = result.replace(/([,\]\[\)\(])/g, (all, symbol) => {
        if (format === "html") {
            return `<span class="symbol">${ symbol }</span>`;
        }
        return " " + symbol + " ";
    });


    return result;
}

function renderReturns(text, context, format) {
    if (text == null || text.trim() === "") { return ""; }
    text = markdownLink(text.trim(), context, false, format);
    if (format === "html") {
        text = text.replace(/&gt;/g, "&thinsp;&gt;").replace(/&lt;/g, "&lt;&thinsp;");
        text = text.replace(/\|/g, "&nbsp;&nbsp;|&nbsp;&nbsp;");
        return ` <span class="arrow">&rArr;</span> <span class="returns">${ text }</span>`
    } else if (format === "markdown") {
        text = text.replace(/>/g, " >").replace(/</g, "< ");
        return ` **=>** *${ text }*`;
    }
    throw new Error("unknown format: " + format);
}

function renderFunction(text, context, format) {
    let prefix = "";
    text = text.trim();
    if (text.trim().substring(0, 4) === "new ") {
        if (format === "html") {
            prefix = `<span class="modifier">new </span>`;
        } else if (format === "markdown") {
            prefix = "**new** ";
        }
        text = text.substring(4).trim();
    }

    let comps = text.replace(/\s/g, "").split("=>");
    if (comps.length > 2) { throw new Error("too many returns"); }

    let match = comps[0].match(/^([^\]\(]+)(\([^\)]*\))?\s*$/);
    if (!match) { throw new Error(`invalid function definition: ${ JSON.stringify(text) }`); }
    return (prefix + renderName(match[1], format) + renderParams(match[2], format) + renderReturns(comps[1] || null, context, format));
}

function repeat(chr, length) {
    let result = chr;
    while (result.length < length) { result += result; }
    return result.substring(0, length);
}

Fragment.prototype.render = async function(page, options, format) {
    if (format == null) { format = "html"; }

    let result = "";

    // An alternate link name to include
    if (format === "html") {
        if (this.link) { result += `<a name="${ namify(this.link) }"></a>`; }
    }

    const lines = this._lines.join("\n").trim();

    switch (this.tag) {
        case "null":
            if (lines !== "") { result += markdown(lines, page.context, format); }
            break;

        case "section":
        case "subsection":
        case "heading":
            if (format === "html") {

                let inherit = "";
                if (this.meta.inherit) {
                    inherit = `<span class="inherits"> inherits ${ markdownLink(this.meta.inherit.replace(/\s+/g, " "), page.context, true, format) }</span>`
                }

                let sourceLink = "";
                if (this.meta.src) {
                    sourceLink = `<a class="source" href="${ page.context.getSourceUrl(this.meta.src, this.value) }">source</a>`;
                }

                const autoLink = this.autoLink();

                let link = this.link;
                let extraLink = "";

                let selfLink = "";
                if (link === "") {
                    link = "no-link";
                } else {
                    if (link == null) {
                        link = autoLink;
                        console.log("  * " + link);
                    } else {
                        console.log("    " + link);
                        extraLink = `<a name="${ link }"></a>`;
                    }
                    selfLink = `<div class="anchors"><a class="self" href="#${ link }"></a>${ sourceLink }</div>`
                }

                const tag = ({ section: "h1", subsection: "h2", heading: "h3" })[this.tag];
                result += `<a name="${ autoLink }"></a>${ extraLink }<${ tag } class="show-anchors"><div>${ markdownText(this.value, page.context, false, format) }${ inherit }${ selfLink }</div></${ tag }>`;
            } else if (format === "markdown") {
                if (this.tag === "heading") {
                    result += `### ${ markdownText(this.value, page.context, false, format) }\n\n`;
                } else {
                    let underline = (({ section: "=", subsection: "-" })[this.tag]);
                    let line = markdownText(this.value, page.context, false, format);
                    result += `${ line }\n${ repeat(underline, line.length)}\n\n`;
                }
            }
            break;

        case "code":
            let code = page.context.readFile(this.value);
            let kind = "";
            switch (extname(this.value)) {
                case ".js":
                    kind = "javascript";
                    if (options.skipeval) {
                        code = "Skipping JavaScript Evaluation.";
                    } else {
                        code = await this.evalJavaScript(format);
                    }
                    break;
                case ".txt":
                    if (format === "html") {
                        code = code.trim().replace(/&/g, "&amp;")
                               .replace(/ /g, "&nbsp;")
                               .replace(/</g, "&lt;")
                               .replace(/>/g, "&gt;")
                               .replace(/\n/g, "<br>");
                    }
                    break;
                case ".source":
                    if (format === "html") {
                        code = code.split("\n").map((line) => {
                            if (line.trim().substring(0, 2) === "//") {
                               line = `<span class="comment">${ line }</span>`;
                            }
                            return line;
                        }).join("<br>");
                    }
                    break;
            }

            if (format === "html") {
                result += `<div class="code">${ code }</div>`;
            } else if (format === "markdown") {
                return "```" + kind + "\n" + code.trim() + "\n```\n\n";
            } else {
                throw new Error("unknown format: " + format);
            }
            break;

        case "warning":
        case "note":
        case "definition":
            if (format === "html") {
                let selfLink = "";
                if (this.link) {
                     selfLink = `<div class="anchors"><a class="self" href="#${ namify(this.link) }"></a></div>`
                }
                result += `<div class="definition ${ (this.tag !== "definition") ? ("container-box " + this.tag): ""} show-anchors"><div class="term">${ markdownText(this.value, page.context, false, format) }${ selfLink }</div><div class="body">${ markdown(lines, page.context, format) }</div></div>`;
            } else if (format === "markdown") {
                result += `#### ${ markdownText(this.value, page.context, false, format) }\n\n${ markdown(lines, page.context, format) }\n\n`;
            }
            break;

        case "property":
            if (format === "html") {
                let selfLink = "";
                if (this.link) {
                    selfLink = `<a class="self" href="#${ namify(this.link) }"></a>`;
                    console.log("    " + this.link);
                }
                let sourceLink = "";
                if (this.meta.src) {
                    sourceLink = `<a class="source" href="${ page.context.getSourceUrl(this.meta.src, this.value) }">source</a>`;
                }
                result += `<div class="property show-anchors"><div class="signature">${ renderFunction(this.value, page.context, format) }<div class="anchors">${ selfLink }${ sourceLink }</div></div><div class="body">${ markdown(lines, page.context, format) }</div></div>`;
            } else if (format === "markdown") {
                result += `#### ${ renderFunction(this.value, page.context, format) }\n\n${ markdown(lines, page.context, format) }\n\n`;
            }
            break;

        case "toc":
            let items = "";
            page.getToc().slice(1).forEach((item) => {
                if (format === "html") {
                    items += `<div style="padding-left: ${ (item.depth - 1) * 28 }px"><span class="bullet">&bull;</span><a href="${ item.path }">${ item.title }</a></div>`
                } else if (format === "markdown") {
                    items += `${ repeat(" ", (item.depth - 1) * 2) }* [${ item.title }](${ (relative(page.path, item.path.split("#")[0]) || "./") })\n`
                }
            });

            if (format === "html") {
                result += `<div class="toc">${ items }</div>`;
            } else if (format === "markdown") {
                result += items += "\n";
            } else {
                throw new Error("unknown foramt: " + format);
            }

            break;

        default:
            throw new Error(`unknown tag ${ this.tag }: ${ page.realpath } `);
    }
    return result;
}

/////////////////////////////
// Parsing and Generation

const DirectiveHasBody = { definition: true, "null": true, note: true, property: true, toc: true, warning: true };
function parseFile(path, basepath) {
    if (path.substring(0, basepath.length) !== basepath) {
        console.log(path, basepath);
        throw new Error("basepath mismatch");
    }

    const fragments = [];

    const lines = fs.readFileSync(path).toString().split("\n");
    lines.forEach((line) => {
        const match = line.match(/^_([a-z]*)\s*:(.*)$/i);
        if (match) {
            fragments.push(new Fragment(match[1].trim(), match[2].trim()));
        } else {
            line = line.trim();
            let lastFragment = fragments[fragments.length - 1];
            if (!DirectiveHasBody[lastFragment.tag]) {
                lastFragment = new Fragment("null", "");
                fragments.push(lastFragment);
            }
            lastFragment.addLine(line);
        }
    });

    let target = path.substring(basepath.length);
    if (basename(target).split(".")[0] === "index") {
        target = dirname(target);
    } else {
        target = dirname(target) + "/" + basename(target).split(".")[0];
        if (target.substring(0, 2) === "//") { target = target.substring(1); }
    }
    if (target.substring(target.length - 1) !== "/") { target += "/"; }

    return (new Page(path, target, fragments));
}

function titlize(words) {
    return words.split(" ").map((w) => (w.substring(0, 1).toUpperCase() + w.substring(1).toLowerCase())).join("");
}

function namify(words) {
    return words.toLowerCase().replace(/[^a-z0-9_-]+/gi, " ").split(" ").filter((w) => (!!w)).join("-");
}

function loadConfig(path) {
    let configPath = resolve(path, "./config.js");

    // Try loading a JavaScript config
    if (fs.existsSync(configPath)) {
        const injected = { exports: { } };
        const context = vm.createContext({
            console: console,
            __dirname: resolve(path),
            __filename: configPath,
            module: injected,
            exports: injected.exports,
            require: createRequireFromPath(configPath)
        });

        const script = new vm.Script(fs.readFileSync(configPath).toString(), { filename: "config.js" });
        script.runInContext(context);

        return injected.exports;
    }

    // Try loading a JSON config
    configPath = resolve(path, "./config.json");
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath).toString());
    }

    // Just use defaults
    return { };
}

function Context(basepath, nodes, config) {
    this.basepath = basepath;
    this.nodes = nodes;
    this.config = (config || { });

    this._links = { };

    // Load any provided external links first
    if (config.externalLinks) {
        Object.keys(config.externalLinks).forEach((key) => {
            const url = config.externalLinks[key]
            if (typeof(url) === "string") {
                this._links[key] = { anchor: url, name: url };
            } else if (typeof(url.url) === "string" && typeof(url.name) === "string") {
                this._links[key] = { anchor: url.url, name: url.name };
            } else {
                throw new Error("invalid external link");
            }
        });
    }

    this.forEachPage((page) => {
        page.context = this;
        page.fragments.forEach((fragment) => {
            if (fragment.link) {
                let existing = this._links[fragment.link];
                if (existing) {
                    const dedup = { };
                    dedup[page.realpath] = true;
                    dedup[existing.location] = true;
                    let error = new Error(`duplicate tag: ${ fragment.link } (${ Object.keys(dedup).map((l) => JSON.stringify(l)).join(", ") })`);
                    error.previousLocations = existing.location;
                    error.location = page.realpath;
                    throw error;
                }

                this._links[fragment.link] = {
                    anchor: (page.path + ((fragment.tag !== "section") ? ("#" + fragment.link): "")),
                    name: fragment.value.replace(/(\*\*|\/\/|__|\^\^|``)/g, ""),
                    location: page.realpath
                };
            }
        });
    });

    this._currentPage = null;
}

Context.prototype.getSourceUrl = function(key, property) {
    if (this.config.getSourceUrl) {
        if (key.indexOf(":") < 0) {
            property = property.split("=>")[0].trim();
            if (property.indexOf("(" /* Fix: ) */) >= 0) {
                property = property.match(/([a-z0-9_$]+)\s*\(/i /* Fix: \) */)[1];
            } else {
                property = property.split(".").pop().trim();
            }

            key += ":" + property;
        }

        return this.config.getSourceUrl(key);
    }
    throw new Error("missing config.getSourceUrl");
}

Context.prototype.findPages = function(filter) {
    let result = [ ];
    this.forEachPage((page) => {
        for (let key in filter) {
            if (page[key] !== filter[key]) { return; }
        }
        result.push(page);
    });
    return result;
}

Context.prototype._get = function(key, name) {
    let value = this._links[name];
    if (!value) { throw new Error("missing anchor: " + name); }
    return value[key];
}

Context.prototype.getAnchor = function(name) {
    return this._get("anchor", name);
}

Context.prototype.getName = function(name) {
    return this._get("name", name);
}

Context.prototype._forEachPage = function(node, callback) {
    if (node instanceof Page) {
        callback(node);
    } else if (Array.isArray(node)) {
        node.forEach((child) => {
            this._forEachPage(child, callback);
        });
    } else {
        throw new Error("Hmmm...")
    }
}

Context.prototype.forEachPage = function(callback) {
    return this._forEachPage(this.nodes, callback);
}

Context.prototype.readFile = function(filename) {
    return fs.readFileSync(resolve(dirname(this._currentPage.realpath), filename)).toString();
}

Context.prototype.getToc = function() {
    return this._toc.slice();
}

function mkdir(dir) {
    try {
        fs.accessSync(dir);
    } catch (error) {
        if (error.code !== "ENOENT") { throw error; }
        fs.mkdirSync(dir, { recursive: true });
    }
}

Context.prototype.render = async function(path, options) {
    this._toc = this.findPages({ path: "/" })[0].getToc(this);
    let pages = [ ];
    this.forEachPage((page) => { pages.push(page); });

    // Copy over all static files
    mkdir(resolve(path, "./static/lato"));
    [
        "style.css",
        "logo.svg",
        "link.svg",
        "lato/Lato-Regular.ttf",
        "lato/Lato-Black.ttf",
        "lato/Lato-Italic.ttf",
        "lato/Lato-BlackItalic.ttf"
    ].forEach((filename) => {
        fs.copyFileSync(resolve(__dirname, "./static", filename), resolve(path, "./static", filename));
    });

    // If we have a custom logo, use it instead
    if (this.config.logo) {
        fs.copyFileSync(resolve(this.basepath, this.config.logo), resolve(path, "./static/logo.svg"));
    }

    const outputs = [
        { format: "html", filename: "index.html" },
        { format: "markdown", filename: "README.md" },
    ];

    for (let i = 0; i < pages.length; i++) {
        let page = pages[i];

        console.log("Render:", page.path);

        this._currentPage = page;

        for (let i = 0; i < outputs.length; i++) {
            let output = outputs[i];

            const filepath = resolve(path, "." + page.path + "/" + output.filename);
            mkdir(dirname(filepath));

            try {
                const existing = fs.readFileSync(filepath).toString();
                if (!checkHash(existing, output.format) && !options.force) {
                    throw new Error("File modified since generation: " + filepath);
                }
            } catch (error) {
                if (error.code !== "ENOENT") { throw error; }
            }

            const render = await page.render(options, output.format);
            fs.writeFileSync(filepath, render);
        }
    }

    this._currentPage = null;
}

Context.fromFolder = function(path, config) {
    if (!config) { config = loadConfig(path); }

    const readdir = function(path, basepath) {
        if (!basepath) { basepath = path; }
        basepath = resolve(basepath);

        return fs.readdirSync(path).map((filename) => {
            const childpath = resolve(path, filename)
            const stat = fs.statSync(childpath);
            if (stat.isDirectory()) {
                console.log("Processing Directroy:", childpath);
                return readdir(childpath, basepath);
            } else if (extname(childpath) === ".wrm") {
                console.log("  File:", childpath);
                return parseFile(childpath, basepath);
            }
            return null
        }).filter((page) => (page != null));
    }

    return new Context(resolve(path), readdir(path), config);
}

module.exports = {
    Context,
    loadConfig
}
