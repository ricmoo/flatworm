import { Document, Fragment, Page } from "./document";
import { Node } from "./markdown";
import { File, Renderer } from "./renderer";
declare type HeaderOptions = {
    breadcrumbs?: boolean;
};
declare type FooterOptions = {
    nudges?: boolean;
};
export declare class HtmlRenderer extends Renderer {
    constructor(filename?: string);
    renderNode(node: Node): string;
    renderSidebar(page: Page): string;
    renderFragment(fragment: Fragment): string;
    renderHeader(page: Page, options: HeaderOptions): string;
    renderFooter(page: Page, options: FooterOptions): string;
    renderPage(page: Page): string;
    renderDocument(document: Document): Array<File>;
}
export {};
