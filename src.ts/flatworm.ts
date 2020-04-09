"use strict";

import { Document } from "./document";
import { Block, BlockGroup, Element, ElementStyle, Inline, Link, List, Page, Text } from "./output";

const WrapTypes: { [ sym: string ]: ElementStyle } = {
    "**": ElementStyle.BOLD,
    "/\/": ElementStyle.ITALIC,
    "__": ElementStyle.UNDERLINE,
    "^^": ElementStyle.SUPER,
    "``": ElementStyle.CODE,
};

function escapeText(text: string): Text {
    if (text.match(/(\\*)$/)[1].length % 2) {
        throw new Error("strat backslash escape sequence");
    }

    console.log("WWWW", text);
    return new Text(text.replace(/\\(.)/g, (all, char) => {
        console.log("QQQQQQQQ", char);
        return char;
    }));
}

function parseMarkdown(markdown: string): Array<Inline> {
    if (markdown === "") { return [ ]; }

    // Check for lists
    {
        let before = "";
        const points: Array<string> = [ ];
        markdown.split("\n").forEach((line) => {
            line = line.trim();
            if (line.substring(0, 1) === "-") {
                points.push(line.substring(1) + " ")
            } else if (points.length === 0) {
                before += line + " ";
            } else {
                points[points.length - 1] += line + " ";
            }
        });

        if (points.length) {
            const result = [ ];
            parseMarkdown(before).forEach((inline) => {
                result.push(inline);
            });
            result.push(new List(points.map((point) => {
                const els = parseMarkdown(point.trim());
                if (els.length === 1) { return els[0]; }
                return new Element(ElementStyle.NORMAL, els);
            })));
            return result;
        }
    }

    // No list, so remove newlines and unnecessary spaces
    markdown = markdown.replace(/\s+/g, " ");

    // Check for links...
    let match = markdown.match(/^((?:.|\n)*?)(\[\[([a-z0-9_-]+)\]\]|\[([a-z]+)\]\(([a-z0-9_-]+)\))((?:.|\n)*)$/i);
    if (match) {
        const result = [ ];
        parseMarkdown(match[1]).forEach((inline) => {
            result.push(inline);
        });
        if (match[3]) {
            result.push(new Link(match[3], [ ]));
        } else {
            result.push(new Link(match[5], [ escapeText(match[4]) ]));
        }
        parseMarkdown(match[6]).forEach((inline) => {
            result.push(inline);
        });
        return result;
    }

    // Check for bold, italic, underline, superscript, and inline code...
    match = markdown.match(/^((?:.|\n)*?)(\*\*|\/\/|__|\^\^|``)((?:.|\n)*)$/);
    if (match) {
        const type = WrapTypes[match[2]];
        const open = match[1].length;
        const close = markdown.indexOf(match[2], open + 2);
        if (close === -1) { throw new Error(`missing closing "${ match[2] }"`); }

        const result = [ ];
        if (match[1]) { result.push(escapeText(match[1])); }
        result.push(new Element(type, parseMarkdown(markdown.substring(open + 2, close))));
        parseMarkdown(markdown.substring(close + 2)).forEach((inline) => {
            result.push(inline);
        });

        return result;
    }

    return [ escapeText(markdown) ];
}

export function splitParagraphs(markdown: string): Array<string> {
    const result: Array<Array<string>> = [ ];
    markdown.trim().split("\n").forEach((line) => {
        if (line.trim() === "") {
            result.push([ ]);
        } else {
            if (result.length === 0) { result.push([ ]); }
            result[result.length - 1].push(line);
        }
    });
    return result.map((paragraph) => paragraph.join("\n").trim());
}

export async function parse(document: Document): Promise<Array<Page>> {
    const pages: Array<Page> = [ ];

    const nodes = document.nodes;
    for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n];

        let title = null;
        let blockGroups: Array<BlockGroup> = [ ];

        const fragments = node.fragments;
        for (let f = 0; f < fragments.length; f++) {
            const fragment = fragments[f];
            const blocks: Array<Block> = [ ];
            switch (fragment.tag) {
                case "section":
                case "subsection":
                case "heading":
                    blocks.push(new Block(escapeText(fragment.value)))
                    break;
                case "null":
                    splitParagraphs(fragment.body).forEach((paragraph) => {
                        const els = parseMarkdown(paragraph);
                        if (els.length === 0) { return; }
                        blocks.push(new Block(els));
                    });
                    break;
                default:
                    console.log("unhandled fragment: " + fragment.tag);
            }

            if (blocks.length === 0) { continue; }
            blockGroups.push(new BlockGroup(fragment.tag, blocks));
        }

        pages.push(new Page(title, blockGroups));
    }

    return pages;
}

(async function() {
    const doc = Document.fromFolder("docs.wrm", null);
    console.dir(doc, { depth: null });

    const pages = await parse(doc);
    console.dir(pages, { depth: null });
})();

/*

splitParagraphs(`
Hello **world**!! How are you?

Hark! A [[link]] to [nowhere](somewhere) but not here.

- This is a list
- Of **several
items**
-what do you think?

done?
`).forEach((p) => {
    console.log("====");
    console.dir(parseMarkdown(p), { depth: null });
});
*/
