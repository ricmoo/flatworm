/// <reference types="node" />
import type { Document, Fragment, Page } from "./document";
import { Node } from "./markdown";
export declare type File = {
    filename: string;
    content: Buffer | string;
};
export declare class Renderer {
    readonly filename: string;
    constructor(filename: string);
    renderNode(node: Node): string;
    renderMarkdown(node: Node | Readonly<Array<Node>>): string;
    renderBlock(node: Node): string;
    renderBody(fragment: Fragment): string;
    renderTitle(fragment: Fragment): string;
    renderFragment(fragment: Fragment): string;
    pageFilename(page: Page): string;
    renderPage(page: Page): string;
    renderDocument(document: Document): Array<File>;
    getSymbol(name: string): string;
}
