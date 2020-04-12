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
    renderFragment(fragment: Fragment): string;
    pageFilename(page: Page): string;
    renderPage(page: Page): string;
    renderDocument(document: Document): Array<File>;
}
