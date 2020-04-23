import type { Config } from "./config";
import type { Line, Script } from "./script";
import { CellNode, MarkdownStyle, Node } from "./markdown";
export declare type TocEntry = {
    depth: number;
    title: string;
    path: string;
};
export declare enum FragmentType {
    SECTION = "section",
    SUBSECTION = "subsection",
    HEADING = "heading",
    DEFINITION = "definition",
    PROPERTY = "property",
    NOTE = "note",
    WARNING = "warning",
    CODE = "code",
    NULL = "null",
    TOC = "toc",
    TABLE = "table"
}
export declare class Fragment {
    #private;
    readonly tag: FragmentType;
    readonly value: string;
    readonly link: string;
    readonly title: Node;
    readonly body: ReadonlyArray<Node>;
    readonly extensions: Readonly<{
        [extension: string]: string;
    }>;
    constructor(tag: FragmentType, value: string, body: Array<Node>);
    get page(): Page;
    get autoLink(): string;
    get parent(): Fragment;
    _setDocument(document: Document): void;
    _setPage(page: Page, parents: Array<Fragment>): void;
    getExtension(name: string): string;
    static from(tag: FragmentType, value: string, body: string): Fragment;
}
export declare class CodeFragment extends Fragment {
    #private;
    readonly heading: string;
    readonly source: string;
    constructor(heading: string, source: string);
    get language(): string;
    get code(): ReadonlyArray<Line>;
    evaluate(script: Script): Promise<void>;
    get evaluated(): boolean;
}
export declare class TocFragment extends Fragment {
    readonly items: ReadonlyArray<string>;
    constructor(body: string);
}
export declare enum TableStyle {
    MINIMAL = "minimal",
    COMPACT = "compact",
    WIDE = "wide",
    FULL = "full"
}
export declare class TableFragment extends Fragment {
    #private;
    readonly rows: number;
    readonly cols: number;
    constructor(value: string, body: string);
    get style(): TableStyle;
    getCell(row: number, col: number): CellNode;
    getParentCell(row: number, col: number): CellNode;
    _setDocument(document: Document): void;
}
export declare class Page {
    #private;
    readonly fragments: ReadonlyArray<Fragment>;
    readonly filename: string;
    readonly title: string;
    readonly sectionFragment: Fragment;
    constructor(filename: string, fragments: Array<Fragment>);
    get toc(): ReadonlyArray<Readonly<TocEntry>>;
    get document(): Document;
    get path(): string;
    _setDocument(document: Document): void;
    static fromFile(filename: string): Page;
}
export declare class Document {
    #private;
    readonly basepath: string;
    readonly pages: ReadonlyArray<Page>;
    readonly config: Config;
    constructor(basepath: string, pages: Array<Page>, config: Config);
    get copyright(): Array<Node>;
    getLinkName(name: string): string;
    getLinkUrl(name: string): string;
    getPage(path: string): Page;
    get toc(): ReadonlyArray<Readonly<TocEntry>>;
    parseMarkdown(markdown: string, styles?: Array<MarkdownStyle>): Array<Node>;
    evaluate(script: Script): Promise<void>;
    static fromFolder(path: string, config: Config): Document;
}
