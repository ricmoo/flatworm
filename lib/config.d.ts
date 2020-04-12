export declare type ConfigLink = Readonly<{
    name: string;
    url: string;
}>;
export declare type MarkdownConfig = {
    banner?: string;
};
export declare class Config {
    readonly title: string;
    readonly subtitle: string;
    readonly logo: string;
    readonly link: string;
    readonly copyright: string;
    readonly codeRoot: string;
    readonly externalLinks: Readonly<{
        [name: string]: ConfigLink;
    }>;
    readonly markdown: Readonly<MarkdownConfig>;
    readonly _getSourceUrl: (key: string) => string;
    constructor(config: any);
    getSourceUrl(key: string, value: string): string;
    static fromRoot(path: string): Config;
    static fromScript(path: string): Config;
    static fromJson(path: string): Config;
}
