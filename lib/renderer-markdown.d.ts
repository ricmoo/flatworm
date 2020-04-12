import { Fragment, Page } from "./document";
import { Node } from "./markdown";
import { Renderer } from "./renderer";
export declare class MarkdownRenderer extends Renderer {
    constructor(filename?: string);
    renderNode(node: Node): string;
    renderFragment(fragment: Fragment): string;
    renderPage(page: Page): string;
}
