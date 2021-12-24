"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SinglePageHtmlRenderer = exports.HtmlRenderer = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = require("path");
const document_1 = require("./document");
const markdown_1 = require("./markdown");
const markdown_2 = require("./markdown");
const renderer_1 = require("./renderer");
const PageHeader = `<!DOCTYPE html>
<html class="PAGE_CLASS">
  <head>
    <title><!--TITLE--></title>
    <link rel="stylesheet" type="text/css" href="/static/style.css">
    <meta charset="UTF-8"> 
    <meta property="og:title" content="<!--TITLE-->"/>
    <meta property="og:description" content="<!--DESCRIPTION-->"/>
    <!--SOCIAL_IMAGE
    <meta property="og:image" content="<!--SOCIAL_IMAGE-->"/>
    SOCIAL_IMAGE-->
  </head>
  <body>
    <div class="sidebar">
      <div class="header">
        <div class="logo"><a href="/"><div class="image"></div><div class="name"><!--BANNER_TITLE--></div><div class="version"><!--BANNER_SUBTITLE--></div></a></div>
        <div class="search"><form action="/search/" method="GET"><input name="search" id="search" /></form><span class="search-icon">&#9906;</span></div>
      </div>
      <div class="toc"><div>
        <!--SIDEBAR-->
      </div></div>
      <div class="footer">
        <!--ALTLINK-->
      </div>
    </div>
    <div class="content">
      <div class="breadcrumbs"><!--BREADCRUMBS--></div>
`;
const PageFooter = `
      <div class="footer">
        <div class="nav previous"><!--PREV_LINK--></div>
        <div class="nav next"><!--NEXT_LINK--></div>
      </div>
      <div class="copyright"><!--COPYRIGHT--></div>
    </div>
    <script src="/static/script.js" type="text/javascript"></script>
    <!--EXTRASCRIPT-->
  </body>
</html>
`;
const SearchScript = '<script src="/static/search.js" type="text/javascript"></script>';
const Tags = {};
Tags[markdown_2.ElementStyle.BOLD] = "b";
Tags[markdown_2.ElementStyle.CODE] = "code";
Tags[markdown_2.ElementStyle.ITALIC] = "i";
Tags[markdown_2.ElementStyle.SUPER] = "sup";
Tags[markdown_2.ElementStyle.STRIKE] = "strike";
Tags[markdown_2.ElementStyle.UNDERLINE] = "u";
const DOT = '<span class="symbol">.</span>';
/*
// Maybe use this for code, so it can include entities?
function escapeHtml(html: string): string {
    return html.replace(/(&([a-zA-Z0-9]+;)|<|>)/g, (all, token, entity) => {
        if (entity) {
            return token;
        }
        return (<any>{ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[token];
    });
}
*/
function escape(html) {
    return html.replace(/(&|<|>)/g, (all, token) => {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[token];
    });
}
function getTag(name, classes) {
    return `<${name} class="${classes.join(" ")}">`;
}
class HtmlRenderer extends renderer_1.Renderer {
    constructor(filename) {
        super(filename || "index.html");
    }
    getRelativeAnchor(url, fragment) {
        return fragment;
    }
    getRelativeLink(url, fragment) {
        return url + (fragment ? ("#" + fragment) : "");
    }
    _getRelativeLink(url, fragment) {
        if (url.indexOf("#") !== -1) {
            if (fragment != null) {
                throw new Error("should not happen");
            }
            const comps = url.split("#");
            url = comps[0];
            fragment = comps[1];
        }
        return this.getRelativeLink(url, fragment);
    }
    renderNode(node) {
        if (node instanceof markdown_1.SymbolNode) {
            return `&${node.name};`;
        }
        else if (node instanceof markdown_1.TextNode) {
            return escape(node.content);
        }
        else if (node instanceof markdown_1.LinkNode) {
            let url = node.link;
            let name = url;
            if (node.link.indexOf(":") === -1) {
                url = node.document.getLinkUrl(node.link);
                name = node.document.getLinkName(node.link);
                if (url.indexOf(":") === -1) {
                    url = this._getRelativeLink(url);
                }
            }
            if (node.children.length === 0) {
                return `<a href="${url}">${name}</a>`;
            }
            return `<a href="${url}">${this.renderMarkdown(node.children)}</a>`;
        }
        else if (node instanceof markdown_1.PropertyNode) {
            const result = [];
            // The "new" modifier (optional)
            if (node.isConstructor) {
                result.push(`<span class="modifier">new </span>`);
            }
            // The property name; the final name will be bold
            {
                const nameComps = node.name.split(".");
                let name = `<span class="method">${nameComps.pop()}</span>`;
                if (nameComps.length) {
                    name = nameComps.map((n) => (`<span class="path">${n}</span>`)).join(DOT) + DOT + name;
                }
                result.push(name);
            }
            // The property parameters (optional)
            if (node.parameters) {
                let params = node.parameters.replace(/([a-z0-9_]+)(?:=([^,\)]))?/ig, (all, key, defaultValue) => {
                    let param = `<span class="param">${key}</span>`;
                    if (defaultValue) {
                        param += ` = <span class="default-value">${defaultValue}</span>`;
                    }
                    return param;
                });
                params = params.replace(/([,\]\[\)\(])/g, (all, symbol) => {
                    return `<span class="symbol">${symbol}</span>`;
                });
                result.push(params);
            }
            // The return type (optional)
            if (node.returns) {
                result.push(` <span class="arrow">&rArr;</span> `);
                result.push(`<span class="returns">${this.renderMarkdown(node.returns)}</span>`);
            }
            return result.join("");
        }
        else if (node instanceof markdown_1.ListNode) {
            const result = [];
            result.push(`<ul>`);
            node.items.forEach((item) => {
                result.push(`<li>${this.renderMarkdown(item)}</li>`);
            });
            result.push(`</ul>`);
            return result.join("");
        }
        else if (node instanceof markdown_1.ElementNode) {
            switch (node.style) {
                case markdown_2.ElementStyle.NORMAL:
                    return this.renderMarkdown(node.children);
                case markdown_2.ElementStyle.CODE:
                    return `<code class="inline">${this.renderMarkdown(node.children)}</code>`;
            }
            const tag = Tags[node.style] || "xxx";
            return `<${tag}>${this.renderMarkdown(node.children)}</${tag}>`;
        }
        return `unknown(${node})`;
    }
    renderSidebar(page) {
        const output = [];
        // Get the table of contents for the root page
        const toc = page.document.toc.slice();
        let pageCount = page.path.split("/").length;
        if (page.document.config.prefix) {
            pageCount--;
        }
        const childCount = toc.reduce((accum, entry) => {
            if (entry.path.substring(0, page.path.length) === page.path) {
                accum++;
            }
            return accum;
        }, 0);
        output.push(`<div class="link title"><a href="${page.document.config.getPath("/")}">${toc.shift().title}</a></div>`);
        toc.forEach((entry) => {
            let entryCount = entry.path.split("/").length;
            if (page.document.config.prefix) {
                entryCount--;
            }
            if (entry.path.indexOf("#") >= 0) {
                entryCount++;
            }
            let classes = [];
            // Base node; always added
            if (entryCount === 3) {
                classes.push("base");
            }
            let myself = false;
            if (entry.path.substring(0, page.path.length) === page.path) {
                if (entryCount === pageCount) {
                    // Myself
                    classes.push("myself");
                    classes.push("ancestor");
                    myself = true;
                }
                else if (entryCount === pageCount + 1) {
                    // Direct child
                    classes.push("child");
                }
            }
            // Ancestor
            if (classes.indexOf("child") === -1) {
                let basepath = entry.path.split("#")[0];
                if (page.path.substring(0, basepath.length) === basepath) {
                    classes.push("ancestor");
                }
            }
            // A sibling of an ancestor // @TODO: USe the regex instead?
            if (entry.path.indexOf("#") === -1) {
                const comps = entry.path.split("/");
                comps.pop();
                comps.pop();
                comps.push("");
                const path = comps.join("/");
                if (page.path.substring(0, path.length) === path) {
                    classes.push("show");
                }
            }
            if (classes.length === 0) {
                classes.push("hide");
            }
            classes.push("link");
            classes.push("depth-" + entry.depth);
            output.push(`<div class="${classes.join(" ")}"><a href="${entry.path}">${entry.title}</a></div>`);
            // No children, include all headings on this page
            if (myself && childCount === 1) {
                const classes = [
                    "link", "show", "child",
                    `depth-${entry.depth + 1}`
                ];
                page.fragments.forEach((fragment) => {
                    let title = null, path = null;
                    //if (fragment.tag === FragmentType.SUBSECTION || fragment.tag === FragmentType.HEADING) {
                    if (fragment.tag === document_1.FragmentType.SUBSECTION) {
                        title = fragment.title.textContent.trim();
                        path = "#" + (fragment.link || fragment.autoLink);
                    }
                    else {
                        return;
                    }
                    output.push(`<div class="${classes.join(" ")}"><a href="${path}">${title}</a></div>`);
                });
            }
        });
        return output.join("");
    }
    renderBlock(node) {
        return `<p>${this.renderMarkdown(node)}</p>\n`;
    }
    renderFragment(fragment) {
        const output = [];
        if (fragment.link) {
            output.push(`<a name="${this.getRelativeAnchor(fragment.page.path, fragment.link)}"></a>`);
        }
        if (fragment instanceof document_1.CodeFragment) {
            const title = fragment.title.textContent.trim();
            if (title) {
                output.push(`<div class="code-title"><div>${title}</div></div>`);
            }
            if (fragment.evaluated) {
                output.push(`<div class="code">`);
                fragment.code.forEach((line) => {
                    let content = escape(line.content) + "\n";
                    if (line.classes.length) {
                        content = `<span class="${line.classes.join(" ")}">${content}</span>`;
                    }
                    output.push(content);
                });
                output.push(`</div>`);
            }
            else {
                output.push(`<div class="code">${escape(fragment.source)}</div>`);
            }
            return output.join("");
        }
        else if (fragment instanceof document_1.TableFragment) {
            output.push(`<table class="table ${fragment.style}">`);
            for (let r = 0; r < fragment.rows; r++) {
                output.push(`<tr>`);
                for (let c = 0; c < fragment.cols; c++) {
                    const cell = fragment.getCell(r, c);
                    if (!cell) {
                        continue;
                    }
                    const attrs = [`align="${cell.align}"`];
                    if (cell.colspan !== 1) {
                        attrs.push(`colspan="${cell.colspan}"`);
                    }
                    if (cell.rowspan !== 1) {
                        attrs.push(`rowspan="${cell.rowspan}"`);
                    }
                    if (fragment.style !== document_1.TableStyle.MINIMAL) {
                        let width = Math.floor(100 / fragment.cols);
                        if (c === 0) {
                            width = 100 - (fragment.cols - 1) * width + (cell.colspan - 1) * width;
                        }
                        else {
                            width *= cell.colspan;
                        }
                        attrs.push(`width="${width}%"`);
                    }
                    output.push(`<td ${attrs.join(" ")}>`);
                    output.push(this.renderMarkdown(cell.children));
                    output.push(`</td>`);
                }
                output.push(`<td class="fix">&nbsp;</td>`);
                output.push(`</tr>`);
            }
            const title = fragment.title.textContent.trim();
            if (title !== "") {
                output.push(`<tr><td class="table-title" colspan="${fragment.cols}">${title}</td><td class="fix">&nbsp;</td></tr>`);
            }
            output.push(`</table>`);
            return output.join("");
        }
        else if (fragment instanceof document_1.TocFragment) {
            output.push(`<div class="toc">`);
            fragment.page.toc.slice(1).forEach((entry) => {
                const offset = (entry.depth - 1) * 28;
                output.push(`<div style="padding-left: ${offset}px"><span class="bullet">&bull;</span><a href="${this._getRelativeLink(entry.path)}">${entry.title}</a></div>`);
            });
            output.push(`</div>`);
            return output.join("");
        }
        switch (fragment.tag) {
            case document_1.FragmentType.SECTION:
            case document_1.FragmentType.SUBSECTION:
            case document_1.FragmentType.HEADING: {
                output.push(`<a name="${this.getRelativeAnchor(fragment.page.path, fragment.autoLink)}"></a>`);
                // Allow sections to link by page path
                const sectionLink = this.getRelativeAnchor(fragment.page.path);
                if (sectionLink) {
                    output.push(`<a name="${sectionLink}"></a>`);
                }
                const tag = ({ section: "h1", subsection: "h2", heading: "h3" })[fragment.tag];
                output.push(`<${tag} class="show-anchors"><div>`);
                output.push(this.renderMarkdown(fragment.title));
                const extInherit = fragment.getExtension("inherit");
                if (extInherit) {
                    const inherit = fragment.page.document.parseMarkdown(extInherit.replace(/\s+/g, " ").trim(), [markdown_2.MarkdownStyle.LINK]);
                    output.push(`<span class="inherits"> inherits ${this.renderMarkdown(inherit)}</span>`);
                }
                else {
                    const extNote = fragment.getExtension("note");
                    if (extNote) {
                        const note = fragment.page.document.parseMarkdown(extNote.replace(/\s+/g, " ").trim(), [markdown_2.MarkdownStyle.LINK]);
                        output.push(`<span class="inherits">${this.renderMarkdown(note)}</span>`);
                    }
                }
                output.push(`<div class="anchors">`);
                if (fragment.link !== "") {
                    output.push(`<a class="self" href="${this.getRelativeLink(fragment.page.path, fragment.link || fragment.autoLink)}"></a>`);
                }
                const extSrc = fragment.getExtension("src");
                if (extSrc) {
                    const srcLink = fragment.page.document.config.getSourceUrl(extSrc, fragment.value);
                    output.push(`<a class="source" href="${srcLink}">source</a>`);
                }
                output.push(`</div>`);
                output.push(`</div></${tag}>`);
                output.push(this.renderBody(fragment));
                break;
            }
            case document_1.FragmentType.DEFINITION:
            case document_1.FragmentType.NOTE:
            case document_1.FragmentType.WARNING: {
                const classes = ["definition"];
                if (fragment.tag !== "definition") {
                    classes.push("container-box");
                    classes.push(fragment.tag);
                }
                output.push(getTag("div", classes));
                output.push(`<div class="term">`);
                output.push(this.renderMarkdown(fragment.title));
                if (fragment.link) {
                    output.push(`<div class="anchors"><a class="self" href="${this.getRelativeLink(fragment.page.path, fragment.link)}"></a></div>`);
                }
                output.push(`</div>`);
                output.push(`<div class="body">`);
                output.push(this.renderBody(fragment));
                output.push(`</div>`);
                output.push(`</div>`);
                break;
            }
            case document_1.FragmentType.PROPERTY: {
                output.push(`<div class="property show-anchors">`);
                output.push(`<div class="signature">`);
                output.push(this.renderMarkdown(fragment.title));
                output.push(`<div class="anchors">`);
                if (fragment.link) {
                    output.push(`<a class="self" href="${this.getRelativeLink(fragment.page.path, fragment.link)}"></a>`);
                }
                const extSrc = fragment.getExtension("src");
                if (extSrc) {
                    const srcLink = fragment.page.document.config.getSourceUrl(extSrc, fragment.value);
                    output.push(`<a class="source" href="${srcLink}">source</a>`);
                }
                output.push(`</div>`);
                output.push(`</div>`);
                output.push(`<div class="body">`);
                output.push(this.renderBody(fragment));
                output.push(`</div>`);
                output.push(`</div>`);
                break;
            }
            case document_1.FragmentType.NULL: {
                output.push(this.renderBody(fragment));
                break;
            }
            default:
                throw new Error(`unhandled Fragment tag "${fragment.tag}"`);
        }
        return output.join("");
    }
    altLink(config) {
        return `<a href="${config.getPath("/single-page/")}">Single Page</a>`;
    }
    renderHeader(page, options) {
        if (!options) {
            options = {};
        }
        let header = PageHeader
            .replace(/(href|src|action)="(\/[^"]*)"/gi, (all, tag, path) => {
            return `${tag}="${page.document.config.getPath(path)}"`;
        })
            .replace("PAGE_CLASS", "paged")
            .replace(/<!--TITLE-->/g, (page.title || "Documentation"))
            .replace("<!--DESCRIPTION-->", (page.document.config.description || "Documentation"))
            .replace("<!--BANNER_TITLE-->", (page.document.config.title || "TITLE"))
            .replace("<!--BANNER_SUBTITLE-->", (page.document.config.subtitle || "SUBTITLE"))
            .replace("<!--SIDEBAR-->", this.renderSidebar(page))
            .replace("<!--ALTLINK-->", this.altLink(page.document.config));
        if (page.document.config.socialImage) {
            header = header.replace("<!--SOCIAL_IMAGE-->", page.document.config.getPath("/static/" + page.document.config.socialImage))
                .replace("<!--SOCIAL_IMAGE", "")
                .replace("SOCIAL_IMAGE-->", "");
        }
        if (options.breadcrumbs) {
            const breadcrumbs = [`<span class="current">${page.title}</span>`];
            const root = page.document.config.getPath("/");
            let path = page.path;
            while (path !== root) {
                path = path.match(/(.*\/)([^/]+\/)/)[1];
                const p = page.document.getPage(path);
                const title = (p.sectionFragment.getExtension("nav") || p.title);
                breadcrumbs.unshift(`<a href="${p.path}">${title}</a>`);
            }
            header = header.replace("<!--BREADCRUMBS-->", breadcrumbs.join("&nbsp;&nbsp;&raquo;&nbsp;&nbsp;"));
        }
        return header;
    }
    renderFooter(page, options) {
        if (options == null) {
            options = {};
        }
        // Add the copyright to the footer
        let footer = PageFooter;
        if (page.title === "Search") {
            footer = footer.replace("<!--EXTRASCRIPT-->", SearchScript);
        }
        footer = footer.replace(/(href|src)="(\/[^"]*)"/gi, (all, tag, path) => {
            return `${tag}="${page.document.config.getPath(path)}"`;
        }).replace("<!--COPYRIGHT-->", this.renderMarkdown(page.document.copyright));
        // Add the next and previous links to the footer
        const navItems = page.document.toc;
        navItems.forEach((entry, index) => {
            if (entry.path === page.path) {
                if (index > 0) {
                    const link = navItems[index - 1];
                    footer = footer.replace("<!--PREV_LINK-->", `<a href="${link.path}"><span class="arrow">&larr;</span>${link.title}</a>`);
                }
                if (index + 1 < navItems.length) {
                    const link = navItems[index + 1];
                    footer = footer.replace("<!--NEXT_LINK-->", `<a href="${link.path}">${link.title}<span class="arrow">&rarr;</span></a>`);
                }
            }
        });
        return footer;
    }
    renderPage(page) {
        const output = [];
        // Add the HTML header
        output.push(this.renderHeader(page, { breadcrumbs: true }));
        output.push(super.renderPage(page));
        // Add the HTML footer
        output.push(this.renderFooter(page, { nudges: true }));
        return output.join("\n");
    }
    renderDocument(document) {
        const files = [];
        const base = document.config.getPath("/static/").substring(1);
        // Copy all static files
        [
            "link.svg",
            "lato/index.html",
            "lato/Lato-Italic.ttf",
            "lato/Lato-Black.ttf",
            "lato/Lato-Regular.ttf",
            "lato/Lato-BlackItalic.ttf",
            "lato/OFL.txt",
            "lato/README.txt",
            "search.js",
            "script.js",
            "style.css"
        ].forEach((filename) => {
            let content = fs_1.default.readFileSync(path_1.resolve(__dirname, "../static", filename));
            // Re-write CSS urls to match the prefix
            if (filename.match(/\.css$/)) {
                console.log("Found: " + filename);
                content = content.toString().replace(/(url\(['"]?)(\/[^"')]*)(['"]?\))/gi, (all, prefix, href, suffix) => {
                    return (prefix + document.config.getPath(href) + suffix);
                });
            }
            files.push({
                filename: (base + filename),
                content: content
            });
        });
        // Copy over the logo, allowing for a custom override
        if (document.config.logo) {
            files.push({
                filename: (base + "logo.svg"),
                content: fs_1.default.readFileSync(path_1.resolve(document.basepath, document.config.logo))
            });
        }
        else {
            files.push({
                filename: (base + "logo.svg"),
                content: fs_1.default.readFileSync(path_1.resolve(__dirname, "../static/logo.svg"))
            });
        }
        if (document.config.socialImage) {
            files.push({
                filename: (base + document.config.socialImage),
                content: fs_1.default.readFileSync(path_1.resolve(document.basepath, document.config.socialImage))
            });
        }
        super.renderDocument(document).forEach((file) => {
            files.push(file);
        });
        return files;
    }
    getSymbol(name) {
        return `&${name};`;
    }
}
exports.HtmlRenderer = HtmlRenderer;
class SinglePageHtmlRenderer extends HtmlRenderer {
    getRelativeAnchor(url, fragment) {
        return (url + (fragment ? ("-%23-" + fragment) : ""));
    }
    getRelativeLink(url, fragment) {
        if (fragment) {
            return `#${url}-%23-${fragment}`;
        }
        return `#${url}`;
    }
    altLink(config) {
        return `<a href="${config.getPath("/")}">Split Pages</a>`;
    }
    renderFragment(fragment) {
        const output = [];
        if (fragment instanceof document_1.TocFragment) {
            output.push(`<div class="toc">`);
            fragment.page.toc.slice(1).forEach((entry) => {
                if (entry.depth !== 1) {
                    return;
                }
                const offset = (entry.depth - 1) * 28;
                output.push(`<div style="padding-left: ${offset}px"><span class="bullet">&bull;</span><a href="${this._getRelativeLink(entry.path)}">${entry.title}</a></div>`);
            });
            output.push(`</div>`);
            return output.join("");
        }
        return super.renderFragment(fragment);
    }
    _renderSidebar(document) {
        const output = [];
        // Get the table of contents for the root page
        const toc = document.toc.slice();
        const path = "/";
        const pageCount = path.split("/").length;
        output.push(`<div class="link title"><a href="${document.config.getPath("/single-page/")}">${toc.shift().title}</a></div>`);
        toc.forEach((entry) => {
            let entryCount = entry.path.split("/").length;
            if (entry.path.indexOf("#") >= 0) {
                entryCount++;
            }
            let classes = [];
            // Base node; always added
            if (entryCount === 3) {
                classes.push("base");
            }
            if (entry.path.substring(0, path.length) === path) {
                if (entryCount === pageCount) {
                    // Myself
                    classes.push("myself");
                    classes.push("ancestor");
                }
                else if (entryCount === pageCount + 1) {
                    // Direct child
                    classes.push("child");
                }
            }
            // Ancestor
            if (classes.indexOf("child") === -1) {
                let basepath = entry.path.split("#")[0];
                if (path.substring(0, basepath.length) === basepath) {
                    classes.push("ancestor");
                }
            }
            // A sibling of an ancestor // @TODO: USe the regex instead?
            if (entry.path.indexOf("#") === -1) {
                const comps = entry.path.split("/");
                comps.pop();
                comps.pop();
                comps.push("");
                const path = comps.join("/");
                if (path.substring(0, path.length) === path) {
                    classes.push("show");
                }
            }
            if (classes.length === 0) {
                classes.push("hide");
            }
            classes.push("link");
            classes.push("depth-" + entry.depth);
            output.push(`<div class="show ${classes.join(" ")}"><a href="${this._getRelativeLink(entry.path)}">${entry.title}</a></div>`);
        });
        return output.join("");
    }
    renderDocument(document) {
        const pages = document.toc.map((entry) => {
            const page = document.getPage(entry.path);
            return renderer_1.Renderer.prototype.renderPage.call(this, page);
        }).join(`<div class="page-separator"></div>`);
        let header = PageHeader
            .replace(/(action|href|src)="(\/[^"]*)"/gi, (all, tag, path) => {
            return `${tag}="${document.config.getPath(path)}"`;
        })
            .replace("PAGE_CLASS", "single-page")
            .replace(/<!--TITLE-->/g, (document.config.title || "Documentation"))
            .replace("<!--DESCRIPTION-->", (document.config.description || "Documentation"))
            .replace("<!--BANNER_TITLE-->", (document.config.title || "TITLE"))
            .replace("<!--BANNER_SUBTITLE-->", (document.config.subtitle || "SUBTITLE"))
            .replace("<!--SIDEBAR-->", this._renderSidebar(document))
            .replace("<!--ALTLINK-->", this.altLink(document.config));
        if (document.config.socialImage) {
            header = header.replace("<!--SOCIAL_IMAGE-->", document.config.getPath("/static/" + document.config.socialImage))
                .replace("<!--SOCIAL_IMAGE", "")
                .replace("SOCIAL_IMAGE-->", "");
        }
        const footer = PageFooter
            .replace(/(href|src)="(\/[^"]*)"/gi, (all, tag, path) => {
            return `${tag}="${document.config.getPath(path)}"`;
        })
            .replace("<!--COPYRIGHT-->", this.renderMarkdown(document.copyright));
        return [{
                filename: document.config.getPath("/" + this.filename).substring(1),
                content: (header + pages + footer)
            }];
    }
}
exports.SinglePageHtmlRenderer = SinglePageHtmlRenderer;
