"use strict";

import type { Document } from "./document";

export abstract class Node {
    #document: Document;
    _setDocument(document: Document): void {
        if (this.#document) { throw new Error("already has a document"); }
        this.#document = document;
    }

    get document(): Document {
        return this.#document;
    }

    abstract get textContent(): string;
}

export class TextNode extends Node {
    readonly content: string;

    constructor(content: string) {
        super();
        this.content = content;
    }

    get textContent(): string {
        return this.content;
    }
}

export enum ElementStyle {
    NORMAL     = "normal",

    // Inline styles
    BOLD       = "bold",
    ITALIC     = "italic",
    UNDERLINE  = "Underline",
    SUPER      = "super",
    CODE       = "code",

    // Link
    LINK       = "link",

    // List (each child is a list element)
    LIST       = "list",

    // Property Styles
    PROPERTY   = "property",
    NEW        = "new",
    NAME       = "name",
    PARAMETERS = "parameters",
    ARROW      = "arrow",
    RETURNS    = "returns",
};

export class ElementNode extends Node {
    readonly children: ReadonlyArray<Node>;
    readonly style: ElementStyle;

    constructor(style: ElementStyle, children: string | Array<string | Node>) {
        super();

        this.style = style;

        if (typeof(children) === "string") {
            children = [ new TextNode(children) ];
        } else {
            children = children.map((child) => {
                if (typeof(child) === "string") { return new TextNode(child); }
                return child;
            });
        }
        this.children = Object.freeze(<Array<Node>>children);
    }

    _setDocument(document: Document): void {
        super._setDocument(document);
        this.children.forEach((c) => c._setDocument(document));
    }

    get textContent(): string {
        return this.children.map((c) => c.textContent).join("");
    }
}

export class LinkNode extends ElementNode {
    readonly link: string;

    constructor(link: string, children: string | Array<string | Node>) {
        super(ElementStyle.LINK, children);
        this.link = link;
    }

    get textContent(): string {
        if (this.children.length === 0) {
            return this.document.getLinkName(this.link);
        }
        return super.textContent;
    }
}

export class ListNode extends ElementNode {
    readonly items: ReadonlyArray<Node>;

    constructor(children: Array<Node>) {
        super(ElementStyle.LIST, children);
        this.items = this.children;
    }
}

export class PropertyNode extends ElementNode {
    readonly isConstructor: boolean;
    readonly name: string;
    readonly parameters: string;
    readonly returns: Node;

    constructor(isConstructor: boolean, name: string, parameters: string, returns: Node) {
        const children = [ new ElementNode(ElementStyle.NAME, name) ];
        if (parameters) {
            children.push(new ElementNode(ElementStyle.PARAMETERS, parameters));
        }
        if (returns) {
            children.push(new ElementNode(ElementStyle.ARROW, " => "));
            children.push(new ElementNode(ElementStyle.RETURNS, [ returns ]));
        }
        if (isConstructor) {
            children.unshift(new ElementNode(ElementStyle.NEW, "new "));
        }
        super(ElementStyle.PROPERTY, children);

        this.isConstructor = isConstructor;
        this.name = name;
        this.parameters = parameters;
        this.returns = returns;
    }
}

// Breaks markdown into blocks. Blocks are separated by an empty line
// and lists are implicitly in their own block.
function splitBlocks(markdown: string): Array<string> {
    const result: Array<Array<string>> = [ [ ] ];

    let runningList = false;
    markdown.trim().split("\n").forEach((line) => {
        if (line.trim() === "") {
            result.push([ ]);
            runningList = false;
        } else if (!runningList && line.trim()[0] === "-") {
            runningList = true;
            result.push([ line ]);
        } else {
            result[result.length - 1].push(line);
        }
    });

    return result.filter((p) => (p.length > 0)).map((p) => p.join("\n").trim());
}

// Convert backslash escape sequences into their correct character
export function escapeText(text: string): TextNode {
    // Do not allow a trailing backslash
    const backslashes = text.match(/(\\*)$/);
    if (backslashes && backslashes[1].length % 2) {
        throw new Error("strat backslash escape sequence");
    }

    // Replace all backslash escape sequences
    return new TextNode(text.replace(/\\(.)/g, (all, char) => char));
}

export enum MarkdownStyle {
    BOLD       = "bold",
    ITALIC     = "italic",
    UNDERLINE  = "underline",
    CODE       = "code",
    SUPER      = "super",
    LINK       = "link",
    LIST       = "list",
};

export const StylesAll = Object.freeze([
    MarkdownStyle.BOLD,
    MarkdownStyle.ITALIC,
    MarkdownStyle.UNDERLINE,
    MarkdownStyle.CODE,
    MarkdownStyle.SUPER,
    MarkdownStyle.LINK,
    MarkdownStyle.LIST,
]);

const WrapTypes: { [ sym: string ]: ElementStyle } = {
    "**":   ElementStyle.BOLD,
    "/\/":  ElementStyle.ITALIC,
    "__":   ElementStyle.UNDERLINE,
    "^^":   ElementStyle.SUPER,
    "``":   ElementStyle.CODE,
};

function simplify(result: Array<Node>, markdown: string, styles: ReadonlyArray<MarkdownStyle>): Array<Node> {
    const node = parseBlock(markdown, styles);
    if (node instanceof ElementNode && node.style === ElementStyle.NORMAL) {
        node.children.forEach((c) => { result.push(c); });
    } else {
        result.push(node);
    }

    return result;
}

// splitBlocks should be called first to make the list is split properly;
export function parseBlock(markdown: string, styles: ReadonlyArray<MarkdownStyle>): Node {
    if (markdown === "") { return new TextNode(""); } // @TODO: something better? Filter...

    // Check for lists...
    if (markdown.trim()[0] === "-" && styles.indexOf(MarkdownStyle.LIST)) {

        const points: Array<string> = [ ];
        markdown.split("\n").forEach((line) => {
            line = line.trim();
            if (line.substring(0, 1) === "-") {
                points.push(line.substring(1).trim().replace(/^-/, "\\-") + " ");
            } else {
                points[points.length - 1] += line + " ";
            }
        });

        return new ListNode(points.map((point) => parseBlock(point, styles)));
    }

    // No list, so remove newlines and unnecessary spaces (do not trim)
    markdown = markdown.replace(/\s+/g, " ");
    // We want to process inline markdown from left-to-right, so we need
    // to find all possible inline candidates to find the left-most
    const candidates: Array<{ offset: number, callback: () => Node }> = [ ];

    // Check for links...
    // - "[[" /[a-z0-9_-]+/ "]]"
    // - "[" /* fix: [ */ not("]") "](" /[a-z0-9._&$+,/:;=?@#%-]+/ ")"
    const matchLink = markdown.match(/^((?:.|\n)*?)(\[\[([a-z0-9_-]+)\]\]|\[([^\x5d]+)\]\(([a-z0-9._~'!*:@,;&$+/=?@#%-]+)\))((?:.|\n)*)$/i);
    if (matchLink && styles.indexOf(MarkdownStyle.LINK) !== -1) {
        candidates.push({
            offset: matchLink[1].length,
            callback: () => {
                const result: Array<Node> = [ ];
                simplify(result, matchLink[1], styles);
                if (matchLink[3]) {
                    result.push(new LinkNode(matchLink[3], [ ]));
                } else {
                    // NOTE: We could support markdown for link names here, but
                    //       this complicates things (e.g. need to prohibit nested
                    //       links) as well as makes rendering engines harder.
                    //result.push(new LinkNode(matchLink[5], parseBlock(matchLink[4])));
                    result.push(new LinkNode(matchLink[5], [ escapeText(matchLink[4]) ]));
                }
                simplify(result, matchLink[6], styles);

                if (result.length === 1) { return result[0]; }
                return new ElementNode(ElementStyle.NORMAL, result);
            }
        });
    }

    // Check for bold, italic, underline, superscript, and inline code...
    const matchStyle = markdown.match(/^((?:.|\n)*?)(\*\*|\/\/|__|\^\^|``)((?:.|\n)*)$/);
    if (matchStyle && styles.indexOf(<any>WrapTypes[matchStyle[2]]) !== -1) {
        candidates.push({
            offset: matchStyle[1].length,
            callback: () => {
                const type = WrapTypes[matchStyle[2]];
                const open = matchStyle[1].length;
                const close = markdown.indexOf(matchStyle[2], open + 2);
                if (close === -1) {
                    throw new Error(`missing closing "${ matchStyle[2] }" near ${ JSON.stringify(markdown) }`);
                }


                const result: Array<Node> = [ ];
                if (matchStyle[1]) {
                    simplify(result, matchStyle[1], styles);
                }
                //result.push(new ElementNode(type, simplify(parseBlock(markdown.substring(open + 2, close)))));
                result.push(new ElementNode(type, simplify([ ], markdown.substring(open + 2, close), styles)));
                if (close + 2 < markdown.length) {
                    simplify(result, markdown.substring(close + 2), styles);
                }

                if (result.length === 1) { return result[0]; }
                return new ElementNode(ElementStyle.NORMAL, result);
            }
        });
    }

    if (candidates.length) {
        const leftmost = candidates.reduce((accum, candidate) => {
             if (accum.offset == null || accum.offset > candidate.offset) {
                 return candidate;
             }
             return accum;
        }, { offset: null, callback: null });
        return leftmost.callback();
    }

    return escapeText(markdown);
}

export function parseMarkdown(markdown: string, styles?: ReadonlyArray<MarkdownStyle>): Array<Node> {
    if (styles == null) { styles = StylesAll; }
    return splitBlocks(markdown).map((block) => {
        const el = parseBlock(block, styles);
        if (el instanceof ElementNode && el.style === ElementStyle.NORMAL && el.children.length === 1) {
            return el.children[0];
        }
        return el;
    });
}

