export declare type Line = {
    classes: Array<string>;
    content: string;
};
export declare class Script {
    readonly codeRoot: string;
    readonly _require: (name: string) => any;
    constructor(codeRoot: string);
    run(filename: string, code: string): Promise<Array<Line>>;
}
