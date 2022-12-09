import type { Config } from "./config2.js";
export declare type ScriptLineType = "code" | "comment" | "result" | "error" | "placeholder" | "hidden" | "unknown";
export declare type ScriptLine = {
    line: string;
    type: ScriptLineType;
    lineNo: number;
};
export declare type ScriptReader = (line: ScriptLine) => void;
export declare class Script {
    #private;
    readonly language: string;
    readonly filename: string;
    readonly lineOffset: number;
    constructor(source: string, language: string, filename?: string, lineOffset?: number);
    get source(): string;
    isEvaluated(): boolean;
    evaluate(config: Config): Promise<void>;
    forEach(func: ScriptReader): void;
}
