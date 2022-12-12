import { Script } from "./script2.js";
import type { Config } from "./config2.js";
declare type Node = any;
export declare type VisitFunc = (type: string, node: Node, ancestors: Array<Node>, depth: number) => void;
export declare function indent(size: number): string;
export declare function getExports(path: string): Record<string, Set<string>>;
export declare function getObjects(path: string, exports: Set<string>): Array<any>;
export declare class Param {
    readonly name: string;
    readonly type: Type;
    readonly optional: boolean;
    constructor(name: string, type: Type, optional: boolean);
    toString(): string;
}
export declare class Type {
    type: string;
    constructor(type: string);
    dump(_indent?: number): void;
}
export declare class TypeTodo extends Type {
    constructor(type: string);
}
export declare class TypeBasic extends Type {
}
export declare class TypeLiteral extends Type {
}
export declare class TypeIdentifier extends Type {
}
export declare class TypeMapping extends Type {
    readonly children: Record<string, Type>;
    constructor(children: Record<string, Type>);
}
export declare class TypeGroup extends Type {
    readonly relation: string;
    readonly types: Array<Type>;
    constructor(relation: string, types: Array<Type>);
    dump(_indent?: number): void;
}
export declare class TypeWrapped extends Type {
    readonly wrapper: string;
    readonly child: Type;
    constructor(wrapper: string, child: Type);
    dump(_indent?: number): void;
}
export declare class TypeFunction extends Type {
    readonly params: Array<Param>;
    readonly returns: Type;
    constructor(params: Array<Param>, returns: Type);
}
export declare class Export {
    #private;
    readonly filename: string;
    readonly lineno: number;
    readonly name: string;
    constructor(filename: string, lineno: number, name: string, docs: string);
    get dependencies(): Array<string>;
    get id(): string;
    get docs(): string;
    get flatworm(): string;
    get docTags(): Record<string, Array<string>>;
    getTag(key: string): Array<string>;
    evaluate(config: Config): Promise<void>;
    examples(): Array<Script>;
    _updateDocs(docs: string): void;
    dump(_indent?: number): void;
}
export declare abstract class ReturnsExport extends Export {
    #private;
    get parent(): null | ObjectExport;
    constructor(filename: string, lineno: number, name: string, docs: string, returns: Type);
    _setParent(parent: ObjectExport): void;
    get id(): string;
    abstract get type(): string;
    get prefix(): string;
    get returns(): Type;
    dump(_indent?: number): void;
}
export declare class FunctionExport extends ReturnsExport {
    readonly params: Array<Param>;
    readonly isStatic: boolean;
    readonly isAbstract: boolean;
    constructor(filename: string, lineno: number, name: string, docs: string, returns: Type, params: Array<Param>, isStatic: boolean, isAbstract: boolean);
    get id(): string;
    get type(): string;
    get prefix(): string;
    dump(_indent?: number): void;
}
export declare class PropertyExport extends ReturnsExport {
    _access: string;
    constructor(filename: string, lineno: number, name: string, docs: string, returns: Type, access: "readonly" | "+write" | "+read");
    get type(): string;
    get isReadonly(): boolean;
    dump(_indent?: number): void;
    _updateAccess(access: "+read" | "+write" | "readonly"): void;
}
export declare class ObjectExport extends Export {
    readonly methods: Map<string, FunctionExport>;
    readonly properties: Map<string, PropertyExport>;
    readonly supers: Array<string>;
    readonly type: string;
    constructor(type: string, filename: string, lineno: number, name: string, docs: string, supers: Array<string>);
    evaluate(config: Config): Promise<void>;
    dump(_indent?: number): void;
    _addMethod(value: FunctionExport): void;
    _addProperty(value: PropertyExport, access: "+read" | "+write" | "readonly"): void;
}
export declare class ClassExport extends ObjectExport {
    #private;
    readonly staticMethods: Map<string, FunctionExport>;
    readonly isAbstract: boolean;
    get ctor(): null | FunctionExport;
    constructor(filename: string, lineno: number, name: string, docs: string, supers: Array<string>, isAbstract: boolean);
    evaluate(config: Config): Promise<void>;
    _setConstructor(value: FunctionExport): void;
    _addStaticMethod(value: FunctionExport): void;
    dump(_indent?: number): void;
}
export declare class InterfaceExport extends ObjectExport {
}
export declare class TypeExport extends ReturnsExport {
    get type(): string;
}
export declare class ConstExport extends ReturnsExport {
    get type(): string;
}
export declare class _ApiSection<T> {
    #private;
    objs: Array<T>;
    constructor(title?: string, flatworm?: string, anchor?: string);
    get anchor(): string;
    get flatworm(): string;
    get title(): string;
    _addObject(item: T): void;
    _setFlatworm(flatworm: string): void;
    _setTitle(title: string): void;
    _setAnchor(anchor: string): void;
}
export declare class ApiSubsection extends _ApiSection<Export> {
    _addExport(ex: Export): void;
}
export declare class ApiSection extends _ApiSection<ApiSubsection | Export> {
    #private;
    readonly dependencies: Array<string>;
    constructor(title?: string, flatworm?: string, anchor?: string);
    get navTitle(): string;
    _setNavTitle(nav: string): void;
    get path(): string;
    _setPath(path: string): void;
    _addSubsection(subsection: ApiSubsection | Export): void;
    _addDependency(dep: string): void;
}
export declare class API {
    readonly basePath: string;
    readonly objs: Array<Export>;
    readonly toc: Map<string, ApiSection>;
    getExport(name: string): Export;
    getSupers(name: string): Array<ObjectExport>;
    constructor(basePath: string);
    resolve(...args: Array<string>): string;
    evaluate(config: Config): Promise<void>;
    dump(): void;
}
export {};
