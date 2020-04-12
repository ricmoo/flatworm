"use strict";

import { relative } from "path";

import { CodeFragment, Fragment, FragmentType, Page, TocFragment } from "./document";
import { ElementStyle, ElementNode, LinkNode, ListNode, Node } from "./markdown";
import { Renderer } from "./renderer";


function repeat(c: string, length: number): string {
    if (c.length === 0) { throw new Error("ugh..."); }
    while (c.length < length) {
        c += c;
    }
    return c.substring(0, length);
}

export class MarkdownRenderer extends Renderer {
    constructor(filename?: string) {
        super(filename || "README.md");
    }

    renderNode(node: Node): string {
        if (node instanceof LinkNode) {
            let url = node.link;
            let name = url;
            if (node.link.indexOf(":") === -1) {
                url = node.document.getLinkUrl(node.link)
                name = node.document.getLinkName(node.link);
            }

            if (node.children.length === 0) {
                return `[${ name }](${ url })`;
            }

            return `[${ this.renderMarkdown(node.children) }](${ url })`;

        } else if (node instanceof ListNode) {
            return node.items.map((item) => {
                return "- " + this.renderMarkdown(item);
            }).join("\n") + "\n\n"

        } else if (node instanceof ElementNode) {
            switch (node.style) {
                case ElementStyle.BOLD:
                    return "**" + this.renderMarkdown(node.children) + "**";
                case ElementStyle.ITALIC:
                case ElementStyle.UNDERLINE:
                    return "*" + this.renderMarkdown(node.children) + "*";
                case ElementStyle.CODE:
                    return "`" + this.renderMarkdown(node.children) + "`";

                // Property (no need to process PropertyFragment below, we
                // can just capture the Node types here)
                case ElementStyle.NEW:
                    return ("**new **");
                case ElementStyle.NAME: {
                    const comps = node.textContent.split(".");
                    const output = ("**" + comps.pop() + "**");
                    return (comps.map((c) => (`*${ c }* . `)).join("") + output);
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

    renderFragment(fragment: Fragment): string {
        if (fragment instanceof CodeFragment) {
            if (fragment.evaluated) {
                return ("```\n" + fragment.code.map((l) => l.content).join("\n") + "```\n\n");
            }

            return ("```\n" + fragment.source + "```\n\n");

        } else if (fragment instanceof TocFragment) {
            const page = fragment.page;
            return page.toc.slice(1).map((entry) => {
                const depth = (entry.depth - 1) * 2;
                const link = relative(page.path, entry.path.split("#")[0]) || "./";
                return `${ repeat(" ", depth) }* [${ entry.title }](${ link })\n`
            }).join("") + "\n";
        }

        switch (fragment.tag) {
            case FragmentType.SECTION:
            case FragmentType.SUBSECTION: {
                const title = fragment.title.textContent;
                const line = (<any>{ section: "=", subsection: "-" })[fragment.tag];
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

    renderPage(page: Page): string {
        const banner = page.document.config.markdown.banner || "";
        return banner + super.renderPage(page);
    }
}

