"use strict";

import fs from "fs";
import { resolve } from "path";

import { CodeFragment, Document, Fragment, Page, TocFragment } from "./document";
import { ElementNode, LinkNode, ListNode, Node, PropertyNode, TextNode } from "./document";
import { ElementStyle, FragmentType, MarkdownStyle } from "./document";


const PageHeader = `<!DOCTYPE html>
<html>
  <head>
    <title><!--TITLE--></title>
    <link rel="stylesheet" type="text/css" href="/static/style.css">
  </head>
  <body>
    <div class="sidebar">
      <div class="header">
        <div class="logo"><a href="/"><div class="image"></div><div class="name"><!--BANNER_TITLE--></div><div class="version"><!--BANNER_SUBTITLE--></div></a></div>
      </div>
      <div class="toc"><div>
        <!--SIDEBAR-->
      </div></div>
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
  </body>
</html>
`;

export type File = {
    filename: string;
    content: Buffer | string;
}

const Tags: { [ style: string ]: string } = { };
Tags[ElementStyle.BOLD] = "b";
Tags[ElementStyle.CODE] = "code";
Tags[ElementStyle.ITALIC] = "i";
Tags[ElementStyle.SUPER] = "sup";
Tags[ElementStyle.UNDERLINE] = "u";

const DOT = '<span class="symbol">.</span>'

function escapeHtml(html: string): string {
    return html.replace(/(&([a-zA-Z0-9]+;)|<|>)/g, (all, token, entity) => {
        if (entity) {
            return token;
        }
        return (<any>{ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[token];
    });
}

function renderHtml(node: Node | ReadonlyArray<Node>): string {
    if (Array.isArray(node)) {
        return node.map((n) => renderHtml(n)).join("");
    }

    if (node instanceof TextNode) {
        return escapeHtml(node.content);

    } else if (node instanceof LinkNode) {
        let url = node.link;
        let name = url;
        if (node.link.indexOf(":") === -1) {
            url = node.document.getLinkUrl(node.link)
            name = node.document.getLinkName(node.link);
        }

        if (node.children.length === 0) {
            return `<a href="${ url }">${ name }</a>`;
        }

        return `<a href="${ url }">${ renderHtml(node.children) }</a>`;

    } else if (node instanceof PropertyNode) {
        const result: Array<string> = [ ];

        // The "new" modifier (optional)
        if (node.isConstructor) {
            result.push(`<span class="modifier">new </span>`);
        }

        // The property name; the final name will be bold
        {
            const nameComps = node.name.split(".");
            let name = `<span class="method">${ nameComps.pop() }</span>`;
            if (nameComps.length) {
                name = nameComps.map((n) => (`<span class="path">${ n }</span>`)).join(DOT) + DOT + name;
            }
            result.push(name);
        }

        // The property parameters (optional)
        if (node.parameters) {
            let params = node.parameters.replace(/([a-z0-9_]+)(?:=([^,\)]))?/ig, (all, key, defaultValue) => {
                let param = `<span class="param">${ key }</span>`;
                if (defaultValue) {
                    param += ` = <span class="default-value">${ defaultValue }</span>`;
                }
                return param;
            });

            params = params.replace(/([,\]\[\)\(])/g, (all, symbol) => {
                return `<span class="symbol">${ symbol }</span>`;
            });

            result.push(params);
        }

        // The return type (optional)
        if (node.returns) {
            result.push(` <span class="arrow">&rArr;</span> `);
            result.push(`<span class="returns">${ renderHtml(node.returns) }</span>`);
        }

        return result.join("");

    } else if (node instanceof ListNode) {
        const result: Array<string> = [ ];
        result.push(`<ul>`);
        node.items.forEach((item) => {
            result.push(`<li>${ renderHtml(item) }</li>`);
        });
        result.push(`</ul>`);

        return result.join("");

    } else if (node instanceof ElementNode) {
        switch (node.style) {
            case ElementStyle.NORMAL:
                 return renderHtml(node.children);
             case ElementStyle.CODE:
                 return `<code class="inline">${ renderHtml(node.children) }</code>`;
         }

         const tag = Tags[node.style] || "xxx";
         return `<${ tag }>${ renderHtml(node.children) }</${ tag }>`;
     }

     return `unknown(${ node })`;
}

function getTag(name: string, classes: Array<string>): string {
    return `<${ name } class="${ classes.join(" ") }">`;
}

export type RenderOptions = {
    skipEval?: boolean
};

function renderSidebar(page: Page): string {
    const output: Array<string> = [ ];

    // Get the table of contents for the root page
    const toc = page.document.toc.slice();

    const pageCount = page.path.split("/").length;

    output.push(`<div class="link title"><a href="/">${ toc.shift().title }</a></div>`)
    toc.forEach((entry) => {
        let entryCount = entry.path.split("/").length;
        if (entry.path.indexOf("#") >= 0) { entryCount++; }

        let classes: Array<string> = [ ];

        // Base node; always added
        if (entryCount === 3) { classes.push("base"); }

        if (entry.path.substring(0, page.path.length) === page.path) {
            if (entryCount === pageCount) {
                // Myself
                classes.push("myself");
                classes.push("ancestor");
            } else if (entryCount === pageCount + 1) {
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

        // A sibling of an ancestor
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

        if (classes.length === 0) { classes.push("hide"); }
        classes.push("link");
        classes.push("depth-" + entry.depth);

        output.push(`<div class="${ classes.join(" ") }"><a href="${ entry.path }">${ entry.title }</a></div>`);
    });

    return output.join("");
}

function renderFragment(fragment: Fragment, renderOptions?: RenderOptions): string {
    const output = [ ];

    if (fragment.link) {
        output.push(`<a name="${ fragment.link }"></a>`);
    }

    switch (fragment.tag) {
        case FragmentType.SECTION:
        case FragmentType.SUBSECTION:
        case FragmentType.HEADING: {
            output.push(`<a name="${ fragment.autoLink }"></a>`);

            const tag: string = ({ section: "h1", subsection: "h2", heading: "h3" })[fragment.tag];
            output.push(`<${ tag } class="show-anchors"><div>`);
              output.push(renderHtml(fragment.title))

              const extInherit = fragment.getExtension("inherit");
              if (extInherit) {
                const inherit = fragment.page.document.parseMarkdown(extInherit.replace(/\s+/g, " ").trim(), [ MarkdownStyle.LINK ]);
                output.push(`<span class="inherits"> inherits ${ renderHtml(inherit) }</span>`);
              } else {
                const extNote = fragment.getExtension("note");
                if (extNote) {
                  const note = fragment.page.document.parseMarkdown(extNote.replace(/\s+/g, " ").trim(), [ MarkdownStyle.LINK ]);
                  output.push(`<span class="inherits">${ renderHtml(note) }</span>`);
                }
              }

              output.push(`<div class="anchors">`);
                if (fragment.link !== "") {
                  output.push(`<a class="self" href="#${ fragment.link || fragment.autoLink }"></a>`);
                }

                const extSrc = fragment.getExtension("src");
                if (extSrc) {
                  const srcLink = fragment.page.document.config.getSourceUrl(extSrc, fragment.value);
                  output.push(`<a class="source" href="${ srcLink }">source</a>`);
                }
              output.push(`</div>`)
            output.push(`</div></${ tag }>`);
            break;
        }

        case FragmentType.DEFINITION:
        case FragmentType.NOTE:
        case FragmentType.WARNING: {
            const classes = [ "definition" ];
            if (fragment.tag !== "definition") {
              classes.push("container-box");
              classes.push(fragment.tag);
            }
            output.push(getTag("div", classes));
              output.push(`<div class="term">`);
                output.push(renderHtml(fragment.title));
                if (fragment.link) {
                  output.push(`<div class="anchors"><a class="self" href="#${ fragment.link }"></a></div>`);
                }
              output.push(`</div>`)
              output.push(`<div class="body">`)
              fragment.body.forEach((block) => {
                  output.push(`<p>${ renderHtml(block) }</p>`)
              });
              output.push(`</div>`)
            output.push(`</div>`)
            break;
        }

        case FragmentType.PROPERTY: {
            output.push(`<div class="property show-anchors">`);
              output.push(`<div class="signature">`);
                output.push(renderHtml(fragment.title))
                output.push(`<div class="anchors">`);
                  if (fragment.link) {
                    output.push(`<a class="self" href="#${ fragment.link }"></a>`);
                  }
                  const extSrc = fragment.getExtension("src");
                  if (extSrc) {
                    const srcLink = fragment.page.document.config.getSourceUrl(extSrc, fragment.value);
                    output.push(`<a class="source" href="${ srcLink }">source</a>`);
                  }
                output.push(`</div>`)
              output.push(`</div>`)
              output.push(`<div class="body">`)
                fragment.body.forEach((block) => {
                  output.push(`<p>${ renderHtml(block) }</p>`)
                });
              output.push(`</div>`)
            output.push(`</div>`)
            break;
        }

        case FragmentType.CODE: {
            if (!(fragment instanceof CodeFragment)) {
              throw new Error("invalid code fragment object");
            }

            if (fragment.evaluated) {
              output.push(`<div class="code">`);
              fragment.code.forEach((line) => {
                let content = escapeHtml(line.content) + "\n";
                if (line.classes.length) {
                  content = `<span class="${ line.classes.join(" ") }">${ content }</span>`;
                }
                output.push(content);
              });
              output.push(`</div>`);
            } else {
              output.push(`<div class="code">${ escapeHtml(fragment.source) }</div>`)
            }
            break;
        }

        case FragmentType.NULL: {
            fragment.body.forEach((block) => {
              output.push(`<p>${ renderHtml(block) }</p>`)
            });
            break;
        }

        case FragmentType.TOC: {
            if (!(fragment instanceof TocFragment)) {
              throw new Error("invalid code fragment object");
            }

            output.push(`<div class="toc">`);
            fragment.page.toc.slice(1).forEach((entry) => {
              const offset = (entry.depth - 1) * 28;
              output.push(`<div style="padding-left: ${ offset }px"><span class="bullet">&bull;</span><a href="${ entry.path }">${ entry.title }</a></div>`)
            });
            output.push(`</div>`);
            break;
        }
    }

    return output.join("");
}

type HeaderOptions = {
    breadcrumbs?: boolean
};

type FooterOptions = {
    nudges?: boolean
};

function renderHeader(page: Page, options: HeaderOptions): string {
    if (!options) { options = { }; }

    let header = PageHeader
                 .replace("<!--TITLE-->", (page.title || "Documentation"))
                 .replace("<!--BANNER_TITLE-->", (page.document.config.title || "TITLE"))
                 .replace("<!--BANNER_SUBTITLE-->", (page.document.config.subtitle || "SUBTITLE"))
                 .replace("<!--SIDEBAR-->", renderSidebar(page))

    if (options.breadcrumbs) {
        const breadcrumbs = [ `<span class="current">${ page.title }</span>` ];

        let path = page.path;
        while (path !== "/") {
            path = path.match(/(.*\/)([^/]+\/)/)[1];
            const p = page.document.getPage(path);
            const title = (p.sectionFragment.getExtension("nav") || p.title);
            breadcrumbs.unshift(`<a href="${ p.path }">${ title }</a>`)
        }

        header = header.replace("<!--BREADCRUMBS-->", breadcrumbs.join("&nbsp;&nbsp;&raquo;&nbsp;&nbsp;"));
    }


    return header;
}

function renderFooter(page: Page, options: FooterOptions): string {
    if (options == null) { options = { }; }

    // Add the copyright to the footer
    let footer = PageFooter.replace("<!--COPYRIGHT-->", renderHtml(page.document.copyright));

    // Add the next and previous links to the footer
    const navItems = page.document.toc;
    navItems.forEach((entry, index) => {
        if (entry.path === page.path) {
            if (index > 0) {
                const link = navItems[index - 1];
                footer = footer.replace("<!--PREV_LINK-->", `<a href="${ link.path }"><span class="arrow">&larr;</span>${ link.title }</a>`);
            }
            if (index + 1 < navItems.length) {
                const link = navItems[index + 1];
                footer = footer.replace("<!--NEXT_LINK-->", `<a href="${ link.path }">${ link.title }<span class="arrow">&rarr;</span></a>`);
            }
        }
    });

    return footer;
}

export function renderPage(page: Page, renderOptions?: RenderOptions): string {
    const output = [ ];

    // Add the HTML header
    output.push(renderHeader(page, { breadcrumbs: true }));

    // Render all the Fragments
    for (let f = 0; f < page.fragments.length; f++) {
        try {
            output.push(renderFragment(page.fragments[f]));
        } catch (error) {
            throw new Error(`${ error.message } [${ page.filename }]`);
        }
    }

    // Add the HTML footer
    output.push(renderFooter(page, { nudges: true }));

    return output.join("\n");
}

export function renderDocument(document: Document, options?: RenderOptions): Array<File> {
    const files: Array<File> = [ ];

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
        "script.js",
        "style.css"
    ].forEach((filename) => {
        files.push({
            filename: `static/${ filename }`,
            content: fs.readFileSync(resolve(__dirname, "../static", filename))
        });
    });

    // Copy over the logo, allowing for a custom override
    if (document.config.logo) {
        files.push({
            filename: "static/logo.svg",
            content: fs.readFileSync(resolve(document.basepath, document.config.logo))
        });
    } else {
        files.push({
            filename: "static/logo.svg",
            content: fs.readFileSync(resolve(__dirname, "../static/logo.svg"))
        });
    }

    // Render each Page
    for (let p = 0; p < document.pages.length; p++) {
        const page = document.pages[p];
        const filename = page.path.substring(1) + "index.html";
        const content = renderPage(page);
        files.push({ filename, content });
    }

    return files;
}
