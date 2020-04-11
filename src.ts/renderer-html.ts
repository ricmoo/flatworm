"use strict";

import { CodeFragment, Document, Fragment, Page } from "./document";
import { ElementNode, LinkNode, ListNode, Node, PropertyNode, TextNode } from "./document";
import { ElementStyle, FragmentType, MarkdownStyle } from "./document";

const PageHeader = `
<html>
  <head>
     <link rel="stylesheet" type="text/css" href="/static/style.css">
  </head>
  <body>
    <div class="sidebar">
      <div class="header">
        <div class="logo"><a href="/"><div class="image"></div><div class="name">%%TITLE%%</div><div class="version">%%SUBTITLE%%</div></a></div>
      </div>
      <div class="toc"><div>
        %%TOC%%
      </div></div>
    </div>
    <div class="content">
      <div class="breadcrumbs">TODO</div>
`;

const PageFooter = `
      <div class="footer">
        <div class="nav previous"><a href="%%PREV_LINK%%"><span class="arrow">&larr;</span>%%PREV_TITLE%%</a></div>
        <div class="nav next"><a href="%%NEXT_LINK">%%NEXT_TITLE%%<span class="arrow">&rarr;</span></a></div>
      </div>
      <div class="copyright">%%COPYRIGHT%%</div>
    </div>
    <script src="/static/script.js" type="text/javascript"></script>
  </body>
</html>
`;

export type File = {
    filename: string;
    content: string;
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

        //case FragmentType.TOC: {
        //}
    }

    return output.join("");
}

export function renderPage(page: Page, renderOptions?: RenderOptions): string {
    const output = [ ];
    const header = PageHeader
                   .replace("%%TITLE%%", (page.document.config.title || "TITLE"))
                   .replace("%%SUBTITLE%%", (page.document.config.subtitle || "SUBTITLE"))
    output.push(header);
    for (let f = 0; f < page.fragments.length; f++) {
        try {
            output.push(renderFragment(page.fragments[f]));
        } catch (error) {
            throw new Error(`${ error.message } [${ page.filename }]`);
        }
    }
    output.push(PageFooter.replace("%%COPYRIGHT%%", renderHtml(page.document.copyright)));
    return output.join("\n");
}

export function renderDocument(document: Document, options?: RenderOptions): Array<File> {
    const files: Array<File> = [ ];
    for (let p = 0; p < document.pages.length; p++) {
        const page = document.pages[p];
        const filename = page.path.substring(1) + "index.html";
        const content = renderPage(page);
        files.push({ filename, content });
    }
    return files;
}
