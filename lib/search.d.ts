export declare type SummaryBlock = {
    link: string;
    text: string;
};
export declare type Summary = {
    title: string;
    blocks: Array<SummaryBlock>;
};
export declare class SearchBuilder {
    #private;
    constructor();
    add(titles: Array<string>, link: string, body: string): void;
}
