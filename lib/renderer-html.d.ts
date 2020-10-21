import type { Config } from "./config";
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
    getRelativeAnchor(url: string, fragment?: string): string;
    getRelativeLink(url: string, fragment?: string): string;
    _getRelativeLink(url: string, fragment?: string): string;
    renderNode(node: Node): string;
    renderSidebar(page: Page): string;
    renderBlock(node: Node): string;
    renderFragment(fragment: Fragment): string;
    altLink(config: Config): string;
    renderHeader(page: Page, options: HeaderOptions): string;
    renderFooter(page: Page, options: FooterOptions): string;
    renderPage(page: Page): string;
    renderDocument(document: Document): Array<File>;
    getSymbol(name: string): string;
}
export declare class SinglePageHtmlRenderer extends HtmlRenderer {
    getRelativeAnchor(url: string, fragment?: string): string;
    getRelativeLink(url: string, fragment?: string): string;
    altLink(config: Config): string;
    renderFragment(fragment: Fragment): string;
    _renderSidebar(document: Document): string;
    renderDocument(document: Document): Array<File>;
}
export {};
