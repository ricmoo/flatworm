import fs from "fs";
import { dirname, resolve } from "path";

export class Config {
    readonly root: string;

    readonly title: string;
    readonly subtitle: string;

    readonly prefix: string;
    readonly srcBaseUrl: null | string;

    readonly codeRoot: string;
    readonly links: Map<string, { title: string, link: string, style: string }>;

    constructor(root: string, config: any) {
        this.root = dirname(root);
        this.title = config.title || "no title";
        this.subtitle = config.subtitle || "no subtitle";
        this.prefix = (config.prefix || ".");
        this.srcBaseUrl = config.srcBaseUrl || null;
        this.codeRoot = this.resolve(config.codeRoot || "..");

        this.links = new Map();
        for (const linkFile of config.links) {
            const lines = fs.readFileSync(this.resolve(linkFile)).toString().split("\n");
            this.#addLinks(lines);
        }
    }

    #addLinks(lines: Array<string>): void {
        for (let line of lines) {
            line = line.trim();
            if (line === "" || line[0] === "#") { continue; }
            const match = line.match(/(\S+)\s+\[([^\]]+)\]\(([^\)]+)\)/);
            if (match == null) {
                console.log(line);
                throw new Error("bad link");
            }
            const key = match[1], title = match[2], link = match[3];

            this.links.set(key, { link, title, style: "normal" });
        }
    }

    resolve(...args: Array<string>): string {
        return resolve(this.root, ...args);
    }

    static async fromScript(path: string): Promise<Config> {
        path = resolve(path);
        let value = await import(path);
        if ("default" in value) { value = value["default"]; }
        return new Config(path, value);
    }
}
