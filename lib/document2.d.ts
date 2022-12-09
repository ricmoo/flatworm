import { Config } from "./config2.js";
import type { Node } from "./markdown.js";
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
    constructor(value: string, path: string);
    get priority(): number;
    static fromContent(anchor: string, content: string): Section;
}
export declare class Subsection extends Fragment {
    readonly contents: Array<Content>;
    constructor(value: string, anchor: string);
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
    constructor(value: string, source: string);
    get language(): string;
}
export declare class TableContent extends Content {
}
export declare class Document {
    readonly config: Config;
    readonly sections: Array<Section>;
    constructor(config: Config);
    static fromPath(path: string): Promise<Document>;
    static fromConfig(config: Config): Document;
}
