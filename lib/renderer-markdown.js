"use strict";
import { relative } from "path";
import { CodeFragment, FragmentType, TocFragment } from "./document";
import { ElementStyle, ElementNode, LinkNode, ListNode } from "./markdown";
import { Renderer } from "./renderer";
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
export class MarkdownRenderer extends Renderer {
    constructor(filename) {
        super(filename || "README.md");
    }
    renderNode(node) {
        if (node instanceof LinkNode) {
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
        else if (node instanceof ListNode) {
            return node.items.map((item) => {
                return "- " + this.renderMarkdown(item);
            }).join("\n") + "\n\n";
        }
        else if (node instanceof ElementNode) {
            switch (node.style) {
                case ElementStyle.BOLD:
                    return "**" + this.renderMarkdown(node.children) + "**";
                case ElementStyle.ITALIC:
                case ElementStyle.UNDERLINE:
                    return "*" + this.renderMarkdown(node.children) + "*";
                case ElementStyle.SUPER: {
                    let text = this.renderMarkdown(node.children);
                    console.log(JSON.stringify(text));
                    if (!text.match(/^[a-zA-Z0-9]+$/i)) {
                        text = `(${text})`;
                    }
                    return "^" + text;
                }
                case ElementStyle.STRIKE:
                    return "~~" + this.renderMarkdown(node.children) + "~~";
                case ElementStyle.CODE:
                    return "`" + this.renderMarkdown(node.children) + "`";
                // Property (no need to process PropertyFragment below, we
                // can just capture the Node types here)
                case ElementStyle.NEW:
                    return ("**new **");
                case ElementStyle.NAME: {
                    const comps = node.textContent.split(".");
                    const output = ("**" + comps.pop() + "**");
                    return (comps.map((c) => (`*${c}* . `)).join("") + output);
                }
                case ElementStyle.PARAMETERS:
                    return node.textContent;
                case ElementStyle.ARROW:
                    return (" => ");
                case ElementStyle.RETURNS:
                    return ("*" + this.renderMarkdown(node.children) + "*");
            }
        }
        return super.renderNode(node);
    }
    renderFragment(fragment) {
        if (fragment instanceof CodeFragment) {
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
        else if (fragment instanceof TocFragment) {
            const page = fragment.page;
            return page.toc.slice(1).map((entry) => {
                const depth = (entry.depth - 1) * 2;
                const link = relative(page.path, entry.path.split("#")[0]) || "./";
                return `${repeat(" ", depth)}* [${entry.title}](${link})\n`;
            }).join("") + "\n";
        }
        switch (fragment.tag) {
            case FragmentType.SECTION:
            case FragmentType.SUBSECTION: {
                const title = fragment.title.textContent;
                const line = { section: "=", subsection: "-" }[fragment.tag];
                return (title + "\n" + repeat(line, title.length) + "\n\n");
            }
            case FragmentType.HEADING:
                return ("### " + fragment.title.textContent + "\n\n");
            case FragmentType.DEFINITION:
            case FragmentType.NOTE:
            case FragmentType.WARNING:
            case FragmentType.PROPERTY:
                return ("#### " + super.renderFragment(fragment));
            case FragmentType.CODE:
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
//# sourceMappingURL=renderer-markdown.js.map