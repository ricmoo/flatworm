"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _Node_document, _Node_page, _Node_fragment, _MacroNode_modifiedDate;
let NextId = 1;
export class Node {
    constructor() {
        _Node_document.set(this, void 0);
        _Node_page.set(this, void 0);
        _Node_fragment.set(this, void 0);
        this.id = NextId++;
    }
    _setDocument(document, page, fragment) {
        if (__classPrivateFieldGet(this, _Node_document, "f")) {
            throw new Error("already has a document");
        }
        __classPrivateFieldSet(this, _Node_document, document, "f");
        __classPrivateFieldSet(this, _Node_page, page, "f");
        __classPrivateFieldSet(this, _Node_fragment, fragment, "f");
    }
    get document() {
        return __classPrivateFieldGet(this, _Node_document, "f");
    }
    get page() {
        return __classPrivateFieldGet(this, _Node_page, "f");
    }
    get fragment() {
        return __classPrivateFieldGet(this, _Node_fragment, "f");
    }
}
_Node_document = new WeakMap(), _Node_page = new WeakMap(), _Node_fragment = new WeakMap();
export class TextNode extends Node {
    constructor(content) {
        super();
        this.content = content;
    }
    get textContent() {
        return this.content;
    }
}
export class MacroNode extends TextNode {
    constructor(macro) {
        super(MacroNode.expandMacro(macro));
        _MacroNode_modifiedDate.set(this, void 0);
        this.now = new Date();
        this.macro = macro;
    }
    static expandMacro(macro, now) {
        if (now == null) {
            now = new Date();
        }
        return expandMacro(macro, now);
    }
    _setModifiedDate(date) {
        if (__classPrivateFieldGet(this, _MacroNode_modifiedDate, "f")) {
            throw new Error("modifiedDate already set");
        }
        __classPrivateFieldSet(this, _MacroNode_modifiedDate, date, "f");
    }
    get textContent() {
        return MacroNode.expandMacro(this.macro, this.now);
    }
}
_MacroNode_modifiedDate = new WeakMap();
// This list needs to be much more comprehensive; this is just the beginning
export const SymbolNames = [
    "copy",
    "mdash", "ndash",
    //    "div", "times", "le", "lt", "ge", "gt",
    "div", "times", "le", "ge",
    "eacute", "ouml",
    "Xi",
];
export class SymbolNode extends TextNode {
    constructor(name) {
        if (SymbolNames.indexOf(name) === -1) {
            throw new Error(`unknown symbol ${JSON.stringify(name)}`);
        }
        super(`&${name};`);
        this.name = name;
    }
}
export var ElementStyle;
(function (ElementStyle) {
    ElementStyle["NORMAL"] = "normal";
    // Inline styles
    ElementStyle["BOLD"] = "bold";
    ElementStyle["ITALIC"] = "italic";
    ElementStyle["UNDERLINE"] = "underline";
    ElementStyle["SUPER"] = "super";
    ElementStyle["STRIKE"] = "strike";
    ElementStyle["CODE"] = "code";
    ElementStyle["PARAM"] = "param";
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
    // Table Cell
    ElementStyle["CELL"] = "cell";
})(ElementStyle || (ElementStyle = {}));
;
export class ElementNode extends Node {
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
    _setDocument(document, page, fragment) {
        super._setDocument(document, page, fragment);
        this.children.forEach((c) => c._setDocument(document, page, fragment));
    }
    get textContent() {
        return this.children.map((c) => c.textContent).join("");
    }
}
export class LinkNode extends ElementNode {
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
export class ListNode extends ElementNode {
    constructor(children) {
        super(ElementStyle.LIST, children);
        this.items = this.children;
    }
}
export class PropertyNode extends ElementNode {
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
export var CellAlign;
(function (CellAlign) {
    CellAlign["LEFT"] = "left";
    CellAlign["CENTER"] = "center";
    CellAlign["RIGHT"] = "right";
})(CellAlign || (CellAlign = {}));
;
export class CellNode extends ElementNode {
    constructor(row, col, align, rowspan, colspan, children) {
        super(ElementStyle.CELL, children);
        this.row = row;
        this.col = col;
        this.align = align;
        this.rowspan = rowspan;
        this.colspan = colspan;
    }
}
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
export function escapeText(text) {
    // Do not allow a trailing backslash
    const backslashes = text.match(/(\\*)$/);
    if (backslashes && backslashes[1].length % 2) {
        throw new Error("strat backslash escape sequence");
    }
    // Replace all backslash escape sequences
    return new TextNode(text.replace(/\\(.)/g, (all, char) => char));
}
export var MarkdownStyle;
(function (MarkdownStyle) {
    MarkdownStyle["BOLD"] = "bold";
    MarkdownStyle["ITALIC"] = "italic";
    MarkdownStyle["UNDERLINE"] = "underline";
    MarkdownStyle["CODE"] = "code";
    MarkdownStyle["PARAM"] = "param";
    MarkdownStyle["SUPER"] = "super";
    MarkdownStyle["STRIKE"] = "strike";
    MarkdownStyle["LINK"] = "link";
    MarkdownStyle["LIST"] = "list";
})(MarkdownStyle || (MarkdownStyle = {}));
;
export const StylesAll = Object.freeze([
    MarkdownStyle.BOLD,
    MarkdownStyle.ITALIC,
    MarkdownStyle.UNDERLINE,
    MarkdownStyle.CODE,
    MarkdownStyle.PARAM,
    MarkdownStyle.SUPER,
    MarkdownStyle.STRIKE,
    MarkdownStyle.LINK,
    MarkdownStyle.LIST,
]);
export const StylesInline = Object.freeze([
    MarkdownStyle.BOLD,
    MarkdownStyle.ITALIC,
    MarkdownStyle.UNDERLINE,
    MarkdownStyle.CODE,
    MarkdownStyle.PARAM,
    MarkdownStyle.SUPER,
    MarkdownStyle.STRIKE,
    MarkdownStyle.LINK,
]);
const WrapTypes = {
    "**": ElementStyle.BOLD,
    "/\/": ElementStyle.ITALIC,
    "__": ElementStyle.UNDERLINE,
    "^^": ElementStyle.SUPER,
    "~~": ElementStyle.STRIKE,
    "``": ElementStyle.CODE,
    "%%": ElementStyle.PARAM,
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
const Months = [
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"
];
const Days = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday"
];
export function expandMacro(macro, now) {
    //    if (macro == "modified" && options.modifiedDate) {
    //    now = options.modifiedDate;
    //    macro = "now";
    //}
    switch (macro) {
        case "year":
            return String(now.getFullYear());
        case "month":
            return String(now.getMonth() + 1);
        case "monthName":
            return Months[now.getMonth()];
        case "day":
            return String(now.getDate());
        case "dayName":
            return Days[now.getDay()];
        case "hour":
            return String(now.getHours());
        case "minute":
            return String(now.getMinutes());
        case "second":
            return String(now.getSeconds());
        case "timestamp":
            return String(now.getTime());
        case "today":
            return [
                Months[now.getMonth()], " ",
                now.getDate(), " ",
                now.getFullYear()
            ].join("");
        case "now": {
            let hours = now.getHours();
            let meridian = "am";
            if (hours >= 12) {
                hours -= 12;
                meridian = "pm";
            }
            else if (hours === 0) {
                hours = 12;
            }
            return [
                Months[now.getMonth()], " ",
                now.getDate(), ", ",
                now.getFullYear(), ", ",
                hours, ":",
                now.getMinutes(),
                meridian
            ].join("");
        }
        case "date":
            return [
                now.getFullYear(),
                (now.getMonth() + 1),
                now.getDate()
            ].join("-");
        case "time":
            return [
                now.getHours(),
                now.getMinutes(),
                now.getSeconds()
            ].join(":");
    }
    throw new Error(`unknown macro ${JSON.stringify(macro)}`);
}
// splitBlocks should be called first to make the list is split properly;
export function parseBlock(markdown, styles) {
    if (markdown === "") {
        return new TextNode("");
    } // @TODO: something better? Filter...
    const childStyles = styles.filter((s) => (s !== MarkdownStyle.LIST));
    // Check for lists...
    if (markdown.trim()[0] === "-" && styles.indexOf(MarkdownStyle.LIST) !== -1) {
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
        return new ListNode(points.map((point) => parseBlock(point, childStyles)));
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
                simplify(result, matchLink[1], childStyles);
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
                simplify(result, matchLink[6], childStyles);
                if (result.length === 1) {
                    return result[0];
                }
                return new ElementNode(ElementStyle.NORMAL, result);
            }
        });
    }
    // Check for bold, italic, underline, superscript, and inline code...
    const matchStyle = markdown.match(/^((?:.|\n)*?)(\*\*|\/\/|__|\^\^|~~|``|%%)((?:.|\n)*)$/);
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
                    simplify(result, matchStyle[1], childStyles);
                }
                //result.push(new ElementNode(type, simplify(parseBlock(markdown.substring(open + 2, close)))));
                result.push(new ElementNode(type, simplify([], markdown.substring(open + 2, close), childStyles)));
                if (close + 2 < markdown.length) {
                    simplify(result, markdown.substring(close + 2), childStyles);
                }
                if (result.length === 1) {
                    return result[0];
                }
                return new ElementNode(ElementStyle.NORMAL, result);
            }
        });
    }
    // Check for symbol names (i.e. &NAME;)
    const matchSymbol = markdown.match(/^((?:.|\n)*?)&(\$?[a-z0-9]+);((?:.|\n)*)$/i);
    if (matchSymbol) {
        candidates.push({
            offset: matchSymbol[1].length,
            callback: () => {
                const result = [];
                if (matchSymbol[1]) {
                    simplify(result, matchSymbol[1], childStyles);
                }
                const symbol = matchSymbol[2];
                if (symbol[0] === "$") {
                    result.push(new MacroNode(symbol.substring(1)));
                }
                else {
                    result.push(new SymbolNode(symbol));
                }
                if (matchSymbol[3]) {
                    simplify(result, matchSymbol[3], childStyles);
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
export function parseMarkdown(markdown, styles) {
    if (styles == null) {
        styles = StylesAll;
    }
    return splitBlocks(markdown).map((block) => {
        const el = parseBlock(block, styles);
        if (el instanceof ElementNode && el.style === ElementStyle.NORMAL && el.children.length === 1) {
            return el.children[0];
        }
        return el;
    });
}
//# sourceMappingURL=markdown.js.map