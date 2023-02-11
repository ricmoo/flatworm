import fs from "fs";
import { dirname, join, relative, resolve } from "path";

import { parse } from "@babel/parser";

import { parseMarkdown } from "./markdown.js";

import { Script } from "./script.js";

import type { Config } from "./config.js";

const DEBUG = false;

type Node = any;

const children: Record<string, Array<string>> = {
    File: [ "program", "errors", "comments" ],
    Program: [ "body", "directives" ],
    ExportNamedDeclaration: [ "declaration", "specifiers" ],
    ClassDeclaration: [ "body" ],
    ClassBody: [ "body" ],

    VariableDeclaration: [ "declarations" ],

    TSInterfaceDeclaration: [ "body" ],
    TSInterfaceBody: [ "body" ],
};

function getJsdoc(node: any): string {
    if (node == null) { return ""; }
    if (!node.leadingComments) { return ""; }
    node = node.leadingComments;

    const children = (Array.isArray(node) ? node: [ node ]);
    for (const child of children) {
        if (child.type === "CommentBlock" && child.value && child.value[0] === "*") {
            const lines: Array<string> = child.value.trim().split("\n");
            lines.shift();
            if (lines.length === 0) {
                return "";
            } else if (lines.length === 1) {
                let line = lines[0].trim();
                if (line[0] === "*") { line = line.substring(1).trim(); }
                return line;
            }

            const padding = indent(20);
            let offset = 0;
            let done = false;
            while (!done && offset < lines[0].length) {
                offset++;
                const prefix = lines[0].substring(0, offset);
                for (let l = 1; l < lines.length; l++) {
                    if (!(lines[l] + padding).startsWith(prefix)) {//substring(0, offset) !== prefix) {
                        offset--;
                        done = true;
                        break;
                    }
                }
            }

            return lines.map(l => l.substring(offset)).join("\n");
        }
    }
    return "";
}

const preserveJsdoc = "ExportNamedDeclaration VariableDeclaration".split(" ");
function getJsdocs(node: Node, ancestors: Array<Node>): string {
    let jsdoc = getJsdoc(node);
    if (jsdoc) { return jsdoc; }

    for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];
        if (preserveJsdoc.indexOf(ancestor.type) === -1) { break; }
        let jsdoc = getJsdoc(ancestor);
        if (jsdoc) { return jsdoc; }
    }
    return "";
}

function _getType(node: Node): Type {
    switch (node.type) {
        case "TSAnyKeyword":
            return new TypeBasic("any");
        case "TSBooleanKeyword":
            return new TypeBasic("boolean");
        case "TSBigIntKeyword":
            return new TypeBasic("bigint");
        case "TSConditionalType":
            return new TypeTodo("A1Bconditional(@TODO-000)");
        case "TSConstructorType":
            return new TypeTodo("A2Bconstructor(@TODO-001)");
        case "TSFunctionType": {
            const params = getParams(node.parameters);
            const returns = getType(node.typeAnnotation);
            return new TypeFunction(params, returns);
        }
        case "TSIndexedAccessType":
            return new TypeTodo(`A3B${ _getType(node.objectType) }[${ _getType(node.indexType) }]`);
        case "TSIntersectionType": {
            const children = (<Array<Node>>(node.types)).map(_getType);
            return new TypeGroup("&", children);
        }
        case "TSMappedType":
            return new TypeTodo("A4BRecord<@TODO-005: @TODO-006>");
        case "TSNamedTupleMember": {
            const name = getId(node.label);
            const optional = node.optional;
            const type = _getType(node.elementType);
            return new _Type("tuple-member", new Param(name, type, optional));
        }
        case "TSNeverKeyword":
            return new TypeBasic("never");
        case "TSNumberKeyword":
            return new TypeBasic("number");
        case "TSParenthesizedType": {
            return new TypeWrapped("PAREN", _getType(node.typeAnnotation));
        }
        case "TSRestType":
            return new TypeTodo(`A5BFOOBAR ...${ _getType(node.typeAnnotation) }`);
        case "TSStringKeyword":
            return new TypeBasic("string");
        case "TSTupleType": {
            const children = (<Array<Node>>(node.elementTypes)).map(_getType);
            return new TypeGroup("tuple", children);
        }
        case "TSTypeLiteral": {
            const children = node.members.reduce((accum: Record<string, Type>, m: any) => {
                if (m.type === "TSPropertySignature") {
                    const name = getId(m.key) + (m.optional ? "?": "");
                    accum[name] = getType(m.typeAnnotation);
                } else if (m.type === "TSMethodSignature") {
                    const name = getId(m.key) + (m.optional ? "?": "");
                    accum[name] = getType(m.typeAnnotation);
                } else if (m.type === "TSIndexSignature") {
                    if (m.parameters.length !== 1) {
                        throw new Error("hmm");
                    }
                    getId(m.parameters[0]);
                    const keys = getType(m.parameters[0].typeAnnotation);
                    const values = getType(m.typeAnnotation);
                    accum["[]"] = new TypeGroup("Record", [ keys, values ]);
                } else {
                    console.dir(node, { depth: null });
                    console.log(m);
                    throw new Error("CCc");
                }
                return accum;
            }, <Record<string, Type>>{ });
            return new TypeMapping(children);
        }
        case "TSTypeOperator":
            if (node.operator === "keyof") {
                return new TypeWrapped("keyof", _getType(node.typeAnnotation));
            }
            break;
        case "TSNullKeyword":
            return new TypeBasic("null");
        case "TSLiteralType":
            return new TypeLiteral(JSON.stringify(node.literal.value));
        case "TSTypePredicate":
            return new TypeBasic("boolean");
        case "TSTypeReference":
            if (node.typeName && node.typeName.type === "Identifier") {
                const name = node.typeName.name;
                if (node.typeParameters && node.typeParameters.type === "TSTypeParameterInstantiation") {
                    const children = node.typeParameters.params.map(_getType);
                    /*
                    if (children.length === 1) {
                        return new TypeWrapped(name, children[0]);
                    }
                    console.log(node);
                    console.log(children);
                    throw new Error("hmm...");
                    */
                    return new TypeGroup(name, children);
                }
                return new TypeIdentifier(name);
            }
            break;
        case "TSThisType":
            return new TypeBasic("this");
        case "TSUndefinedKeyword":
            return new TypeBasic("undefined");
        case "TSUnknownKeyword":
            return new TypeBasic("unknown");
        case "TSUnionType":
            return new TypeGroup("|", (<Array<Node>>(node.types)).map(n => _getType(n)));
        case "TSVoidKeyword":
            return new TypeBasic("void");
        case "TSTypeQuery":
            if (node.exprName) {
                return new TypeGroup("ReturnType", [ new TypeIdentifier(getId(node.exprName)) ]);
            }
    }

    console.dir(node, { depth: null });
    throw new Error("unknown TypeReference");
}

function getType(node: Node): Type {
    switch (node ? node.type: "xxx") {
        case "TSTypeAnnotation":
            if (_getType(node.typeAnnotation).type === "Array") {
                console.dir(node, { depth: null });
                throw new Error();
            }
            return _getType(node.typeAnnotation);
    }
    console.dir(node, { depth: null });
    throw new Error("unknown TypeAnnotation");
}

// Parses values from @returns in jsdocs, like "number | string"
// that override the type definition
function parseType(value: string): Type {
    const ast = parse(`function foo(): ${ value } { }`, {
        sourceFilename: "index.js",
        sourceType: "module",
        plugins: [ "typescript" ]
    });
    return getType((<any>ast).program.body[0].returnType);
}

function getParams(params: Array<Node>): Array<Param> {
    return params.map((param: Node) => {
        // Assignment: foo(bar = 12)
        if (param.type === "AssignmentPattern") {
            // @TODO: Remove this and make it an error
            param = param.left;
            throw new Error("do not use assignment; use null");

        } else if (param.type === "RestElement") {
            const name = param.argument.name.match(/^_*([^_]*)$/)[1];
            const type = getType(param.typeAnnotation);
            return { name, type, optional: false };
        }

        const name: string = param.name.match(/^_*([^_]*)$/)[1];
        const type = getType(param.typeAnnotation);
        const optional = !!param.optional;
        return new Param(name, type, optional);
    });
}

function getReturns(node: Node): Type {
    if (node.returnType == null) {
        console.dir(node, { depth: null });
        console.log(node.name, node.id, node.key);
        throw new Error("missing return type annotation");
    }
    return getType(node.returnType);
}


function getFunctionInfo(node: Node) {
    const name = node.id.name;
    const lineno = node.id.loc.start.line;
    const params = getParams(node.params);
    const returns = getReturns(node);

    const signature = [ name, "(", params.map(p => (`${ p.name }${ p.optional ? "?": "" }: ${ p.type }`)).join(", "), ") => ", returns ].join("");
    return { name, lineno, params, returns, signature };
}

function getInstanceName(name: string): string {
    let match = name.match(/^([A-Z]+)([A-Z][a-z].*)$/);
    if (!match) {
        return name[0].toLowerCase() + name.substring(1);
    }
    return match[1].toLowerCase() + match[2];
}

function getAncestorName(parentType: string, ancestors: Array<Node>): string {
    for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];
        if (ancestor.type === parentType) {
            const name = ancestor.id.name;
            if (name) { return name; }
        }
    }
    throw new Error(`missing ${ parentType } name`);
}

function getMethodInfo(parentType: string, node: Node, ancestors: Array<Node>) {
    const parentName = getAncestorName(parentType, ancestors);
    const name = node.key.name;
    const lineno = node.key.loc.start.line;
    const params = getParams(node.params || node.parameters);
    const isStatic = node.static;
    const isAbstract = node.abstract;
    let returns;
    if (parentType === "ClassDeclaration") {
        returns = ((name === "constructor") ? "new": getReturns(node));
    } else if (parentType === "TSInterfaceDeclaration") {
        returns = getType(node.typeAnnotation);
    } else {
        throw new Error("unsupported method type");
    }

    return { isAbstract, isStatic, lineno, parentName, name, params, returns };
}

function getPropertyInfo(parentType: string, node: Node, ancestors: Array<Node>) {
    const parentName = getAncestorName(parentType, ancestors);
    const name = node.key.name;
    const lineno = node.key.loc.start.line;
    const access = node.readonly ? "readonly": "+write";
    const returns = getType(node.typeAnnotation);
    const signature = [ getInstanceName(parentName), ".", name, " => ", returns ].join("");
    return { parentName, name, lineno, access, returns, signature };
}

export type VisitFunc = (type: string, node: Node, ancestors: Array<Node>, depth: number) => void;

function _visit(node: Node, depth: number, ancestors: Array<Node>, visitor: VisitFunc): void {
    if (node == null) { return; }

    if (Array.isArray(node)) {
        for (const child of node) {
            _visit(child, depth, ancestors, visitor);
        }
        return;
    }

    if (!node.type) { return; }

    visitor(node.type, node, ancestors, depth);

    ancestors.unshift(node);
    for (const key of (children[node.type] || [ ])) {
        _visit(node[key], depth + 1, ancestors, visitor);
    }
    ancestors.shift();
}

function visit(filename: string, code: string, visitor: VisitFunc): void {
    const ast = parse(code, {
        sourceFilename: filename,
        sourceType: "module",
        plugins: [ "typescript" ]
    });
    if (DEBUG) {
        console.dir(ast, { depth: null });
    }
    _visit(ast, 0, [ ], visitor);
}

export function indent(size: number): string {
    size *= 2;
    let result = "        ";
    while (result.length < size) { result += result; }
    return result.substring(0, size);
}

function getId(node: Node): string {
    if (node == null || node.type !== "Identifier") { throw new Error("not an identifier"); }
    return node.name;
}

export function getExports(path: string): Record<string, Set<string>> {

    const result: Record<string, Set<string>> = { };
    //const doneMissing: Set<string> = new Set();

    const process = (path: string) => {
        // Already processed this file
        if (path in result) { return; }

        result[path] = new Set();

        const code = fs.readFileSync(path).toString();
        visit(path, code, (type, node, ancestors, depth) => {

            if (type === "ExportAllDeclaration") {
                // export * from "blah"
                const filename = node.source.value.replace(/\.js$/, ".ts");
                const subpath = join(dirname(path), filename);
                process(subpath);

                for (const ex of result[subpath]) {
                    result[path].add(ex);
                }

            } else if (type === "ImportDeclaration") {
                // Recurse into the imported source
                if (node.source) {
                    const filename = node.source.value.replace(/\.js$/, ".ts");
                    if (filename.match(/^(\.|\/)/)) {
                        const subpath = join(dirname(path), filename);
                        process(subpath);
                    }
                }

            } else if (type === "ExportNamedDeclaration") {

                //const isType = ((node.exportKind === "type") ? "type:": "");
                const isType = "";

                // export { foo, bar } from "blah"
                // export { foo, bar }
                for (const child of node.specifiers) {
                     if (child.type === "ExportSpecifier") {
                         result[path].add(isType + getId(child.exported));
                     } else {
                         throw new Error("unknown child type");
                     }
                }

                // export function bar() { }
                if (node.declaration) {
                    if (node.declaration.declarations) {
                        for (const child of node.declaration.declarations) {
                            result[path].add(getId(child.id));
                        }
                    } else {
                        result[path].add(getId(node.declaration.id));
                    }
                }

                // Recurse into the imported source
                if (node.source) {
                    const filename = node.source.value.replace(/\.js$/, ".ts");
                    if (filename.match(/^(\.|\/)/)) {
                        const subpath = join(dirname(path), filename);
                        process(subpath);
                    }
                }

                    //if (!doneMissing.has(path + "%" + subpath)) {
                    //    doneMissing.add(path + "%" + subpath);
/*
                        const missing = new Set();
                        let found = false;
                        for (const child of result[subpath]) {
                            if (!result[path].has(child)) {
                                missing.add(child);
                                found = true;
                            }
                        }

                        if (found) {
                            console.log("Missing", { path, subpath, missing: Array.from(missing).join(" ") });
                        }
                    //}
*/
            }

        });
    };

    process(path);

    return result;
}
/*
console.log(getExports("/Users/dev/Development/ethers/ethers-v6/src.ts/crypto/index.ts"));
if (1) { process.exit(); }
*/

export function getObjects(path: string, exports: Set<string>): Array<any> {
    const skip = "start end loc source __clone".split(" ");

    const code = fs.readFileSync(path).toString();

    const result: Array<any> = [ ];

    let ignoreFile = false;

    visit(path, code, (type, node, ancestors, depth) => {
        if (ignoreFile) { return; }

        for (const key in node) {
            if (skip.indexOf(key) >= 0) { continue; }
        }

        if (type === "File") {
            const jsdoc = getJsdoc({ leadingComments: (node.comments || []).slice(0, 1) });
            if (jsdoc.match(/(@_ignore|@private)/)) {
                ignoreFile = true;
                return;;
            }

            result.push({
                type: "file",
                path,
                jsdoc
            });

        } else if (type === "FunctionDeclaration") {
            const name = node.id.name;
            if (!exports.has(name)) { return; }

            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }

            result.push(Object.assign(getFunctionInfo(node), {
                type: "function", jsdoc
            }));

        } else if (type === "TSInterfaceDeclaration") {
            const name = node.id.name;
            if (!exports.has(name)) { return null; }

            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }

            const lineno =node.id.loc.start.line;

            // @TODO supers
            const supers: Array<string> = [ ];

            if (node.extends) {
                for (const ext of node.extends) {
                    if (ext.type === "TSExpressionWithTypeArguments" && ext.expression.type === "Identifier") {
                        supers.push(getId(ext.expression));

                    } else {
                        console.log("III", name);
                        console.dir(node, { depth: null });
                        throw new Error("check...");
                    }
                }
            }

            result.push({ type: "interface", name, lineno, supers, jsdoc });

        } else if (type === "ClassDeclaration") {
            const name = node.id.name;
            if (!exports.has(name)) { return; }

            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }

            const lineno = node.id.loc.start.line;

            const supers: Array<string> = [ ];
            if (node.superClass) {
                if (node.superClass.type === "CallExpression") {
                    supers.push(getId(node.superClass.callee));
                } else {
                    supers.push(getId(node.superClass));
                }
            }

            for (const parent of (node.implements || [ ])) {
                if (parent.type === "TSExpressionWithTypeArguments") {
                    let name = getId(parent.expression);
                    if (parent.typeParameters && parent.typeParameters.type === "TSTypeParameterInstantiation") {
                        name = `${ name }<${ parent.typeParameters.params.map((c: any) => _getType(c)) }>`;
                    }
                    supers.push(name);
                    continue;
                }
                console.log(node, parent);
                throw new Error();
            }

            result.push({
                type: "class", name, lineno, jsdoc, supers,
                isAbstract: node.abstract,
            });

        } else if (type === "ClassMethod" || type === "TSDeclareMethod") {
            const name = node.key.name;
            //if (!exports.has(name)) { return; }

            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }
            const lineno = node.key.loc.start.line;

            if (node.kind === "set") {
                result.push({
                    type: "property", name, lineno, jsdoc,
                    parentName: getAncestorName("ClassDeclaration", ancestors),
                    access: "+write",
                });
            } else {
                const info = getMethodInfo("ClassDeclaration", node, ancestors);
                if (node.kind === "get") {
                    result.push({
                        type: "property",
                        name: info.name,
                        parentName: info.parentName,
                        access: "+read",
                        returns: info.returns,
                        signaure: `${ getInstanceName(info.parentName) }.${ info.name } => ${ info.returns }`,
                        jsdoc
                    });
                } else {
                    result.push(Object.assign(info, { type: "method", jsdoc }));
                }
            }

        } else if (type === "TSMethodSignature") {
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }

            const info = getMethodInfo("TSInterfaceDeclaration", node, ancestors);
            result.push(Object.assign(info, {
                type: "method", jsdoc
            }));

        } else if (type === "ClassProperty") {
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }
            result.push(Object.assign(getPropertyInfo("ClassDeclaration", node, ancestors), {
                type: "property", jsdoc
            }));

        } else if (type === "TSPropertySignature") {
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }
            result.push(Object.assign(getPropertyInfo("TSInterfaceDeclaration", node, ancestors), {
                type: "property", jsdoc
            }));

        } else if (type === "TSTypeAliasDeclaration") {
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }
            const name = node.id.name;
            const returns = _getType(node.typeAnnotation);
            const lineno = node.id.loc.start.line;
            result.push({
                type: "type", jsdoc, name, lineno, returns
            });

        } else if (type === "VariableDeclarator") {
            const name = node.id.name;
            if (!exports.has(name)) { return; }

            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) { return; }
            const returns = getType(node.id.typeAnnotation);
            const lineno = node.id.loc.start.line;

            result.push({
                type: "const", jsdoc, name, lineno, returns
            });

        } else {
            //console.dir(node, { depth: null });
            //console.log("MOO:", node.type);
        }
    });

    return result;
}


export class Param {
    readonly name: string;
    readonly type: Type;
    readonly optional: boolean;

    constructor(name: string, type: Type, optional: boolean) {
        this.name = name;
        this.type = type;
        this.optional = optional;
    }

    toString(): string {
        return `${ this.name }${ this.optional ? "?": "" }: ${ this.type }`;
    }
}

// @TODO
export class Type {
    type: string;

    constructor(type: string) {
        this.type = type;
    }

    dump(_indent: number = 0): void {
        console.log(`${ indent(_indent) }- ${ this.constructor.name }: ${ this.type }`);
    }
}

// Types to fill in later...
export class TypeTodo extends Type {
    constructor(type: string) {
        super(`TODO(${ type })`);
    }
}

export class TypeBasic extends Type { }
export class TypeLiteral extends Type { }
export class TypeIdentifier extends Type { }

/*
export class TypeRecord extends Type {
    readonly keys: Type;
    readonly values: Type;

    constructor(keys: Type, values: Type) {
        super(`Record<${ keys.type }, ${ values.type }>`);
        this.keys = keys;
        this.values = values;
    }
}
*/

// Used for internal visiting?
class _Type extends Type {
    readonly value: any;
    constructor(type: string, value: any) {
        super(type);
        this.value = value;
    }
}

export class TypeMapping extends Type {
    readonly children: Record<string, Type>;

    constructor(children: Record<string, Type>) {
        const joined = Object.keys(children).map((k) => `${ k }: ${ children[k].type }`).join(", ");
        super(`{ ${ joined } }`);
        this.children = children;
    }
}

// e.g. number | string
export class TypeGroup extends Type {
    readonly relation: string;
    readonly types: Array<Type>;

    constructor(relation: string, types: Array<Type>) {
        super(`${ relation }(${ types.map((t) => t.type).join(", ") })`);
        this.relation = relation;
        this.types = types;
    }

    dump(_indent: number = 0): void {
        console.log(`${ indent(_indent) }- GROUP:${ this.relation }`);
        for (const type of this.types) {
            type.dump(_indent + 1);
        }
    }
}

// e.g. Promise<Foo>
export class TypeWrapped extends Type {
    readonly wrapper: string;
    readonly child: Type;

    constructor(wrapper: string, child: Type) {
        super(`${ wrapper }<${ child.type }>`);
        this.wrapper = wrapper;
        this.child = child;
    }

    dump(_indent: number = 0): void {
        console.log(`${ indent(_indent) }- WRAPPED<${ this.wrapper }>`);
        this.child.dump(_indent + 1);
    }
}

export class TypeFunction extends Type {
    readonly params: Array<Param>;
    readonly returns: Type;

    constructor(params: Array<Param>, returns: Type) {
        super("(@TODO: params) => return type");
        this.params = params;
        this.returns = returns;
    }
}

function splitDocs(docs: string): { flatworm: string, docTags: Record<string, Array<string>> } {
    const flatworm: Array<string> = [ ];
    const docTags: Record<string, Array<Array<string>>> = { };

    let foundTag = false;
    let lastTag: Array<any> = [ ];
    for (const line of docs.split("\n")) {
        const match = line.trim().match(/^\s*@([^ ]+)(.*)$/);
        if (match) {
            foundTag = true;
            let tag = match[1], content = match[2].trim();
            if (tag.endsWith(":")) { tag = tag.substring(0, tag.length - 1); }
            lastTag = [ content ];
            if (!(tag in docTags)) {
                docTags[tag] = [ lastTag ];
            } else {
                docTags[tag].push(lastTag);
            }
        } else if (foundTag) {
            lastTag.push(line);
        } else {
            flatworm.push(line);
        }
    }

    return {
        flatworm: flatworm.join("\n").trim(),
        docTags: Object.keys(docTags).reduce((accum, tag) => {
            const docTag = docTags[tag];
            accum[tag] = docTag.map((l) => l.join("\n"));
            return accum;
        }, <Record<string, Array<string>>>{})
    }
}

export type ExportType = "abstract class" | "class" | "const" |
    "constructor" | "create" | "function" | "interface" |
    "method" | "property" | "static method" | "type";

const sortPropOrder: Record<ExportType, number> = {
    "const": 1,

    "interface": 2,
    "type": 2,

    "function": 3,

    "property": 4,

    "constructor": 5,
    "create": 6,

    "method": 7,

    "static method": 8,

    "abstract class": 9,
    "class": 10
};

function sortProps(a: ApiSubsection | Export, b: ApiSubsection | Export) {
    const isSubA = (a instanceof ApiSubsection);
    const isSubB = (b instanceof ApiSubsection);

    if (isSubA && !isSubB) { return 1; }
    if (!isSubA && isSubB) { return -1; }

    const nameA = (isSubA) ? a.title: a.name;
    const nameB = (isSubB) ? b.title: b.name;

    if (isSubA || isSubB) { return nameA.localeCompare(nameB); }

    const pa = sortPropOrder[a.type], pb = sortPropOrder[b.type];
    const cmp = pa - pb;
    if (cmp !== 0) { return cmp; }
    return nameA.localeCompare(nameB);
}

export abstract class Export {
    readonly filename: string;
    readonly lineno: number;
    readonly name: string;

    #examples: null | Array<Script>;
    #docs: string;

    constructor(filename: string, lineno: number, name: string, docs: string) {
        this.filename = filename;
        this.lineno = lineno;
        this.name = name;
        this.#docs = docs;
        this.#examples = null;
    }

    abstract get type(): ExportType;

    get title(): string { return this.name; }

    get dependencies(): Array<string> { return [ this.filename ]; }

    get id(): string { return this.name; }

    get docs(): string { return this.#docs; }

    get flatworm(): string {
        return splitDocs(this.#docs).flatworm;
    }

    get docTags(): Record<string, Array<string>> {
        return splitDocs(this.#docs).docTags;;
    }

    getTag(key: string): Array<string> {
        const values = this.docTags[key];
        if (values == null) { return [ ]; }
        return values;
    }

    async evaluate(config: Config): Promise<void> {
        for (const example of this.examples()) {
            await example.evaluate(config);
        }
    }

    examples(): Array<Script> {
        if (this.#examples == null) {
            const examples = [ ];
            for (const example of this.getTag("example")) {
                examples.push(new Script(example, "javascript"));
            }
            this.#examples = examples;
        }

        return this.#examples;
    }

    _updateDocs(docs: string): void {
        if (this.#docs && docs) { throw new Error(`cannot update docs from ${ JSON.stringify(this.#docs) } => ${ JSON.stringify(docs) }`); }
        if (docs) { this.#docs = docs; }
    }

    dump(_indent: number = 0): void {
        console.log(`${ indent(_indent) }- ${ this.constructor.name } ${ this.name }`);
        console.log(`${ indent(_indent) }  - file: ${ this.filename }:${ this.lineno }`);
        const { flatworm, docTags } = splitDocs(this.#docs);
        if (flatworm) {
            console.log(`${ indent(_indent) }  - docs: ${ JSON.stringify(flatworm) }`);
            console.log(`${ indent(_indent) }  - markdown: ${ parseMarkdown(flatworm) }`);
        }
        for (const tag of Object.keys(docTags)) {
            console.log(`${ indent(_indent) }  - docTag-${ tag }: ${ JSON.stringify(docTags[tag]) }`);
        }
    }
}

export abstract class ReturnsExport extends Export {
    readonly #returns: Type;

    #parent: null | ObjectExport;
    get parent(): null | ObjectExport { return this.#parent; }

    constructor(filename: string, lineno: number, name: string, docs: string, returns: Type) {
        super(filename, lineno, name, docs);
        this.#returns = returns;
    }

    _setParent(parent: ObjectExport): void {
        if (this.#parent) { throw new Error("already has parent"); }
        this.#parent = parent;
    }

    get id(): string {
        if (this.#parent) {
            return `${ this.#parent.name }-${ this.name }`;
        }
        return super.id;
    }

    get prefix(): string {
        if (this.#parent == null) { return ""; }
        return getInstanceName(this.#parent.name);
    }

    get returns(): Type {
        const docTags = this.docTags;
        const returns = docTags["returns"] || docTags["return"];
        if (returns != null) {
            if (returns.length !== 1) {
                console.log("@TODO:", returns);
                throw new Error("wrong returns");
            }
            return parseType(returns[0].trim());
        }
        return this.#returns;
    }

    dump(_indent: number = 0): void {
        super.dump(_indent);
        console.log(`${ indent(_indent) }  - returns`);
        this.returns.dump(_indent + 2);
    }
}


export class FunctionExport extends ReturnsExport {
    readonly params: Array<Param>;
    readonly isStatic: boolean;
    readonly isAbstract: boolean;

    constructor(filename: string, lineno: number, name: string, docs: string, returns: Type, params: Array<Param>, isStatic: boolean, isAbstract: boolean) {
        super(filename, lineno, name, docs, returns);
        this.params = params;
        this.isStatic = isStatic;
        this.isAbstract = isAbstract;
    }

    get id(): string {
        const parent = this.parent;
        if (parent) {
            if (this.name === "constructor") {
                return `${ parent.name }_new`;
            } else if (this.isStatic) {
                return `${ parent.name }_${ this.name }`;
            }
        }
        return super.id;
    }

    get type(): ExportType {
        const parent = this.parent;
        if (parent) {
            if (this.name === "constructor") {
                return "constructor";
            } else if (this.isStatic) {
                const returns = this.returns.type;
                if (returns === parent.name || returns === `Promise<${ parent.name }>`) {
                    return "create";
                }
                return "static method";
            }
            return "method";
        }
        return "function";
    }

    get prefix(): string {
        if (this.parent && this.isStatic) { return this.parent.name; }
        return super.prefix;
    }

    dump(_indent: number = 0): void {
        super.dump(_indent);
        if (this.isStatic) {
            console.log(`${ indent(_indent) }  - is static`);
        }
        if (this.isAbstract) {
            console.log(`${ indent(_indent) }  - is abstract`);
        }
        console.log(`${ indent(_indent) }  - params:`);
        for (const param of this.params) {
            console.log(`${ indent(_indent + 1) }  - ${ param.name }${ param.optional ? "?": ""}:`);
            param.type.dump(_indent + 2);
        }
    }
}

export class PropertyExport extends ReturnsExport {
    _access: string;

    constructor(filename: string, lineno: number, name: string, docs: string, returns: Type, access: "readonly" | "+write" | "+read") {
        super(filename, lineno, name, docs, returns);
        this._access = "+read";
        this._updateAccess(access);
    }

    get type(): ExportType { return "property"; }

    get isReadonly(): boolean {
        return (this._access !== "+write");
    }

    dump(_indent: number = 0): void {
        super.dump(_indent);
        console.log(`${ indent(_indent) }  - isReadonly: ${ this.isReadonly }`)
    }

    _updateAccess(access: "+read" | "+write" | "readonly"): void {
        switch (access) {
            case "+read":
                return;
            case "+write":
                if (this._access === "readonly") {
                    console.log(this);
                    throw new Error("cannot upgrade readonly to +write");
                }
                break;
            case "readonly":
                if (this._access === "+write") {
                    console.log(this);
                    throw new Error("cannot downgrade +write to readonly");
                }
                break;
            default:
                throw new Error(`invalid access: ${ access }`);
        }
        this._access = access;
    }
}

export abstract class ObjectExport extends Export implements Iterable<Export> {
    readonly methods: Map<string, FunctionExport>;
    readonly properties: Map<string, PropertyExport>;

    // The Super classes.
    readonly supers: Array<ObjectExport>;

    constructor(filename: string, lineno: number, name: string, docs: string) {
        super(filename, lineno, name, docs);
        this.supers = [ ];
        this.methods = new Map();
        this.properties = new Map();
    }

    get children(): Array<Export> {
        let children: Array<Export> = Array.from(this.properties.values());
        children = children.concat(Array.from(this.methods.values()));
        children.sort(sortProps);
        return children;
    }

    get length(): number {
        return this.children.length;
    }

    [Symbol.iterator](): Iterator<Export> {
        const children = this.children;
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: children[index++], done: false }
                }
                return { value: undefined, done: true };
            }
        };
    }
    async evaluate(config: Config): Promise<void> {
        await super.evaluate(config);

        for (const [ , obj ] of this.methods) { await obj.evaluate(config); }
        for (const [ , obj ] of this.methods) { await obj.evaluate(config); }
    }

    get allSupers(): Array<ObjectExport> {
        const result: Set<ObjectExport> = new Set();
        for (const s of this.supers) {
            result.add(s);
            for (const ss of s.supers) {
                result.add(ss);
            }
        }
        return Array.from(result);
    }

    dump(_indent: number = 0): void {
        super.dump(_indent);
        if (this.supers.length) {
            console.log(`${ indent(_indent) }  - inherits: ${ this.supers.join(", ") }`);
        }
        if (Array.from(this.properties).length) {
            console.log(`${ indent(_indent) }  Properties`);
            for (const [ , value ] of this.properties) {
                value.dump(_indent + 2);
            }
        }
        if (Array.from(this.methods).length) {
            console.log(`${ indent(_indent) }  Methods`);
            for (const [ , value ] of this.methods) {
                value.dump(_indent + 2);
            }
        }
    }

    _addMethod(value: FunctionExport): void {
        if (this.methods.has(value.name)) {
            throw new Error(`method ${ value.name } already defined`);
        }
        this.methods.set(value.name, value);
        value._setParent(this);
    }

    _addProperty(value: PropertyExport, access: "+read" | "+write" | "readonly"): void {
        const existing = this.properties.get(value.name);
        if (existing) {
            existing._updateDocs(value.docs);
            existing._updateAccess(access);
        } else {
            this.properties.set(value.name, value);
        }
        value._setParent(this);
    }

    _addSuper(value: ObjectExport): boolean {
        if (this.supers.indexOf(value) === -1) {
            this.supers.push(value);
            return true;
        }
        return false;
    }
}

export class ClassExport extends ObjectExport {
    readonly staticMethods: Map<string, FunctionExport>;
    readonly isAbstract: boolean;

    #ctor: null | FunctionExport;
    get ctor(): null | FunctionExport { return this.#ctor; }

    constructor(filename: string, lineno: number, name: string, docs: string, isAbstract: boolean) {
        super(filename, lineno, name, docs);
        this.isAbstract = isAbstract;
        this.staticMethods = new Map();
        this.#ctor = null;
    }

    get type(): ExportType {
        return this.isAbstract ? "abstract class": "class";
    }

    get children(): Array<Export> {
        let children = super.children;
        children = children.concat(Array.from(this.staticMethods.values()));
        if (this.ctor) { children.push(this.ctor); }
        children.sort(sortProps);
        return children;
    }

    async evaluate(config: Config): Promise<void> {
        await super.evaluate(config);

        for (const [ , obj ] of this.staticMethods) { await obj.evaluate(config); }
    }

    _setConstructor(value: FunctionExport): void {
        if (this.#ctor) { throw new Error(`constructor already defined`); }
        this.#ctor = value;
        value._setParent(this);
    }

    _addStaticMethod(value: FunctionExport): void {
        if (this.staticMethods.has(value.name)) { throw new Error(`static method ${ value.name } already defined`); }
        this.staticMethods.set(value.name, value);
        value._setParent(this);
    }

    dump(_indent: number = 0): void {
        super.dump(_indent);
        if (Array.from(this.staticMethods).length) {
            console.log(`${ indent(_indent) }  Static Methods`);
            for (const [ , value ] of this.staticMethods) {
                value.dump(_indent + 2);
            }
        }
    }
}

export class InterfaceExport extends ObjectExport {
    constructor(filename: string, lineno: number, name: string, docs: string) {
        super(filename, lineno, name, docs);
    }

    get type(): ExportType { return "interface"; }
}

export class TypeExport extends ReturnsExport {
    get type(): ExportType { return "type"; }
}

export class ConstExport extends ReturnsExport {
    get type(): ExportType { return "const"; }
}

function splitDocloc(docloc: string): { path: string, title: string, anchor: null | string } {
    const match = docloc.trim().match(/([^:]*)(:([^\[\]]*))?(\[(.*)\])?/);
    if (match == null) {
        throw new Error(`could not split docloc: ${ docloc }`);
    }
    return { path: match[1].trim(), title: (match[3] || "").trim(), anchor: (match[5] || null) };
}

/*
export type SubsectionInfo = {
    title: string;
    flatworm: string;
    objs: Array<Export>;
    anchor: string | null;
};

export type SectionInfo = {
    title: string;
    dependencies: Array<string>;
    flatworm: string;
    objs: Array<SubsectionInfo | Export>;
    anchor: string | null;
}
*/

export class _ApiSection<T extends ApiSubsection | Export> {
    #anchor: null | string;
    #flatworm: string;
    #title: string;

    // @todo: rename to subsections
    #objs: Array<T>;

    #examples: Array<string>;

    constructor(title?: string, flatworm?: string, anchor?: string) {
        this.#title = title;
        this.#flatworm = flatworm || "";
        this.#anchor = anchor || null;
        this.#objs = [ ];
        this.#examples = [ ];
    }

    get objs(): Array<T> {
        this.#objs.sort(sortProps);  // @TODO: cache this? lazy?
        return this.#objs;
    }

    get examples(): Array<string> {
        return this.#examples;
    }

    get anchor(): string { return this.#anchor; }
    get flatworm(): string { return this.#flatworm; }
    get title(): string { return this.#title; }

    // @TODO: should these throw if already set?
    _addObject(item: T): void { this.#objs.push(item); }
    _addExample(ex: string): void { this.#examples.push(ex); }
    _setFlatworm(flatworm: string): void { this.#flatworm = flatworm; }
    _setTitle(title: string): void { this.#title = title; }
    _setAnchor(anchor: string): void { this.#anchor = anchor; }
}

export class ApiSubsection extends _ApiSection<Export>{
    _addExport(ex: Export): void { super._addObject(ex); }
}

export class ApiSection extends _ApiSection<ApiSubsection | Export> {
    readonly dependencies: Array<string>;

    #path: null | string;
    #navTitle: null | string;

    constructor(title?: string, flatworm?: string, anchor?: string) {
        super(title, flatworm, anchor);
        this.dependencies = [ ];
        this.#path = ""
        this.#navTitle = null;
    }

    get subsections(): Array<Export | ApiSubsection> {
        return this.objs;
    }

    get navTitle(): string {
        if (this.#navTitle) { return this.#navTitle; }
        return this.title;
    }

    _setNavTitle(nav: string): void {
        this.#navTitle = nav;
    }

    get path(): string {
        if (this.#path == null) {
            throw new Error(`no path set for ${ this.anchor }`);
        }
        return this.#path;
    }

    _setPath(path: string): void { this.#path = path; }

    _addSubsection(subsection: ApiSubsection | Export): void {
        super._addObject(subsection);
    }

    _addDependency(dep: string): void {
        if (this.dependencies.indexOf(dep) >= 0) { return; }
        this.dependencies.push(dep);
    }
}

export class ApiDocument {
    readonly basePath: string;
    readonly objs: Array<Export>;

    readonly toc: Map<string, ApiSection>;

    get sections(): Array<ApiSection> {
        return Array.from(this.toc.values());
    }

    getExport(name: string): Export {
        const matches = this.objs.filter((e) => (e.name === name));
        if (matches.length !== 1) {
            throw new Error(`No export found: ${ name }`);
        }
        return matches[0];
    }

    constructor(basePath: string) {
        this.basePath = basePath;
        this.objs = [ ];

        const allExports = getExports(this.basePath)

        // Map each ObjectExport to a list of supers, to be
        // filled in all Exports are available.
        const superMap: Map<ObjectExport, Array<string>> = new Map();

        const fileMap: Map<string, { jsdocs: string, exports: Set<string>, imports: Set<string> }> = new Map();
        const filenames: Array<string> = [ ];

        // Load all jsdocs for each export
        for (const _filename in allExports) {
            const filename = relative(dirname(basePath), _filename);
            const exports = allExports[_filename];

            if (exports == null) {
                console.log("Skipping File; no exports:", filename);
                continue;
            }

            filenames.unshift(filename);
            fileMap.set(filename, {
                exports,
                imports: new Set(),
                jsdocs: ""
            });

            const objs: Array<Export> = [ ];
            for (const obj of getObjects(_filename, exports)) {
                const checkSkip = (key: string) => {
                    if (key == null) { return true; }
                    if (!exports.has(key)) {
                        //console.log("Skipping Obj; not exported:", key);
                        return true;
                    }
                    return false;
                };

                const getObject = (name: string): null | ObjectExport => {
                    const obj = objs.filter((o) => (o instanceof ObjectExport && o.name === name));
                    if (obj.length === 0) { return null; }
                    if (obj.length > 1) {
                        console.log("Too many objects", name, objs);
                        throw new Error();
                    }
                    return <ObjectExport>(obj[0]);
                };

                const getClass = (name: string): null | ClassExport => {
                    const cls = getObject(name);
                    if (cls == null) { return null; }
                    if (!(cls instanceof ClassExport)) {
                        console.log("Not a class", name, objs);
                        throw new Error();
                    }
                    return cls;
                };

                switch (obj.type) {
                    case "file": {
                        fileMap.get(filename).jsdocs = (obj.jsdoc || "");
                        break;
                    }
                    case "function": {
                        if (checkSkip(obj.name)) { break; }
                        const ex = new FunctionExport(
                            filename, obj.lineno, obj.name, obj.jsdoc, obj.returns,
                            obj.params.map((p: any) => new Param(p.name, p.type, p.optional)),
                            false, false
                        );
                        objs.push(ex);
                        //files.get(filename).exports.push(ex);
                        break;
                    }
                    case "class": {
                        if (checkSkip(obj.name)) { break; }
                        const ex = new ClassExport(filename, obj.lineno, obj.name, obj.jsdoc, obj.isAbstract)
                        superMap.set(ex, obj.supers || [ ]);
                        objs.push(ex);
                        //files.get(filename).exports.push(ex);
                        break;
                    }
                    case "interface": {
                        if (checkSkip(obj.name)) { break; }
                        const ex = new InterfaceExport(filename, obj.lineno, obj.name, obj.jsdoc)
                        superMap.set(ex, obj.supers || [ ]);
                        objs.push(ex);
                        break;
                    }
                    case "property": {
                        if (checkSkip(obj.parentName) || obj.name == null) { break; }
                        const parent = getObject(obj.parentName);
                        if (parent) {
                            parent._addProperty(new PropertyExport(
                                filename, obj.lineno, obj.name,
                                obj.jsdoc, obj.returns, obj.access
                            ), obj.access);
                        }
                        break;
                    }
                    case "method": {
                        if (checkSkip(obj.parentName) || obj.name == null) { break; }
                        const method = new FunctionExport(
                            filename, obj.lineno, obj.name, obj.jsdoc, obj.returns,
                            obj.params.map((p: any) => new Param(p.name, p.type, p.optional)),
                            (obj.isStatic || obj.name === "constructor"), !!obj.isAbstract
                        );

                        if (obj.name === "constructor") {
                            const parent = getClass(obj.parentName);
                            if (parent) { parent._setConstructor(method); }
                        } else if (obj.isStatic) {
                            const parent = getClass(obj.parentName);
                            if (parent) { parent._addStaticMethod(method); }
                        } else {
                            const parent = getObject(obj.parentName);
                            if (parent) { parent._addMethod(method); }
                        }
                        break;
                    }
                    case "type": {
                        if (checkSkip(obj.name)) { break; }
                        const ex = new TypeExport(
                            filename, obj.lineno, obj.name, obj.jsdoc, obj.returns
                        );
                        objs.push(ex);
                        break;
                    }
                    case "const": {
                        if (checkSkip(obj.name)) { break; }
                        const ex = new ConstExport(
                            filename, obj.lineno, obj.name, obj.jsdoc, obj.returns
                        );
                        objs.push(ex);
                        break;
                    }
                    default:
                        console.log(obj);
                        throw new Error("unknown type");
                }
            }

            for (const obj of objs) { this.objs.push(obj); }
        }

        // Add supers
        for (const [ ex, supers ] of superMap) {
            for (let s of supers) {
                let e: Export;
                try {
                    e = this.getExport(s);
                } catch (error) {
                    console.log(`WARNING: missing super for ${ ex.name } (${ s })`);
                    continue;
                }
                if (!(e instanceof ObjectExport)) {
                    console.log(`WARNING: invalid super type for ${ ex.name } (${ s })`)
                    continue;
                }
                ex._addSuper(e);
            }
        }

        // Do I still need this?
        for (const { exports, imports } of fileMap.values()) {
            for (const ex of exports) {
                try {
                    imports.add(this.getExport(ex).filename);
                } catch (error) {
                    //console.log("EE", ex, error.message);
                }
            }
        }

        const missing: Map<string, Set<string>> = new Map();
        const root = fileMap.get("index.ts").exports;
        for (const [ filename, { exports } ] of fileMap) {
            const match = filename.match(/^([a-z0-9_]+)\/index.ts$/i);
            if (!match) { continue; }

            for (const ex of exports) {
                if (root.has(ex)) { continue; }
                if (!missing.has(filename)) {
                    missing.set(filename, new Set());
                }
                missing.get(filename).add(ex);
            }
        }

        if (Array.from(missing).length) {
            const filenames = Array.from(missing.keys());
            filenames.sort();
            console.log("WARNING: missing root exports");
            for (const filename of filenames) {
                const exports = missing.get(filename);

                const types: Array<string> = [ ];
                const exs: Array<string> = [ ];

                for (const name of exports) {
                    const ex = this.getExport(name);
                    if (ex == null) { throw new Error(`bad thing: ${ name }`); }
                    if (ex instanceof InterfaceExport || ex instanceof TypeExport) {
                        types.push(name);
                    } else {
                        exs.push(name);
                    }
                }

                for (const { kind, objs } of [ { kind: "", objs: exs.sort() }, { kind: "type ", objs: types.sort() } ]) {
                    if (objs.length === 0) { continue; }
                    console.log(`export ${ kind }{`);
                    console.log(`    ${ objs.join(", ") }`);
                    console.log(`} from "${ filename }"`); 
                }
            }
        }

        const toc: Map<string, ApiSection> = new Map();
        const remaining: Map<string, Export> = new Map();

        const specific: Array<{ docloc: string, obj: Export }> = [ ];

        // Pull out any objects which have an explicit docloc
        this.objs.forEach((obj) => {
            const docTags = obj.docTags;
            if ("_docloc" in docTags) {
                specific.push({ docloc: docTags["_docloc"][0], obj });
            } else {
                remaining.set(obj.name, obj);
            }
        });

        // Add all the subsections first; this prevents the section
        // from gobbling up all the exports
        for (const filename of filenames) {
            const { exports, jsdocs } = fileMap.get(filename);
            const { flatworm, docTags } = splitDocs(jsdocs);
            if (!("_subsection" in docTags)) { continue; }

            const { anchor, path, title } = splitDocloc(docTags["_subsection"][0]);

            let subsection: ApiSubsection;

            let section = toc.get(path)

            if (!section) {
                subsection = new ApiSubsection(title, flatworm, anchor);

                section = new ApiSection("", flatworm, null);
                section._addSubsection(subsection);

                section._addDependency(this.resolve(filename));

                toc.set(path, section);
                section._setPath(path);

            } else {
                section._addDependency(this.resolve(filename));

                for (const obj of section.objs) {
                    if (obj instanceof Export) { continue; }
                    if (obj.anchor === anchor) {
                        subsection = obj;
                        break;
                    }
                }

                if (subsection) {
                    if (subsection.flatworm.trim() === "") {
                        subsection._setFlatworm(flatworm);
                    } else if (flatworm.trim() !== "") {
                        throw new Error("cannot merge subsection info");
                    }
                } else {
                    subsection = new ApiSubsection(title, flatworm, anchor);

                    section.objs.push(subsection);
                }
            }

            for (const ex of exports) {
                if (!remaining.has(ex)) { continue; }
                subsection._addExport(remaining.get(ex));
                remaining.delete(ex);
            }

            for (const ex of (docTags.example || [])) {
                subsection._addExample(ex);
            }
        }

        // Add all the sections
        for (const filename of filenames) {
            const { exports, jsdocs } = fileMap.get(filename);
            const { flatworm, docTags } = splitDocs(jsdocs);
            if (!("_section" in docTags)) { continue; }

            const { anchor, path, title } = splitDocloc(docTags["_section"][0]);

            let section = toc.get(path);

            if (!section) {
                section = new ApiSection(title, flatworm, anchor);
                toc.set(path, section);
                section._setPath(path);
                if ("_navTitle" in docTags) {
                    section._setNavTitle(docTags["_navTitle"][0]);
                }

                section._addDependency(this.resolve(filename));

            } else {
                section._addDependency(this.resolve(filename));

                if ("_navTitle" in docTags) {
                    section._setNavTitle(docTags["_navTitle"][0]);
                }

                section._setAnchor(anchor);
                section._setTitle(title);
                section._setFlatworm(flatworm);
            }

            for (const ex of exports) {
                if (!remaining.has(ex)) { continue; }
                section._addSubsection(remaining.get(ex));
                remaining.delete(ex);
            }

            for (const ex of (docTags.example || [])) {
                section._addExample(ex);
            }
        }

        // Add all the objects with explicit _docloc set
        for (const { docloc, obj } of specific) {
            const { path, title } = splitDocloc(docloc);

            // Get the target section
            const section = toc.get(path);
            if (section == null) {
                throw new Error(`no matching section ${ JSON.stringify(docloc) }`);
            }

            section._addDependency(this.resolve(obj.filename));

            if (!title) {
                // Add to the section
                section.objs.push(obj);

            } else {
                // Add to a specific subsection
                let objs: null | Array<Export> = null;
                for (const obj of section.objs) {
                    if (obj instanceof Export) { continue; }
                    if (obj.title.trim() === title.trim()) {
                        objs = obj.objs
                        break;
                    }
                }
                if (objs == null) {
                    throw new Error(`no matching subsection ${ JSON.stringify(docloc) }`);
                }
                objs.push(obj);
            }
        }


        // Add the remaining objects to the root? Or other?
        if (remaining.size > 0) {
            let section = toc.get("api");
            if (!section) {
                section = new ApiSection("API", "Application Programming Interface");
                toc.set("api", section);
                section._setPath("api");
            }


            for (const [ , obj ] of remaining) {
                section._addSubsection(obj);

                section._addDependency(this.resolve(obj.filename));
            }
        }

        // Sort all the TOC entries
        const sorted = Array.from(toc.keys());
        sorted.sort((a, b) => (a.localeCompare(b)));
        for (const filename of sorted) {
            const { objs } = toc.get(filename);
            //console.log(`${ filename }: ${ title }`)
            //console.log(`  - about: ${ flatworm }`);
            objs.sort((a, b) => {
                let nameA: string, nameB: string;
                if (a instanceof Export) {
                    nameA = a.name;
                } else {
                    nameA = a.title;
                }
                if (b instanceof Export) {
                    nameB = b.name;
                } else {
                    nameB = b.title;
                }
                return nameA.toLowerCase().localeCompare(nameB.toLowerCase());
            });

            for (const obj of objs) {
                if (obj instanceof Export) {
                    //console.log(`  - ${ obj.name }`);
                } else {
                    //console.log(`  - ${ obj.title }`);
                    obj.objs.sort((a, b) => (a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
                    //for (const o of obj.objs) {
                    //    console.log(`    - ${ o.name }`);
                    //}
                }
            }

            this.toc = toc;
        }
    }

    resolve(...args: Array<string>): string {
        return resolve(dirname(this.basePath), ...args);
    }

    async evaluate(config: Config): Promise<void> {
        for (const obj of this.objs) {
            await obj.evaluate(config);
        }
    }

    dump(): void {
        console.log("ABI");
        for (const obj of this.objs) {
            obj.dump(1);
        }
    }
}

export function extractExports(basePath: string): Array<Export> {
    return (new ApiDocument(basePath)).objs;
}
