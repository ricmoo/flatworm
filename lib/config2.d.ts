export declare class Config {
    #private;
    readonly root: string;
    readonly title: string;
    readonly subtitle: string;
    readonly prefix: string;
    readonly srcBaseUrl: null | string;
    readonly staticFiles: Array<string>;
    readonly codeRoot: string;
    readonly links: Map<string, {
        title: string;
        link: string;
        style: string;
    }>;
    constructor(root: string, config: any);
    resolve(...args: Array<string>): string;
    static fromScript(path: string): Promise<Config>;
}
