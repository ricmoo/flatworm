/**
 *  Normal Pages
 *  - Section
 *    - Subsection
 *      - CodeContent | BodyContent
 *
 *  API Pages
 *  - Section
 *    - Subsection | Exported
 *      - Exported
 */
import { Config } from "./config2.js";
import { Node } from "./markdown.js";
import { Script } from "./script2.js";
import { ApiSection, Export } from "./jsdocs.js";
export declare abstract class Fragment {
    #private;
    readonly titleNode: Node;
    readonly value: string;
    readonly anchor: string;
    constructor(directive: string, value: string);
    get title(): string;
    getExtension(key: string): null | string;
}
export declare class SectionWithBody<T extends Subsection | Exported = Subsection | Exported> extends Fragment implements Iterable<T> {
    readonly body: Array<Content>;
    readonly children: Array<T>;
    constructor(directive: string, value: string);
    get recursive(): boolean;
    get length(): number;
    [Symbol.iterator](): Iterator<T>;
    get text(): string;
}
export declare class Section extends SectionWithBody<Subsection | Exported> {
    readonly anchor: string;
    readonly path: string;
    dependencies: Array<string>;
    constructor(value: string, path: string);
    get priority(): number;
    get navTitle(): string;
    evaluate(config: Config): Promise<void>;
    static fromContent(content: string, path: string): Section;
    static fromApi(api: ApiSection, path: string): Section;
}
export declare class Subsection extends SectionWithBody<Exported> {
    readonly parentPath: string;
    constructor(value: string, parentPath: string);
    get path(): string;
    evaluate(config: Config): Promise<void>;
}
export declare class Exported extends SectionWithBody<Exported> {
    readonly exported: Export;
    readonly parentPath: string;
    readonly examples: Array<CodeContent>;
    constructor(exported: Export, parentPath: string);
    get path(): string;
    get recursive(): boolean;
    evaluate(config: Config): Promise<void>;
}
export declare abstract class Content extends Fragment {
    readonly tag: string;
    constructor(tag: string, value: string);
    abstract get text(): string;
    abstract evaluate(config: Config): Promise<void>;
    static nullContent(body: string): Content;
    static fromContent(tag: string, value: string, body: string): Content;
    static fromFlatworm(flatworm: string): Array<Content>;
}
export declare class BodyContent extends Content {
    readonly body: Array<Node>;
    constructor(tag: string, value: string, body: Array<Node>);
    evaluate(config: Config): Promise<void>;
    get text(): string;
}
export declare class CodeContent extends Content {
    source: string;
    script: Script;
    constructor(value: string, source: string);
    get text(): string;
    get language(): string;
    evaluate(config: Config): Promise<void>;
}
export declare class Document implements Iterable<Section> {
    readonly config: Config;
    readonly sections: Array<Section>;
    constructor(config: Config);
    get length(): number;
    [Symbol.iterator](): Iterator<Section>;
    evaluate(): Promise<void>;
    static fromPath(path: string): Promise<Document>;
    static fromConfig(config: Config): Document;
    getLinkName(anchor: string): string;
    getLinkUrl(anchor: string): string;
}
