/// <reference types="node" />
import { Document } from "./document.js";
export declare class OutputFile {
    readonly filename: string;
    readonly content: string | Buffer;
    constructor(filename: string, content: string | Buffer);
}
export declare abstract class Renderer {
    readonly document: Document;
    constructor(document: Document);
    resolveLink(href: string): string;
    abstract render(): Array<OutputFile>;
}
