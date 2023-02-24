import type { Document } from "./document.js";
export declare abstract class Node {
    #private;
    readonly id: number;
    constructor();
    _setDocument(document: Document): void;
    get document(): Document;
    abstract get textContent(): string;
}
export declare class TextNode extends Node {
    readonly content: string;
    constructor(content: string);
    get textContent(): string;
}
export declare class MacroNode extends TextNode {
    #private;
    readonly macro: string;
    readonly now: Date;
    static expandMacro(macro: string, now?: Date): string;
    _setModifiedDate(date: Date): void;
    constructor(macro: string);
    get textContent(): string;
}
export declare const SymbolNames: Array<string>;
export declare class SymbolNode extends TextNode {
    readonly name: string;
    constructor(name: string);
}
export declare enum ElementStyle {
    NORMAL = "normal",
    BOLD = "bold",
    ITALIC = "italic",
    UNDERLINE = "underline",
    SUPER = "super",
    STRIKE = "strike",
    CODE = "code",
    PARAM = "param",
    LINK = "link",
    LIST = "list",
    PROPERTY = "property",
    NEW = "new",
    NAME = "name",
    PARAMETERS = "parameters",
    ARROW = "arrow",
    RETURNS = "returns",
    CELL = "cell"
}
export declare class ElementNode extends Node {
    readonly children: ReadonlyArray<Node>;
    readonly style: ElementStyle;
    constructor(style: ElementStyle, children: string | Array<string | Node>);
    _setDocument(document: Document): void;
    get textContent(): string;
}
export declare class LinkNode extends ElementNode {
    readonly link: string;
    constructor(link: string, children: string | Array<string | Node>);
    get textContent(): string;
}
export declare class ListNode extends ElementNode {
    readonly items: ReadonlyArray<Node>;
    constructor(children: Array<Node>);
}
export declare class PropertyNode extends ElementNode {
    readonly isConstructor: boolean;
    readonly name: string;
    readonly parameters: string;
    readonly returns: Node;
    constructor(isConstructor: boolean, name: string, parameters: string, returns: Node);
}
export declare enum CellAlign {
    LEFT = "left",
    CENTER = "center",
    RIGHT = "right"
}
export declare class CellNode extends ElementNode {
    readonly row: number;
    readonly col: number;
    readonly align: CellAlign;
    readonly rowspan: number;
    readonly colspan: number;
    constructor(row: number, col: number, align: CellAlign, rowspan: number, colspan: number, children: Array<Node>);
}
export declare function escapeText(text: string): TextNode;
export declare enum MarkdownStyle {
    BOLD = "bold",
    ITALIC = "italic",
    UNDERLINE = "underline",
    CODE = "code",
    PARAM = "param",
    SUPER = "super",
    STRIKE = "strike",
    LINK = "link",
    LIST = "list"
}
export declare const StylesAll: readonly MarkdownStyle[];
export declare const StylesInline: readonly MarkdownStyle[];
export declare function expandMacro(macro: string, now: Date): string;
export declare function parseBlock(markdown: string, styles: ReadonlyArray<MarkdownStyle>): Node;
export declare function parseMarkdown(markdown: string, styles?: ReadonlyArray<MarkdownStyle>): Array<Node>;
