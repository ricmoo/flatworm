import { Document } from "./document";
import { File, Renderer } from "./renderer";
export declare class MetadataRenderer extends Renderer {
    constructor(filename?: string);
    renderDocument(document: Document): Array<File>;
}
