"use strict";

import type { Document, Fragment, Page } from "./document";
import { ElementNode, Node, SymbolNode } from "./markdown";


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
        if (node instanceof SymbolNode) {
            return this.getSymbol(node.name);

        } else if (node instanceof ElementNode) {
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

    renderBlock(node: Node): string {
        return this.renderMarkdown(node) + "\n";
    }

    renderBody(fragment: Fragment): string {
        return fragment.body.map((block) => (this.renderBlock(block))).join("\n") + "\n";
    }

    renderTitle(fragment: Fragment): string {
        return this.renderMarkdown(fragment.title) + "\n";
    }

    renderFragment(fragment: Fragment): string {
        return [
            (fragment.title ? this.renderTitle(fragment): ""),
            this.renderBody(fragment)
        ].join("\n") + "\n";
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

    getSymbol(name: string): string {
        return name;
    }
}
