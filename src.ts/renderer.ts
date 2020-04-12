"use strict";

import { Document, Fragment, Page } from "./document";
import { ElementNode, Node } from "./markdown";


export type File = {
    filename: string;
    content: Buffer | string;
}

export class Renderer {
    readonly filename: string;

    constructor(filename: string) {
        this.filename = filename;
    }

    renderNode(node: Node): string {
        if (node instanceof ElementNode) {
            return this.renderMarkdown(node.children);
        }
        return node.textContent;
    }

    renderMarkdown(node: Node | Readonly<Array<Node>>): string {
        if (node instanceof Node) {
            return this.renderNode(node);
        }

        return node.map((node) => {
            return this.renderNode(node);
        }).join("");
    }

    renderFragment(fragment: Fragment): string {
        let output = [ ];

        if (fragment.title) {
            output.push(this.renderMarkdown(fragment.title) + "\n");
        }

        if (fragment.body) {
            fragment.body.forEach((block) => {
                output.push(this.renderMarkdown(block) + "\n\n");
            });
        }

        return output.join("") + "\n";
    }

    pageFilename(page: Page): string {
        return page.path.substring(1) + this.filename;
    }

    renderPage(page: Page): string {
        return page.fragments.map((fragment) => {
            try {
                return this.renderFragment(fragment);
            } catch (error) {
                throw new Error(`${ error.message } [${ page.filename }]`);
            }
        }).join("");
    }

    renderDocument(document: Document): Array<File> {
        return document.pages.map((page) => {
            return {
                filename: this.pageFilename(page),
                content: this.renderPage(page)
            };
        });
    }
}
