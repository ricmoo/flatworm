"use strict";
import { ElementNode, Node, SymbolNode } from "./markdown";
export class Renderer {
    constructor(filename) {
        this.filename = filename;
    }
    renderNode(node) {
        if (node instanceof SymbolNode) {
            return this.getSymbol(node.name);
        }
        else if (node instanceof ElementNode) {
            return this.renderMarkdown(node.children);
        }
        return node.textContent;
    }
    renderMarkdown(node) {
        if (node instanceof Node) {
            return this.renderNode(node);
        }
        return node.map((node) => {
            return this.renderNode(node);
        }).join("");
    }
    renderBlock(node) {
        return this.renderMarkdown(node) + "\n";
    }
    renderBody(fragment) {
        return fragment.body.map((block) => (this.renderBlock(block))).join("\n") + "\n";
    }
    renderTitle(fragment) {
        return this.renderMarkdown(fragment.title) + "\n";
    }
    renderFragment(fragment) {
        return [
            (fragment.title ? this.renderTitle(fragment) : ""),
            this.renderBody(fragment)
        ].join("\n") + "\n";
    }
    pageFilename(page) {
        return page.path.substring(1) + this.filename;
    }
    renderPage(page) {
        return page.fragments.map((fragment) => {
            try {
                return this.renderFragment(fragment);
            }
            catch (error) {
                throw new Error(`${error.message} [${page.filename}]`);
            }
        }).join("");
    }
    renderDocument(document) {
        return document.pages.map((page) => {
            return {
                filename: this.pageFilename(page),
                content: this.renderPage(page)
            };
        });
    }
    getSymbol(name) {
        return name;
    }
}
//# sourceMappingURL=renderer.js.map