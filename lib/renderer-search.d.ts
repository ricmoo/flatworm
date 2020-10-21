import { Document } from "./document";
import { File, Renderer } from "./renderer";
export declare type SummaryBlock = {
    link: string;
    text: string;
};
export declare type Summary = {
    title: string;
    blocks: Array<SummaryBlock>;
};
export declare class SearchRenderer extends Renderer {
    constructor(filename?: string);
    renderDocument(document: Document): Array<File>;
}
