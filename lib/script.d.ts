export declare type Line = {
    classes: Array<string>;
    content: string;
};
export declare class Script {
    readonly codeRoot: string;
    readonly contextify: (context: any) => void;
    readonly _require: (name: string) => any;
    constructor(codeRoot: string, contextify?: (context: any) => void);
    run(filename: string, code: string): Promise<Array<Line>>;
}
