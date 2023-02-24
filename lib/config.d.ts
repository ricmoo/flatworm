export declare class Config {
    #private;
    readonly root: string;
    readonly title: string;
    readonly subtitle: string;
    readonly prefix: string;
    readonly srcBaseUrl: null | string;
    readonly contextify: (context: any) => void;
    readonly staticFiles: Array<string>;
    readonly docRoot: string;
    readonly codeRoot: string;
    readonly links: Map<string, {
        title: string;
        link: string;
        style: string;
    }>;
    constructor(root: string, config: any);
    getTimestamp(path: string): Promise<null | number>;
    resolve(...args: Array<string>): string;
    resolveDoc(...args: Array<string>): string;
    resolveCode(...args: Array<string>): string;
    static fromScript(path: string): Promise<Config>;
    static fromJson(path: string, json: string): Config;
    static fromPath(path: string): Promise<Config>;
}
