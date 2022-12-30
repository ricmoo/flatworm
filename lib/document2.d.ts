import { Config } from "./config2.js";
import type { Node } from "./markdown.js";
import { Script } from "./script2.js";
export declare abstract class Fragment {
    #private;
    readonly titleNode: Node;
    readonly value: string;
    readonly anchor: string;
    constructor(directive: string, value: string);
    get title(): string;
    getExtension(key: string): null | string;
}
export declare class Section extends Fragment {
    readonly path: string;
    readonly body: Array<Content>;
    readonly subsections: Array<Subsection>;
    readonly filename: null | string;
    constructor(value: string, path: string, filename?: string);
    get dependencies(): Array<string>;
    get priority(): number;
    get navTitle(): string;
    evaluate(config: Config): Promise<void>;
    static fromContent(anchor: string, content: string, filename?: string): Section;
}
export declare class Subsection extends Fragment {
    readonly contents: Array<Content>;
    constructor(value: string, anchor: string);
    evaluate(config: Config): Promise<void>;
}
export declare abstract class Content extends Fragment {
    readonly tag: string;
    constructor(tag: string, value: string);
    static nullContent(body: string): Content;
    static fromContent(tag: string, value: string, body: string): Content;
}
export declare class BodyContent extends Content {
    readonly body: Array<Node>;
    constructor(tag: string, value: string, body: Array<Node>);
}
export declare class CodeContent extends Content {
    source: string;
    script: Script;
    constructor(value: string, source: string);
    get language(): string;
    evaluate(config: Config): Promise<void>;
}
export declare class TableContent extends Content {
}
export declare class Document {
    readonly config: Config;
    readonly sections: Array<Section>;
    constructor(config: Config);
    evaluate(): Promise<void>;
    static fromPath(path: string): Promise<Document>;
    static fromConfig(config: Config): Document;
}
