/// <reference types="node" />
import type { Document } from "./document2.js";
export declare class OutputFile {
    readonly filename: string;
    readonly content: string | Buffer;
    constructor(filename: string, content: string | Buffer);
}
export declare type Link = {
    title: string;
    link: string;
    style: string;
};
interface Linkable {
    anchor: null | string;
    title: string;
    path: string;
}
export declare class HtmlRenderer implements Iterable<Linkable> {
    #private;
    readonly document: Document;
    constructor(document: Document);
    get length(): number;
    [Symbol.iterator](): Iterator<Linkable>;
    getLink(anchor: string): Link;
    getLinkable(href: string): Linkable;
    resolveLink(href: string): string;
    render(): Array<OutputFile>;
}
export {};
