"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const markdown_1 = require("./markdown");
class Renderer {
    constructor(filename) {
        this.filename = filename;
    }
    renderNode(node) {
        if (node instanceof markdown_1.ElementNode) {
            return this.renderMarkdown(node.children);
        }
        return node.textContent;
    }
    renderMarkdown(node) {
        if (node instanceof markdown_1.Node) {
            return this.renderNode(node);
        }
        return node.map((node) => {
            return this.renderNode(node);
        }).join("");
    }
    renderFragment(fragment) {
        let output = [];
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
}
exports.Renderer = Renderer;
