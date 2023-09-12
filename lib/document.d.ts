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
import { Config } from "./config.js";
import { Node } from "./markdown.js";
import { Script } from "./script.js";
import { ApiSection, Export } from "./jsdocs.js";
export declare abstract class Fragment {
    #private;
    readonly titleNode: Node;
    readonly directive: string;
    readonly value: string;
    readonly anchor: string;
    constructor(directive: string, value: string);
    get title(): string;
    getExtension(key: string): null | string;
}
export declare abstract class SectionWithBody<T extends Subsection | Exported = Subsection | Exported> extends Fragment implements Iterable<T> {
    #private;
    readonly body: Array<Content>;
    readonly sid: string;
    constructor(directive: string, value: string);
    abstract get path(): string;
    get parent(): null | SectionWithBody;
    get depth(): number;
    get children(): ReadonlyArray<T>;
    _addChild(child: T): void;
    _setParent(parent: SectionWithBody): void;
    get recursive(): boolean;
    get length(): number;
    [Symbol.iterator](): Iterator<T>;
    evaluate(config: Config): Promise<void>;
    get text(): string;
}
export declare class Section extends SectionWithBody<Subsection | Exported> {
    #private;
    readonly anchor: string;
    dependencies: Array<string>;
    constructor(value: string, path: string);
    get path(): string;
    get mtime(): number;
    _setMtime(mtime: number): void;
    get priority(): number;
    get depth(): number;
    get navTitle(): string;
    static fromContent(content: string, path: string): Section;
    static fromApi(api: ApiSection, path: string): Section;
}
export declare class Subsection extends SectionWithBody<Exported> {
    readonly parentPath: string;
    constructor(value: string, parentPath: string);
    get path(): string;
}
export declare class Exported extends SectionWithBody<Exported> {
    readonly exported: Export;
    readonly parentPath: string;
    constructor(exported: Export, parentPath: string);
    get examples(): Array<Script>;
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
    static fromContent(tag: string, value: string, body: string, filename?: string): Content;
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
    filename: string;
    script: Script;
    constructor(value: string, source: string, path?: string);
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
    populateMtime(): Promise<void>;
    getLinkName(anchor: string): string;
    getLinkUrl(anchor: string): string;
}
