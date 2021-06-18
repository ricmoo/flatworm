export declare type Line = {
    classes: Array<string>;
    content: string;
};
export declare class Script {
    readonly codeRoot: string;
    readonly contextify: (context: any) => void;
    readonly _require: (name: string) => any;
    private _pageContext;
    constructor(codeRoot: string, contextify?: (context: any) => void);
    resetPageContext(): void;
    run(filename: string, code: string): Promise<Array<Line>>;
    _runMethod(name: string): Promise<void>;
    startup(): Promise<void>;
    shutdown(): Promise<void>;
}
