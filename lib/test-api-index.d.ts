import { Config } from "./config2.js";
import { API } from "./jsdocs.js";
export declare type IndexEntryType = "class" | "constant" | "function" | "method" | "property" | "static_method" | "type" | "other";
export declare type IndexEntry = {
    text: string;
    sort: string;
    indent: number;
    type: IndexEntryType;
    highlight: null | {
        start: number;
        length: number;
    };
    link: string;
};
export declare class IndexGroup {
    #private;
    readonly header: string;
    constructor(header: string);
    addEntry(entry: IndexEntry): void;
    get entries(): Array<IndexEntry>;
}
export declare function getIndex(api: API): Array<IndexGroup>;
export declare function generateIndex(api: API): void;
export declare type TocEntry = {
    path: string;
    link: string;
    style: string;
    title: string;
};
export declare function generate(api: API, config: Config): Promise<void>;
