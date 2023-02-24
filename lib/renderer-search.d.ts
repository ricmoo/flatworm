import { OutputFile, Renderer } from "./renderer.js";
import type { Document } from "./document.js";
export declare function toB64(value: number): string;
export declare function fromB64(value: string): number;
export declare type SummaryBlock = {
    link: string;
    text: string;
};
export declare type Summary = {
    title: string;
    blocks: Array<SummaryBlock>;
};
export declare class SearchRenderer extends Renderer {
    constructor(document: Document);
    render(): Array<OutputFile>;
}
