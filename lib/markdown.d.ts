import type { Document } from "./document";
export declare abstract class Node {
    #private;
    _setDocument(document: Document): void;
    get document(): Document;
    abstract get textContent(): string;
}
export declare class TextNode extends Node {
    readonly content: string;
    constructor(content: string);
    get textContent(): string;
}
export declare enum ElementStyle {
    NORMAL = "normal",
    BOLD = "bold",
    ITALIC = "italic",
    UNDERLINE = "Underline",
    SUPER = "super",
    CODE = "code",
    LINK = "link",
    LIST = "list",
    PROPERTY = "property",
    NEW = "new",
    NAME = "name",
    PARAMETERS = "parameters",
    ARROW = "arrow",
    RETURNS = "returns"
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
export declare function escapeText(text: string): TextNode;
export declare enum MarkdownStyle {
    BOLD = "bold",
    ITALIC = "italic",
    UNDERLINE = "underline",
    CODE = "code",
    SUPER = "super",
    LINK = "link",
    LIST = "list"
}
export declare const StylesAll: readonly MarkdownStyle[];
export declare function parseBlock(markdown: string, styles: ReadonlyArray<MarkdownStyle>): Node;
export declare function parseMarkdown(markdown: string, styles?: ReadonlyArray<MarkdownStyle>): Array<Node>;
