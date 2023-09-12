import { SectionWithBody } from "./document.js";
import { OutputFile, Renderer } from "./renderer.js";
import type { Document } from "./document.js";
export type Link = {
    title: string;
    link: string;
    style: string;
};
interface Linkable {
    anchor: null | string;
    title: string;
    navTitle?: string;
    path: string;
}
export declare class HtmlRenderer extends Renderer implements Iterable<SectionWithBody> {
    #private;
    constructor(document: Document);
    get length(): number;
    [Symbol.iterator](): Iterator<SectionWithBody>;
    getLink(anchor: string): Link;
    getLinkable(href: string): Linkable;
    render(): Array<OutputFile>;
}
export {};
