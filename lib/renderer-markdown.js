"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownRenderer = void 0;
const path_1 = require("path");
const document_1 = require("./document");
const markdown_1 = require("./markdown");
const renderer_1 = require("./renderer");
function repeat(c, length) {
    if (c.length === 0) {
        throw new Error("ugh...");
    }
    while (c.length < length) {
        c += c;
    }
    return c.substring(0, length);
}
// Maps languages into their markdown code specifier
const SupportedLanguages = {
    javascript: "javascript",
};
class MarkdownRenderer extends renderer_1.Renderer {
    constructor(filename) {
        super(filename || "README.md");
    }
    renderNode(node) {
        if (node instanceof markdown_1.LinkNode) {
            let url = node.link;
            let name = url;
            if (node.link.indexOf(":") === -1) {
                url = node.document.getLinkUrl(node.link);
                name = node.document.getLinkName(node.link);
            }
            if (node.children.length === 0) {
                return `[${name}](${url})`;
            }
            return `[${this.renderMarkdown(node.children)}](${url})`;
        }
        else if (node instanceof markdown_1.ListNode) {
            return node.items.map((item) => {
                return "- " + this.renderMarkdown(item);
            }).join("\n") + "\n\n";
        }
        else if (node instanceof markdown_1.ElementNode) {
            switch (node.style) {
                case markdown_1.ElementStyle.BOLD:
                    return "**" + this.renderMarkdown(node.children) + "**";
                case markdown_1.ElementStyle.ITALIC:
                case markdown_1.ElementStyle.UNDERLINE:
                    return "*" + this.renderMarkdown(node.children) + "*";
                case markdown_1.ElementStyle.SUPER: {
                    let text = this.renderMarkdown(node.children);
                    console.log(JSON.stringify(text));
                    if (!text.match(/^[a-zA-Z0-9]+$/i)) {
                        text = `(${text})`;
                    }
                    return "^" + text;
                }
                case markdown_1.ElementStyle.STRIKE:
                    return "~~" + this.renderMarkdown(node.children) + "~~";
                case markdown_1.ElementStyle.CODE:
                    return "`" + this.renderMarkdown(node.children) + "`";
                // Property (no need to process PropertyFragment below, we
                // can just capture the Node types here)
                case markdown_1.ElementStyle.NEW:
                    return ("**new **");
                case markdown_1.ElementStyle.NAME: {
                    const comps = node.textContent.split(".");
                    const output = ("**" + comps.pop() + "**");
                    return (comps.map((c) => (`*${c}* . `)).join("") + output);
                }
                case markdown_1.ElementStyle.PARAMETERS:
                    return node.textContent;
                case markdown_1.ElementStyle.ARROW:
                    return (" => ");
                case markdown_1.ElementStyle.RETURNS:
                    return ("*" + this.renderMarkdown(node.children) + "*");
            }
        }
        return super.renderNode(node);
    }
    renderFragment(fragment) {
        if (fragment instanceof document_1.CodeFragment) {
            const result = [
                "```", (SupportedLanguages[fragment.language] || ""), "\n",
            ];
            if (fragment.evaluated) {
                result.push(fragment.code.map((l) => l.content).join("\n").trim() + "\n");
            }
            else {
                result.push(fragment.source + "\n");
            }
            result.push("```\n\n");
            return result.join("");
        }
        else if (fragment instanceof document_1.TocFragment) {
            const page = fragment.page;
            return page.toc.slice(1).map((entry) => {
                const depth = (entry.depth - 1) * 2;
                const link = path_1.relative(page.path, entry.path.split("#")[0]) || "./";
                return `${repeat(" ", depth)}* [${entry.title}](${link})\n`;
            }).join("") + "\n";
        }
        switch (fragment.tag) {
            case document_1.FragmentType.SECTION:
            case document_1.FragmentType.SUBSECTION: {
                const title = fragment.title.textContent;
                const line = { section: "=", subsection: "-" }[fragment.tag];
                return (title + "\n" + repeat(line, title.length) + "\n\n");
            }
            case document_1.FragmentType.HEADING:
                return ("### " + fragment.title.textContent + "\n\n");
            case document_1.FragmentType.DEFINITION:
            case document_1.FragmentType.NOTE:
            case document_1.FragmentType.WARNING:
            case document_1.FragmentType.PROPERTY:
                return ("#### " + super.renderFragment(fragment));
            case document_1.FragmentType.CODE:
        }
        return super.renderFragment(fragment);
    }
    renderPage(page) {
        const banner = page.document.config.markdown.banner || "";
        return banner + super.renderPage(page);
    }
    getSymbol(name) {
        switch (name) {
            case "copy": return "(c)";
            case "ndash": return "--";
            case "mdash": return "---";
            case "div": return "/";
            case "times": return "\\*";
            case "le": return "<=";
            case "lt": return "<";
            case "ge": return ">=";
            case "gt": return ">";
            case "eacute": return "e";
            case "ouml": return "o";
            case "Xi": return "Xi";
        }
        return `((${name}))`;
    }
}
exports.MarkdownRenderer = MarkdownRenderer;
