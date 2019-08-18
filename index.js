"use strict";

const { createHash } = require("crypto");
const fs = require("fs");
const { basename, dirname, extname, resolve } = require("path");
const { inherit } = require("util");
const vm = require("vm");


/////////////////////////////
// Hash Injection
//   - Used to prevent changes to generated files from being
//     overritten

function hash(content) {
    const contentHash = createHash("sha256").update(content).digest("hex");
    return `<!-- ContentHash:${ contentHash } -->`;
}
const _checkLength = hash("").length;

function checkHash(content) {
    content = content.trim();
    let offset = content.length - _checkLength;
    let check = content.substring(0, offset);
    let contentHash = content.substring(offset);
    return (hash(check) === contentHash);
}

function injectHash(content) {
    return content + hash(content);
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

function markdownLink(content, context, preserveHtml) {
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
        return `<a href="${ url }">${ title }</a>`;
    });

    // [[link]]
    content = content.replace(/\[\[([^\]]*)\]\]/ig, (all, url) => {
        let title = url;
        if (url.indexOf(":") === -1) {
            title = context.getName(url);
            url = context.getAnchor(url);
        }
        return `<a href="${ url }">${ title }</a>`;
    });

    return content;
}

function markdownText(content, context, preserveHtml) {
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
    content = content.replace(/(^|(?<!:))\/\/(.*?)(?<!:)\/\//g, (all, d0, body, d1) => {
        return `<i>${ body }</i>`
    });

    // ``Code``
    content = content.replace(/``(.*?)``/g, (all, body) => {
        return `<code class="inline">${ body }</code>`
    });

    content = content.replace(/---/g, "&mdash;");
    content = content.replace(/--/g, "&ndash;");
    content = content.replace(/\\(.)/g, (all, chr) => (chr));

    // Links [name](href)
    content = markdownLink(content, context, preserveHtml);

    return content;
}

function markdownParagraph(content, context) {
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

        if (header) {
            header = `<p class="prelist">${ markdownText(header, context) }</p>`;
        }

        const items = points.map((point) => (`<li>${ markdownText(point.trim(), context) }</li>`)).join("");

        return `${ header }<ul>${ items }</ul>`;
    }

    return `<p>${ markdownText(content, context) }</p>`;
}

// Split the markdown into paragraphs to process individually.
function markdown(content, context) {
    let result = "";

    const lines = content.trim().split("\n");

    let paragraph = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") {
            result += markdownParagraph(paragraph.join("\n"), context);
            paragraph = [ ];
        } else {
            paragraph.push(line);
        }
    }

    if (paragraph.length) {
        result += markdownParagraph(paragraph.join("\n"), context);
    }

    return result;
}

/////////////////////////////
// Code Operations

async function verifyCode(code) {
    const lines = code.split("\n");

    let contextObject = {
        _inspect: function(result) { return JSON.stringify(result); },
        console: console,
        require: require
    };
    let context = vm.createContext(contextObject);

    let output = [ ];
    let script = [ ];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.trim().substring(0, 3) === "//!") {
            let padding = line.substring(0, line.indexOf("/"));
            try {
                let result = await runContext(context, script.join("\n"));
                output.push(`<span class="result ok">${ padding }// ${ result }</span>`);
                if (line.replace(/\s/g, "").substring(0, ) !== "//!") { throw new Error("expected an Error"); }
            } catch (error) {
                if (line.replace(/\s/g, "").substring(0, ) !== "//!error") { throw error; }
                output.push(`<span class="result error">${ padding }// Error: ${ error.message }</span>`);
            }
            script = [ ];
        } else {
            script.push(line);
            if (line.replace(/\s/g, "").match(/\/\/[^<]/)) {
                line = `<span class="comment">${ line }</span>`;
            }
            output.push(line);
        }
    }

    if (lines.length) {
        await runContext(context, script.join("\n"));
    }

    let show = output.join("\n").replace(/\/\/.* <hide>\n(?:.|\n)*?\/\/ <\/hide>/, "").trim();

    return {
        show: show.replace(/\n/g, "<br>")
    }
}

/////////////////////////////
// Node Structure

function Page (realpath, path, fragments) {
    this.realpath = realpath;
    this.path = path;
    this.title = null;
    this.name = null;
    this.options = { };
    this.context = null;

    this.fragments = fragments.filter((fragment) => {
        if (fragment.tag === "title") {
            if (this.title != null) { throw new Error("duplicate _title definition"); }
            this.title = fragment.value;
            let match = fragment.value.match(/<([^>]*)>/);
            if (match) {
                this.name = match[1];
            } else {
                this.name = fragment.value.replace(/\s+/g, " ").split(" ").map((word) => {
                    return word.substring(0, 1).toUpperCase() + word.substring(1).toLowerCase();
                }).join("");
            }
            return false;
        }
        return true;
    });
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
                path: this.path + ((fragment.tag === "section") ? "": ("#" + namify(fragment.value))),
                depth: depth
            });
        });
    }

    return result;
}

Page.prototype.render = async function(options) {
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
        let fragment = this.fragments[i];
        if (fragment.tag === "title" && title == null) {
            title = fragment.value;
        }
        let render = await fragment.render(this, options);
        body.push(render);
    }
    body = body.join("\n");

    /*
    let body = this.fragments.map((fragment) => {
        if (fragment.tag === "title" && title == null) {
            title = fragment.value;
        }
        return await fragment.render(this);
    }).join("\n");
    */

    let breadcrumbs = [ `<span class="current">${ this.title }</span>` ];

    let parent = getParent(this);
    let page = parent;
    while(page) {
        breadcrumbs.unshift(`<a href="${ page.path }">${ page.title }</a>`)
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
        linkNext = `<div class="nav next"><a href="${ navItems[0].path }">${ navItems[0].title }<span class="arrow">&rarr;</span></a></div>`;
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

    let sidebar = `<div class="header"><div class="logo"><a href="/"><div class="image"></div><div class="name">ethers.js</div><div class="version">v5.0</div></a></div></div><div class="toc"><div>${ sidelinks }</div></div>`;
    let copyright = `The content of this site is licensed under the <a href="https://choosealicense.com/licenses/cc-by-4.0/">Creative Commons Attribution 4.0 International License</a>.`;

    return injectHash(`<html><head><title>${ this.title }</title><link rel="stylesheet" type="text/css" href="/static/style.css"></head><body><div class="sidebar">${ sidebar }</div><div class="content"><div class="breadcrumbs">${ breadcrumbs }</div>${ body }<div class="footer">${ linkPrevious } ${ linkNext }</div><div class="copyright">${ copyright }</div></div><script src="/script.js" type="text/javascript"></script></body></html>`);
};



function Fragment (tag, value) {
    this.tag = tag;
    this.value = value.trim();
    this.link = null;
    this._lines = [ ];

    // If we have a link, set it and remove it from the value
    let match = value.match(/^(.*)@<([^>]*)>\s*$/);
    if (match) {
        this.link = match[2];
        this.value = match[1].trim(); //this.value.substring(0, this.value.indexOf("<")).trim();
    }
}

Fragment.prototype.addLine = function(line) {
    this._lines.push(line);
}

Fragment.prototype.getLines = function() {
    return this._lines.join("\n").trim().split("\n");
}

function renderName(text) {
    let nameComps = text.split(".");
    let result = `<span class="method">${ nameComps.pop() }</span>`;
    if (nameComps.length) {
        result = nameComps.map((n) => (`<span class="path">${ n }</span>`)).join(" . ") + " . " + result;
    }
    return result;
}

function renderParams(text) {
    if (text == null || text.trim() === "") { return ""; }

    let result = text.replace(/([a-z0-9_]+)(?:=([^,\)]))?/ig, (all, key, defaultValue) => {
        let result = `<span class="param">${ key }</span>`;
        if (defaultValue) {
            result += ` = <span class="default-value">${ defaultValue }</span>`;
        }
        return result;
    });

    result = result.replace(/([,\]\[\)\(])/g, (all, symbol) => {
        return " " + symbol + " ";
    });

    return result;
}

function renderReturns(text, context) {
    if (text == null || text.trim() === "") { return ""; }
    text = markdownLink(text.trim(), context);
    text = text.replace(/&gt;/g, "&thinsp;&gt;").replace(/&lt;/g, "&lt;&thinsp;");
    return ` <span class="arrow">&rArr;</span> <span class="returns">${ text }</span>`
}

function renderFunction(text, context) {
    let prefix = "";
    text = text.trim();
    if (text.trim().substring(0, 4) === "new ") {
        prefix = `<span class="modifier">new </span>`;
        text = text.substring(4).trim();
    }

    let comps = text.replace(/\s/g, "").split("=>");
    if (comps.length > 2) { throw new Error("too many returns"); }

    //let match = text.replace(/\s/g, "").match(/^([^\]]+)(\([^\)]*\))?(?:=>(.*))?$/);
    let match = comps[0].match(/^([^\]\(]+)(\([^\)]*\))?\s*$/);
    if (!match) { throw new Error("invalid function definition"); }
    return (prefix + renderName(match[1]) + renderParams(match[2]) + renderReturns(comps[1] || null, context));
}

Fragment.prototype.render = async function(page, options) {
    let result = "";

    // An alternate link name to include
    if (this.link) { result += `<a name="${ namify(this.link) }"></a>`; }

    const lines = this._lines.join("\n").trim();

    switch (this.tag) {
        case "null":
            if (lines !== "") { result += markdown(lines, page.context); }
            break;
        case "section":
        case "subsection":
        case "heading":
            let tag = ({ section: "h1", subsection: "h2", heading: "h3" })[this.tag];
            result += `<a name="${ namify(this.value) }"></a><${ tag }>${ markdownText(this.value) }</${ tag }>`;
            break;
        case "code":
            let code = page.context.readFile(this.value);
            switch (extname(this.value)) {
                case ".js":
                    if (options.skipeval) {
                        code = "Skipping JavaScript Evaluation.";
                    } else {
                        code = (await verifyCode(code)).show;
                    }
                    break;
                case ".txt":
                    code = code.trim().replace(/&/g, "&amp;")
                           .replace(/ /g, "&nbsp;")
                           .replace(/</g, "&lt;")
                           .replace(/>/g, "&gt;")
                           .replace(/\n/g, "<br>");
                    break;
                case ".source":
                    code = code.split("\n").map((line) => {
                        if (line.trim().substring(0, 2) === "//") {
                            line = `<span class="comment">${ line }</span>`;
                        }
                        return line;
                    }).join("<br>");
                    break;
            }
            result += `<div class="code">${ code }</div>`;
            break;
        case "definition":
            result += `<div class="definition"><div class="term">${ markdownText(this.value, page.context) }</div><div class="body">${ markdown(lines, page.context) }</div></div>`;
            break;
        case "property":
            result += `<div class="property"><div class="signature">${ renderFunction(this.value, page.context) }</div><div class="body">${ markdown(lines, page.context) }</div></div>`;
            break;
        case "toc":
            let items = "";
            page.getToc().slice(1).forEach((item) => {
                items += `<div style="padding-left: ${ (item.depth - 1) * 28 }px"><span class="bullet">&bull;</span><a href="${ item.path }">${ item.title }</a></div>`
            });
            result += `<div class="toc">${ items }</div>`;
            break;
        default:
            throw new Error("unknown tag: " + this.tag);
    }
    return result;
}

/////////////////////////////
// Parsing and Generation

const DirectiveHasBody = { definition: true, "null": true, property: true, toc: true };
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
    return words.toLowerCase().replace(/\s+/, " ").split(" ").join("-");
}

function Context(basepath, nodes) {
    this.basepath = basepath;
    this.nodes = nodes;

    this._links = { };
    this.forEachPage((page) => {
        page.context = this;
        page.fragments.forEach((fragment) => {
            if (fragment.link) {
                let existing = this._links[fragment.link];
                if (existing) {
                    let error = new Error("duplicate tag: " + fragment.link);
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
    if (options == null) { options = { }; }

    this._toc = this.findPages({ path: "/" })[0].getToc(this);
    let pages = [ ];
    this.forEachPage((page) => { pages.push(page); });

    mkdir(resolve(path, "./static/lato"));
    [
        "style.css",
        "lato/Lato-Regular.ttf",
        "lato/Lato-Black.ttf",
        "lato/Lato-Italic.ttf",
        "lato/Lato-BlackItalic.ttf"
    ].forEach((filename) => {
        fs.copyFileSync(resolve(__dirname, "./static", filename), resolve(path, "./static", filename));
    });

    for (let i = 0; i < pages.length; i++) {
        let page = pages[i];

        this._currentPage = page;
        const filepath = resolve(path, "." + page.path + "/index.html")
        console.log("Render:", page.path);

        const dir = dirname(filepath);
        mkdir(dir);

        try {
            const existing = fs.readFileSync(filepath).toString();
            if (!checkHash(existing) && !options.force) {
                throw new Error("File modified since generation: " + filepath);
            }
        } catch (error) {
            if (error.code !== "ENOENT") { throw error; }
        }
        let render = await page.render(options);
        fs.writeFileSync(filepath, render);
    }

    this._currentPage = null;
}

Context.fromFolder = function(path, basepath) {
    if (!basepath) { basepath = path; }
    basepath = resolve(basepath);

    return new Context(basepath, fs.readdirSync(path).map((filename) => {
        const childpath = resolve(path, filename)
        const stat = fs.statSync(childpath);
        if (stat.isDirectory()) {
            console.log("Processing Directroy:", childpath);
            return Context.fromFolder(childpath, basepath).nodes;
        } else if (extname(childpath) === ".wrm") {
            console.log("  File:", childpath);
            return parseFile(childpath, basepath);
        }
        return null
    }).filter((page) => (page != null)));
}

module.exports = { Context }
