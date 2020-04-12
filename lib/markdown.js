"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
};
var _document;
Object.defineProperty(exports, "__esModule", { value: true });
class Node {
    constructor() {
        _document.set(this, void 0);
    }
    _setDocument(document) {
        if (__classPrivateFieldGet(this, _document)) {
            throw new Error("already has a document");
        }
        __classPrivateFieldSet(this, _document, document);
    }
    get document() {
        return __classPrivateFieldGet(this, _document);
    }
}
exports.Node = Node;
_document = new WeakMap();
class TextNode extends Node {
    constructor(content) {
        super();
        this.content = content;
    }
    get textContent() {
        return this.content;
    }
}
exports.TextNode = TextNode;
var ElementStyle;
(function (ElementStyle) {
    ElementStyle["NORMAL"] = "normal";
    // Inline styles
    ElementStyle["BOLD"] = "bold";
    ElementStyle["ITALIC"] = "italic";
    ElementStyle["UNDERLINE"] = "Underline";
    ElementStyle["SUPER"] = "super";
    ElementStyle["CODE"] = "code";
    // Link
    ElementStyle["LINK"] = "link";
    // List (each child is a list element)
    ElementStyle["LIST"] = "list";
    // Property Styles
    ElementStyle["PROPERTY"] = "property";
    ElementStyle["NEW"] = "new";
    ElementStyle["NAME"] = "name";
    ElementStyle["PARAMETERS"] = "parameters";
    ElementStyle["ARROW"] = "arrow";
    ElementStyle["RETURNS"] = "returns";
})(ElementStyle = exports.ElementStyle || (exports.ElementStyle = {}));
;
class ElementNode extends Node {
    constructor(style, children) {
        super();
        this.style = style;
        if (typeof (children) === "string") {
            children = [new TextNode(children)];
        }
        else {
            children = children.map((child) => {
                if (typeof (child) === "string") {
                    return new TextNode(child);
                }
                return child;
            });
        }
        this.children = Object.freeze(children);
    }
    _setDocument(document) {
        super._setDocument(document);
        this.children.forEach((c) => c._setDocument(document));
    }
    get textContent() {
        return this.children.map((c) => c.textContent).join("");
    }
}
exports.ElementNode = ElementNode;
class LinkNode extends ElementNode {
    constructor(link, children) {
        super(ElementStyle.LINK, children);
        this.link = link;
    }
    get textContent() {
        if (this.children.length === 0) {
            return this.document.getLinkName(this.link);
        }
        return super.textContent;
    }
}
exports.LinkNode = LinkNode;
class ListNode extends ElementNode {
    constructor(children) {
        super(ElementStyle.LIST, children);
        this.items = this.children;
    }
}
exports.ListNode = ListNode;
class PropertyNode extends ElementNode {
    constructor(isConstructor, name, parameters, returns) {
        const children = [new ElementNode(ElementStyle.NAME, name)];
        if (parameters) {
            children.push(new ElementNode(ElementStyle.PARAMETERS, parameters));
        }
        if (returns) {
            children.push(new ElementNode(ElementStyle.ARROW, " => "));
            children.push(new ElementNode(ElementStyle.RETURNS, [returns]));
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
exports.PropertyNode = PropertyNode;
// Breaks markdown into blocks. Blocks are separated by an empty line
// and lists are implicitly in their own block.
function splitBlocks(markdown) {
    const result = [[]];
    let runningList = false;
    markdown.trim().split("\n").forEach((line) => {
        if (line.trim() === "") {
            result.push([]);
            runningList = false;
        }
        else if (!runningList && line.trim()[0] === "-") {
            runningList = true;
            result.push([line]);
        }
        else {
            result[result.length - 1].push(line);
        }
    });
    return result.filter((p) => (p.length > 0)).map((p) => p.join("\n").trim());
}
// Convert backslash escape sequences into their correct character
function escapeText(text) {
    // Do not allow a trailing backslash
    const backslashes = text.match(/(\\*)$/);
    if (backslashes && backslashes[1].length % 2) {
        throw new Error("strat backslash escape sequence");
    }
    // Replace all backslash escape sequences
    return new TextNode(text.replace(/\\(.)/g, (all, char) => char));
}
exports.escapeText = escapeText;
var MarkdownStyle;
(function (MarkdownStyle) {
    MarkdownStyle["BOLD"] = "bold";
    MarkdownStyle["ITALIC"] = "italic";
    MarkdownStyle["UNDERLINE"] = "underline";
    MarkdownStyle["CODE"] = "code";
    MarkdownStyle["SUPER"] = "super";
    MarkdownStyle["LINK"] = "link";
    MarkdownStyle["LIST"] = "list";
})(MarkdownStyle = exports.MarkdownStyle || (exports.MarkdownStyle = {}));
;
exports.StylesAll = Object.freeze([
    MarkdownStyle.BOLD,
    MarkdownStyle.ITALIC,
    MarkdownStyle.UNDERLINE,
    MarkdownStyle.CODE,
    MarkdownStyle.SUPER,
    MarkdownStyle.LINK,
    MarkdownStyle.LIST,
]);
const WrapTypes = {
    "**": ElementStyle.BOLD,
    "/\/": ElementStyle.ITALIC,
    "__": ElementStyle.UNDERLINE,
    "^^": ElementStyle.SUPER,
    "``": ElementStyle.CODE,
};
function simplify(result, markdown, styles) {
    const node = parseBlock(markdown, styles);
    if (node instanceof ElementNode && node.style === ElementStyle.NORMAL) {
        node.children.forEach((c) => { result.push(c); });
    }
    else {
        result.push(node);
    }
    return result;
}
// splitBlocks should be called first to make the list is split properly;
function parseBlock(markdown, styles) {
    if (markdown === "") {
        return new TextNode("");
    } // @TODO: something better? Filter...
    // Check for lists...
    if (markdown.trim()[0] === "-" && styles.indexOf(MarkdownStyle.LIST)) {
        const points = [];
        markdown.split("\n").forEach((line) => {
            line = line.trim();
            if (line.substring(0, 1) === "-") {
                points.push(line.substring(1).trim().replace(/^-/, "\\-") + " ");
            }
            else {
                points[points.length - 1] += line + " ";
            }
        });
        return new ListNode(points.map((point) => parseBlock(point, styles)));
    }
    // No list, so remove newlines and unnecessary spaces (do not trim)
    markdown = markdown.replace(/\s+/g, " ");
    // We want to process inline markdown from left-to-right, so we need
    // to find all possible inline candidates to find the left-most
    const candidates = [];
    // Check for links...
    // - "[[" /[a-z0-9_-]+/ "]]"
    // - "[" /* fix: [ */ not("]") "](" /[a-z0-9._&$+,/:;=?@#%-]+/ ")"
    const matchLink = markdown.match(/^((?:.|\n)*?)(\[\[([a-z0-9_-]+)\]\]|\[([^\x5d]+)\]\(([a-z0-9._~'!*:@,;&$+/=?@#%-]+)\))((?:.|\n)*)$/i);
    if (matchLink && styles.indexOf(MarkdownStyle.LINK) !== -1) {
        candidates.push({
            offset: matchLink[1].length,
            callback: () => {
                const result = [];
                simplify(result, matchLink[1], styles);
                if (matchLink[3]) {
                    result.push(new LinkNode(matchLink[3], []));
                }
                else {
                    // NOTE: We could support markdown for link names here, but
                    //       this complicates things (e.g. need to prohibit nested
                    //       links) as well as makes rendering engines harder.
                    //result.push(new LinkNode(matchLink[5], parseBlock(matchLink[4])));
                    result.push(new LinkNode(matchLink[5], [escapeText(matchLink[4])]));
                }
                simplify(result, matchLink[6], styles);
                if (result.length === 1) {
                    return result[0];
                }
                return new ElementNode(ElementStyle.NORMAL, result);
            }
        });
    }
    // Check for bold, italic, underline, superscript, and inline code...
    const matchStyle = markdown.match(/^((?:.|\n)*?)(\*\*|\/\/|__|\^\^|``)((?:.|\n)*)$/);
    if (matchStyle && styles.indexOf(WrapTypes[matchStyle[2]]) !== -1) {
        candidates.push({
            offset: matchStyle[1].length,
            callback: () => {
                const type = WrapTypes[matchStyle[2]];
                const open = matchStyle[1].length;
                const close = markdown.indexOf(matchStyle[2], open + 2);
                if (close === -1) {
                    throw new Error(`missing closing "${matchStyle[2]}" near ${JSON.stringify(markdown)}`);
                }
                const result = [];
                if (matchStyle[1]) {
                    simplify(result, matchStyle[1], styles);
                }
                //result.push(new ElementNode(type, simplify(parseBlock(markdown.substring(open + 2, close)))));
                result.push(new ElementNode(type, simplify([], markdown.substring(open + 2, close), styles)));
                if (close + 2 < markdown.length) {
                    simplify(result, markdown.substring(close + 2), styles);
                }
                if (result.length === 1) {
                    return result[0];
                }
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
exports.parseBlock = parseBlock;
function parseMarkdown(markdown, styles) {
    if (styles == null) {
        styles = exports.StylesAll;
    }
    return splitBlocks(markdown).map((block) => {
        const el = parseBlock(block, styles);
        if (el instanceof ElementNode && el.style === ElementStyle.NORMAL && el.children.length === 1) {
            return el.children[0];
        }
        return el;
    });
}
exports.parseMarkdown = parseMarkdown;
