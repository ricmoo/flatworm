"use strict";

import { Document, Fragment, Page } from "./document";
import { ElementNode, ElementStyle, LinkNode, Node, PropertyNode, TextNode } from "./document";

const PageHeader = `
<html>
  <head>
     <link rel="stylesheet" type="text/css" href="/static/style.css">
  </head>
  <body>
    <div class="content">
      <div class="sidebar">TODO</div>
      <div class="breadcrumbs">TODO</div>
`;

const PageFooter = `
      <div class="footer">TODO</div>
      <div class="copyright">TODO</div>
    </div>
<!--    <script src="./script.js" type="text/javascript"></script> -->
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

function renderHtml(node: Node | Array<Node>): string {
    if (Array.isArray(node)) {
        return node.map((n) => renderHtml(n)).join("");
    }

    if (node instanceof TextNode) {
        return node.content;

    } else if (node instanceof LinkNode) {
        if (node.children.length === 0) {
            return `<a href="${ node.link }">@TODO: pull from document</a>`;
        }

        return `<a href="${ node.link }">${ renderHtml(node.children) }</a>`;

    } else if (node instanceof PropertyNode) {
        const result = [ ];

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

async function renderFragment(fragment: Fragment): Promise<string> {
    const output = [ ];

    switch (fragment.tag) {
        case "section":
        case "subsection":
        case "heading": {
            const tag: string = ({ section: "h1", subsection: "h2", heading: "h3" })[fragment.tag];
            output.push(`<${ tag } class="show-anchors"><div>${ renderHtml(fragment.title) }</div></${ tag }>`)
            break;
        }

        case "definition":
        case "note":
        case "warning": {
            const classes = [ "definition" ];
            if (fragment.tag !== "definition") {
                classes.push("container-box");
                classes.push(fragment.tag);
            }
            output.push(getTag("div", classes));
            output.push(`<div class="term">${ renderHtml(fragment.title) }</div>`)
            output.push(`<div class="body"><p>${ renderHtml(fragment.body) }</p></div>`)
            output.push(`</div>`)
            break;
        }

        case "property": {
            output.push(`<div class="property show-anchors">`);
            output.push(`<div class="signature">${ renderHtml(fragment.title) }</div>`)
            output.push(`<div class="body"><p>${ renderHtml(fragment.body) }</p></div>`)
            output.push(`</div>`)
        }
    }

    return output.join("");
}

export async function renderPage(page: Page): Promise<string> {
    const output = [ ];
    output.push(PageHeader);
    for (let f = 0; f < page.fragments.length; f++) {
        output.push(await renderFragment(page.fragments[f]));
    }
    output.push(PageFooter);
    return output.join("\n");
}

export async function renderDocument(document: Document): Promise<Array<File>> {
    const files: Array<File> = [ ];
    for (let p = 0; p < document.pages.length; p++) {
        const page = document.pages[p];
        const filename = page.path;
        const content = await renderPage(page);
        files.push({ filename, content });
    }
    return files;
}
