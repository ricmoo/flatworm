var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Export_examples, _Export_docs, _ReturnsExport_returns, _ReturnsExport_parent, _ClassExport_ctor, __ApiSection_anchor, __ApiSection_flatworm, __ApiSection_title, __ApiSection_objs, __ApiSection_examples, _ApiSection_path, _ApiSection_navTitle;
import fs from "fs";
import { dirname, join, relative, resolve } from "path";
import { parse } from "@babel/parser";
import { parseMarkdown } from "./markdown.js";
import { Script } from "./script.js";
const DEBUG = false;
const children = {
    File: ["program", "errors", "comments"],
    Program: ["body", "directives"],
    ExportNamedDeclaration: ["declaration", "specifiers"],
    ClassDeclaration: ["body"],
    ClassBody: ["body"],
    VariableDeclaration: ["declarations"],
    TSInterfaceDeclaration: ["body"],
    TSInterfaceBody: ["body"],
};
function getJsdoc(node) {
    if (node == null) {
        return "";
    }
    if (!node.leadingComments) {
        return "";
    }
    node = node.leadingComments;
    const children = (Array.isArray(node) ? node : [node]);
    for (const child of children) {
        if (child.type === "CommentBlock" && child.value && child.value[0] === "*") {
            const lines = child.value.trim().split("\n");
            lines.shift();
            if (lines.length === 0) {
                return "";
            }
            else if (lines.length === 1) {
                let line = lines[0].trim();
                if (line[0] === "*") {
                    line = line.substring(1).trim();
                }
                return line;
            }
            const padding = indent(20);
            let offset = 0;
            let done = false;
            while (!done && offset < lines[0].length) {
                offset++;
                const prefix = lines[0].substring(0, offset);
                for (let l = 1; l < lines.length; l++) {
                    if (!(lines[l] + padding).startsWith(prefix)) { //substring(0, offset) !== prefix) {
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
function getJsdocs(node, ancestors) {
    let jsdoc = getJsdoc(node);
    if (jsdoc) {
        return jsdoc;
    }
    for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];
        if (preserveJsdoc.indexOf(ancestor.type) === -1) {
            break;
        }
        let jsdoc = getJsdoc(ancestor);
        if (jsdoc) {
            return jsdoc;
        }
    }
    return "";
}
function _getType(node) {
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
            return new TypeTodo(`A3B${_getType(node.objectType)}[${_getType(node.indexType)}]`);
        case "TSIntersectionType": {
            const children = (node.types).map(_getType);
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
            return new TypeTodo(`A5BFOOBAR ...${_getType(node.typeAnnotation)}`);
        case "TSStringKeyword":
            return new TypeBasic("string");
        case "TSTupleType": {
            const children = (node.elementTypes).map(_getType);
            return new TypeGroup("tuple", children);
        }
        case "TSTypeLiteral": {
            const children = node.members.reduce((accum, m) => {
                if (m.type === "TSPropertySignature") {
                    const name = getId(m.key) + (m.optional ? "?" : "");
                    accum[name] = getType(m.typeAnnotation);
                }
                else if (m.type === "TSMethodSignature") {
                    const name = getId(m.key) + (m.optional ? "?" : "");
                    accum[name] = getType(m.typeAnnotation);
                }
                else if (m.type === "TSIndexSignature") {
                    if (m.parameters.length !== 1) {
                        throw new Error("hmm");
                    }
                    getId(m.parameters[0]);
                    const keys = getType(m.parameters[0].typeAnnotation);
                    const values = getType(m.typeAnnotation);
                    accum["[]"] = new TypeGroup("Record", [keys, values]);
                }
                else {
                    console.dir(node, { depth: null });
                    console.log(m);
                    throw new Error("CCc");
                }
                return accum;
            }, {});
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
            return new TypeGroup("|", (node.types).map(n => _getType(n)));
        case "TSVoidKeyword":
            return new TypeBasic("void");
        case "TSTypeQuery":
            if (node.exprName) {
                return new TypeGroup("ReturnType", [new TypeIdentifier(getId(node.exprName))]);
            }
    }
    console.dir(node, { depth: null });
    throw new Error("unknown TypeReference");
}
function getType(node) {
    switch (node ? node.type : "xxx") {
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
function parseType(value) {
    const ast = parse(`function foo(): ${value} { }`, {
        sourceFilename: "index.js",
        sourceType: "module",
        plugins: ["typescript"]
    });
    return getType(ast.program.body[0].returnType);
}
function getParams(params) {
    return params.map((param) => {
        // Assignment: foo(bar = 12)
        if (param.type === "AssignmentPattern") {
            // @TODO: Remove this and make it an error
            param = param.left;
            throw new Error("do not use assignment; use null");
        }
        else if (param.type === "RestElement") {
            const name = param.argument.name.match(/^_*([^_]*)$/)[1];
            const type = getType(param.typeAnnotation);
            return { name, type, optional: false };
        }
        const name = param.name.match(/^_*([^_]*)$/)[1];
        const type = getType(param.typeAnnotation);
        const optional = !!param.optional;
        return new Param(name, type, optional);
    });
}
function getReturns(node) {
    if (node.returnType == null) {
        console.dir(node, { depth: null });
        console.log(node.name, node.id, node.key);
        throw new Error("missing return type annotation");
    }
    return getType(node.returnType);
}
function getFunctionInfo(node) {
    const name = node.id.name;
    const lineno = node.id.loc.start.line;
    const params = getParams(node.params);
    const returns = getReturns(node);
    const signature = [name, "(", params.map(p => (`${p.name}${p.optional ? "?" : ""}: ${p.type}`)).join(", "), ") => ", returns].join("");
    return { name, lineno, params, returns, signature };
}
function getInstanceName(name) {
    let match = name.match(/^([A-Z]+)([A-Z][a-z].*)$/);
    if (!match) {
        return name[0].toLowerCase() + name.substring(1);
    }
    return match[1].toLowerCase() + match[2];
}
function getAncestorName(parentType, ancestors) {
    for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];
        if (ancestor.type === parentType) {
            const name = ancestor.id.name;
            if (name) {
                return name;
            }
        }
    }
    throw new Error(`missing ${parentType} name`);
}
function getMethodInfo(parentType, node, ancestors) {
    const parentName = getAncestorName(parentType, ancestors);
    const name = node.key.name;
    const lineno = node.key.loc.start.line;
    const params = getParams(node.params || node.parameters);
    const isStatic = node.static;
    const isAbstract = node.abstract;
    let returns;
    if (parentType === "ClassDeclaration") {
        returns = ((name === "constructor") ? "new" : getReturns(node));
    }
    else if (parentType === "TSInterfaceDeclaration") {
        returns = getType(node.typeAnnotation);
    }
    else {
        throw new Error("unsupported method type");
    }
    return { isAbstract, isStatic, lineno, parentName, name, params, returns };
}
function getPropertyInfo(parentType, node, ancestors) {
    const parentName = getAncestorName(parentType, ancestors);
    const name = node.key.name;
    const lineno = node.key.loc.start.line;
    const access = node.readonly ? "readonly" : "+write";
    const returns = getType(node.typeAnnotation);
    const signature = [getInstanceName(parentName), ".", name, " => ", returns].join("");
    return { parentName, name, lineno, access, returns, signature };
}
function _visit(node, depth, ancestors, visitor) {
    if (node == null) {
        return;
    }
    if (Array.isArray(node)) {
        for (const child of node) {
            _visit(child, depth, ancestors, visitor);
        }
        return;
    }
    if (!node.type) {
        return;
    }
    visitor(node.type, node, ancestors, depth);
    ancestors.unshift(node);
    for (const key of (children[node.type] || [])) {
        _visit(node[key], depth + 1, ancestors, visitor);
    }
    ancestors.shift();
}
function visit(filename, code, visitor) {
    const ast = parse(code, {
        sourceFilename: filename,
        sourceType: "module",
        plugins: ["typescript"]
    });
    if (DEBUG) {
        console.dir(ast, { depth: null });
    }
    _visit(ast, 0, [], visitor);
}
export function indent(size) {
    size *= 2;
    let result = "        ";
    while (result.length < size) {
        result += result;
    }
    return result.substring(0, size);
}
function getId(node) {
    if (node == null || node.type !== "Identifier") {
        throw new Error("not an identifier");
    }
    return node.name;
}
export function getExports(path) {
    const result = {};
    //const doneMissing: Set<string> = new Set();
    const process = (path) => {
        // Already processed this file
        if (path in result) {
            return;
        }
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
            }
            else if (type === "ImportDeclaration") {
                // Recurse into the imported source
                if (node.source) {
                    const filename = node.source.value.replace(/\.js$/, ".ts");
                    if (filename.match(/^(\.|\/)/)) {
                        const subpath = join(dirname(path), filename);
                        process(subpath);
                    }
                }
            }
            else if (type === "ExportNamedDeclaration") {
                //const isType = ((node.exportKind === "type") ? "type:": "");
                const isType = "";
                // export { foo, bar } from "blah"
                // export { foo, bar }
                for (const child of node.specifiers) {
                    if (child.type === "ExportSpecifier") {
                        result[path].add(isType + getId(child.exported));
                    }
                    else {
                        throw new Error("unknown child type");
                    }
                }
                // export function bar() { }
                if (node.declaration) {
                    if (node.declaration.declarations) {
                        for (const child of node.declaration.declarations) {
                            result[path].add(getId(child.id));
                        }
                    }
                    else {
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
export function getObjects(path, exports) {
    const skip = "start end loc source __clone".split(" ");
    const code = fs.readFileSync(path).toString();
    const result = [];
    let ignoreFile = false;
    visit(path, code, (type, node, ancestors, depth) => {
        if (ignoreFile) {
            return;
        }
        for (const key in node) {
            if (skip.indexOf(key) >= 0) {
                continue;
            }
        }
        if (type === "File") {
            const jsdoc = getJsdoc({ leadingComments: (node.comments || []).slice(0, 1) });
            if (jsdoc.match(/(@_ignore|@private)/)) {
                ignoreFile = true;
                return;
                ;
            }
            result.push({
                type: "file",
                path,
                jsdoc
            });
        }
        else if (type === "FunctionDeclaration") {
            const name = node.id.name;
            if (!exports.has(name)) {
                return;
            }
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            result.push(Object.assign(getFunctionInfo(node), {
                type: "function", jsdoc
            }));
        }
        else if (type === "TSInterfaceDeclaration") {
            const name = node.id.name;
            if (!exports.has(name)) {
                return null;
            }
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            const lineno = node.id.loc.start.line;
            // @TODO supers
            const supers = [];
            if (node.extends) {
                for (const ext of node.extends) {
                    if (ext.type === "TSExpressionWithTypeArguments" && ext.expression.type === "Identifier") {
                        supers.push(getId(ext.expression));
                    }
                    else {
                        console.log("III", name);
                        console.dir(node, { depth: null });
                        throw new Error("check...");
                    }
                }
            }
            result.push({ type: "interface", name, lineno, supers, jsdoc });
        }
        else if (type === "ClassDeclaration") {
            const name = node.id.name;
            if (!exports.has(name)) {
                return;
            }
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            const lineno = node.id.loc.start.line;
            const supers = [];
            if (node.superClass) {
                if (node.superClass.type === "CallExpression") {
                    supers.push(getId(node.superClass.callee));
                }
                else {
                    supers.push(getId(node.superClass));
                }
            }
            for (const parent of (node.implements || [])) {
                if (parent.type === "TSExpressionWithTypeArguments") {
                    let name = getId(parent.expression);
                    if (parent.typeParameters && parent.typeParameters.type === "TSTypeParameterInstantiation") {
                        name = `${name}<${parent.typeParameters.params.map((c) => _getType(c))}>`;
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
        }
        else if (type === "ClassMethod" || type === "TSDeclareMethod") {
            const name = node.key.name;
            //if (!exports.has(name)) { return; }
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            const lineno = node.key.loc.start.line;
            if (node.kind === "set") {
                result.push({
                    type: "property", name, lineno, jsdoc,
                    parentName: getAncestorName("ClassDeclaration", ancestors),
                    access: "+write",
                });
            }
            else {
                const info = getMethodInfo("ClassDeclaration", node, ancestors);
                if (node.kind === "get") {
                    result.push({
                        type: "property",
                        name: info.name,
                        parentName: info.parentName,
                        access: "+read",
                        returns: info.returns,
                        signaure: `${getInstanceName(info.parentName)}.${info.name} => ${info.returns}`,
                        jsdoc
                    });
                }
                else {
                    result.push(Object.assign(info, { type: "method", jsdoc }));
                }
            }
        }
        else if (type === "TSMethodSignature") {
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            const info = getMethodInfo("TSInterfaceDeclaration", node, ancestors);
            result.push(Object.assign(info, {
                type: "method", jsdoc
            }));
        }
        else if (type === "ClassProperty") {
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            result.push(Object.assign(getPropertyInfo("ClassDeclaration", node, ancestors), {
                type: "property", jsdoc
            }));
        }
        else if (type === "TSPropertySignature") {
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            result.push(Object.assign(getPropertyInfo("TSInterfaceDeclaration", node, ancestors), {
                type: "property", jsdoc
            }));
        }
        else if (type === "TSTypeAliasDeclaration") {
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            const name = node.id.name;
            const returns = _getType(node.typeAnnotation);
            const lineno = node.id.loc.start.line;
            result.push({
                type: "type", jsdoc, name, lineno, returns
            });
        }
        else if (type === "VariableDeclarator") {
            const name = node.id.name;
            if (!exports.has(name)) {
                return;
            }
            const jsdoc = getJsdocs(node, ancestors);
            if (jsdoc.match(/(@_ignore|@private)/)) {
                return;
            }
            const returns = getType(node.id.typeAnnotation);
            const lineno = node.id.loc.start.line;
            result.push({
                type: "const", jsdoc, name, lineno, returns
            });
        }
        else {
            //console.dir(node, { depth: null });
            //console.log("MOO:", node.type);
        }
    });
    return result;
}
export class Param {
    constructor(name, type, optional) {
        this.name = name;
        this.type = type;
        this.optional = optional;
    }
    toString() {
        return `${this.name}${this.optional ? "?" : ""}: ${this.type}`;
    }
}
// @TODO
export class Type {
    constructor(type) {
        this.type = type;
    }
    dump(_indent = 0) {
        console.log(`${indent(_indent)}- ${this.constructor.name}: ${this.type}`);
    }
}
// Types to fill in later...
export class TypeTodo extends Type {
    constructor(type) {
        super(`TODO(${type})`);
    }
}
export class TypeBasic extends Type {
}
export class TypeLiteral extends Type {
}
export class TypeIdentifier extends Type {
}
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
    constructor(type, value) {
        super(type);
        this.value = value;
    }
}
export class TypeMapping extends Type {
    constructor(children) {
        const joined = Object.keys(children).map((k) => `${k}: ${children[k].type}`).join(", ");
        super(`{ ${joined} }`);
        this.children = children;
    }
}
// e.g. number | string
export class TypeGroup extends Type {
    constructor(relation, types) {
        super(`${relation}(${types.map((t) => t.type).join(", ")})`);
        this.relation = relation;
        this.types = types;
    }
    dump(_indent = 0) {
        console.log(`${indent(_indent)}- GROUP:${this.relation}`);
        for (const type of this.types) {
            type.dump(_indent + 1);
        }
    }
}
// e.g. Promise<Foo>
export class TypeWrapped extends Type {
    constructor(wrapper, child) {
        super(`${wrapper}<${child.type}>`);
        this.wrapper = wrapper;
        this.child = child;
    }
    dump(_indent = 0) {
        console.log(`${indent(_indent)}- WRAPPED<${this.wrapper}>`);
        this.child.dump(_indent + 1);
    }
}
export class TypeFunction extends Type {
    constructor(params, returns) {
        super("(@TODO: params) => return type");
        this.params = params;
        this.returns = returns;
    }
}
function splitDocs(docs) {
    const flatworm = [];
    const docTags = {};
    let foundTag = false;
    let lastTag = [];
    for (const line of docs.split("\n")) {
        const match = line.trim().match(/^\s*@([^ ]+)(.*)$/);
        if (match) {
            foundTag = true;
            let tag = match[1], content = match[2].trim();
            if (tag.endsWith(":")) {
                tag = tag.substring(0, tag.length - 1);
            }
            lastTag = [content];
            if (!(tag in docTags)) {
                docTags[tag] = [lastTag];
            }
            else {
                docTags[tag].push(lastTag);
            }
        }
        else if (foundTag) {
            lastTag.push(line);
        }
        else {
            flatworm.push(line);
        }
    }
    return {
        flatworm: flatworm.join("\n").trim(),
        docTags: Object.keys(docTags).reduce((accum, tag) => {
            const docTag = docTags[tag];
            accum[tag] = docTag.map((l) => l.join("\n"));
            return accum;
        }, {})
    };
}
const sortPropOrder = {
    "const": 1,
    "type": 2,
    "function": 3,
    "property": 4,
    "constructor": 5,
    "create": 6,
    "method": 7,
    "static method": 8,
    "interface": 9,
    "abstract class": 9,
    "class": 9
};
function sortProps(a, b) {
    const isSubA = (a instanceof ApiSubsection);
    const isSubB = (b instanceof ApiSubsection);
    if (isSubA && !isSubB) {
        return 1;
    }
    if (!isSubA && isSubB) {
        return -1;
    }
    const nameA = (isSubA) ? a.title : a.name;
    const nameB = (isSubB) ? b.title : b.name;
    if (isSubA || isSubB) {
        return nameA.localeCompare(nameB);
    }
    const pa = sortPropOrder[a.type], pb = sortPropOrder[b.type];
    const cmp = pa - pb;
    if (cmp !== 0) {
        return cmp;
    }
    return nameA.localeCompare(nameB);
}
export class Export {
    constructor(filename, lineno, name, docs) {
        _Export_examples.set(this, void 0);
        _Export_docs.set(this, void 0);
        this.filename = filename;
        this.lineno = lineno;
        this.name = name;
        __classPrivateFieldSet(this, _Export_docs, docs, "f");
        __classPrivateFieldSet(this, _Export_examples, null, "f");
    }
    get title() { return this.name; }
    get dependencies() { return [this.filename]; }
    get id() { return this.name; }
    get docs() { return __classPrivateFieldGet(this, _Export_docs, "f"); }
    get flatworm() {
        return splitDocs(__classPrivateFieldGet(this, _Export_docs, "f")).flatworm;
    }
    get docTags() {
        return splitDocs(__classPrivateFieldGet(this, _Export_docs, "f")).docTags;
        ;
    }
    getTag(key) {
        const values = this.docTags[key];
        if (values == null) {
            return [];
        }
        return values;
    }
    evaluate(config) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const example of this.examples()) {
                yield example.evaluate(config);
            }
        });
    }
    examples() {
        if (__classPrivateFieldGet(this, _Export_examples, "f") == null) {
            const examples = [];
            for (const example of this.getTag("example")) {
                examples.push(new Script(example, "javascript"));
            }
            __classPrivateFieldSet(this, _Export_examples, examples, "f");
        }
        return __classPrivateFieldGet(this, _Export_examples, "f");
    }
    _updateDocs(docs) {
        if (__classPrivateFieldGet(this, _Export_docs, "f") && docs) {
            throw new Error(`cannot update docs from ${JSON.stringify(__classPrivateFieldGet(this, _Export_docs, "f"))} => ${JSON.stringify(docs)}`);
        }
        if (docs) {
            __classPrivateFieldSet(this, _Export_docs, docs, "f");
        }
    }
    dump(_indent = 0) {
        console.log(`${indent(_indent)}- ${this.constructor.name} ${this.name}`);
        console.log(`${indent(_indent)}  - file: ${this.filename}:${this.lineno}`);
        const { flatworm, docTags } = splitDocs(__classPrivateFieldGet(this, _Export_docs, "f"));
        if (flatworm) {
            console.log(`${indent(_indent)}  - docs: ${JSON.stringify(flatworm)}`);
            console.log(`${indent(_indent)}  - markdown: ${parseMarkdown(flatworm)}`);
        }
        for (const tag of Object.keys(docTags)) {
            console.log(`${indent(_indent)}  - docTag-${tag}: ${JSON.stringify(docTags[tag])}`);
        }
    }
}
_Export_examples = new WeakMap(), _Export_docs = new WeakMap();
export class ReturnsExport extends Export {
    constructor(filename, lineno, name, docs, returns) {
        super(filename, lineno, name, docs);
        _ReturnsExport_returns.set(this, void 0);
        _ReturnsExport_parent.set(this, void 0);
        __classPrivateFieldSet(this, _ReturnsExport_returns, returns, "f");
    }
    get parent() { return __classPrivateFieldGet(this, _ReturnsExport_parent, "f"); }
    _setParent(parent) {
        if (__classPrivateFieldGet(this, _ReturnsExport_parent, "f")) {
            throw new Error("already has parent");
        }
        __classPrivateFieldSet(this, _ReturnsExport_parent, parent, "f");
    }
    get id() {
        if (__classPrivateFieldGet(this, _ReturnsExport_parent, "f")) {
            return `${__classPrivateFieldGet(this, _ReturnsExport_parent, "f").name}-${this.name}`;
        }
        return super.id;
    }
    get prefix() {
        if (__classPrivateFieldGet(this, _ReturnsExport_parent, "f") == null) {
            return "";
        }
        return getInstanceName(__classPrivateFieldGet(this, _ReturnsExport_parent, "f").name);
    }
    get returns() {
        const docTags = this.docTags;
        const returns = docTags["returns"] || docTags["return"];
        if (returns != null) {
            if (returns.length !== 1) {
                console.log("@TODO:", returns);
                throw new Error("wrong returns");
            }
            return parseType(returns[0].trim());
        }
        return __classPrivateFieldGet(this, _ReturnsExport_returns, "f");
    }
    dump(_indent = 0) {
        super.dump(_indent);
        console.log(`${indent(_indent)}  - returns`);
        this.returns.dump(_indent + 2);
    }
}
_ReturnsExport_returns = new WeakMap(), _ReturnsExport_parent = new WeakMap();
export class FunctionExport extends ReturnsExport {
    constructor(filename, lineno, name, docs, returns, params, isStatic, isAbstract) {
        super(filename, lineno, name, docs, returns);
        this.params = params;
        this.isStatic = isStatic;
        this.isAbstract = isAbstract;
    }
    get id() {
        const parent = this.parent;
        if (parent) {
            if (this.name === "constructor") {
                return `${parent.name}_new`;
            }
            else if (this.isStatic) {
                return `${parent.name}_${this.name}`;
            }
        }
        return super.id;
    }
    get type() {
        const parent = this.parent;
        if (parent) {
            if (this.name === "constructor") {
                return "constructor";
            }
            else if (this.isStatic) {
                const returns = this.returns.type;
                if (returns === parent.name || returns === `Promise<${parent.name}>`) {
                    return "create";
                }
                return "static method";
            }
            return "method";
        }
        return "function";
    }
    get prefix() {
        if (this.parent && this.isStatic) {
            return this.parent.name;
        }
        return super.prefix;
    }
    dump(_indent = 0) {
        super.dump(_indent);
        if (this.isStatic) {
            console.log(`${indent(_indent)}  - is static`);
        }
        if (this.isAbstract) {
            console.log(`${indent(_indent)}  - is abstract`);
        }
        console.log(`${indent(_indent)}  - params:`);
        for (const param of this.params) {
            console.log(`${indent(_indent + 1)}  - ${param.name}${param.optional ? "?" : ""}:`);
            param.type.dump(_indent + 2);
        }
    }
}
export class PropertyExport extends ReturnsExport {
    constructor(filename, lineno, name, docs, returns, access) {
        super(filename, lineno, name, docs, returns);
        this._access = "+read";
        this._updateAccess(access);
    }
    get type() { return "property"; }
    get isReadonly() {
        return (this._access !== "+write");
    }
    dump(_indent = 0) {
        super.dump(_indent);
        console.log(`${indent(_indent)}  - isReadonly: ${this.isReadonly}`);
    }
    _updateAccess(access) {
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
                throw new Error(`invalid access: ${access}`);
        }
        this._access = access;
    }
}
export class ObjectExport extends Export {
    constructor(filename, lineno, name, docs) {
        super(filename, lineno, name, docs);
        this.supers = [];
        this.methods = new Map();
        this.properties = new Map();
    }
    get children() {
        let children = Array.from(this.properties.values());
        children = children.concat(Array.from(this.methods.values()));
        children.sort(sortProps);
        const supers = this.allSupers;
        return children.filter((child) => {
            if (child instanceof FunctionExport && child.flatworm.trim() === "") {
                for (const s of supers) {
                    if (s.methods.has(child.name)) {
                        //console.log(`Skipping empty ${ this.name }.${ child.name } found in ${ s.name }`);
                        return false;
                    }
                }
            }
            return true;
        });
    }
    get length() {
        return this.children.length;
    }
    [Symbol.iterator]() {
        const children = this.children;
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: children[index++], done: false };
                }
                return { value: undefined, done: true };
            }
        };
    }
    evaluate(config) {
        const _super = Object.create(null, {
            evaluate: { get: () => super.evaluate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            yield _super.evaluate.call(this, config);
            for (const [, obj] of this.methods) {
                yield obj.evaluate(config);
            }
            for (const [, obj] of this.methods) {
                yield obj.evaluate(config);
            }
        });
    }
    get allSupers() {
        const result = new Set();
        for (const s of this.supers) {
            result.add(s);
            for (const ss of s.supers) {
                result.add(ss);
            }
        }
        return Array.from(result);
    }
    dump(_indent = 0) {
        super.dump(_indent);
        if (this.supers.length) {
            console.log(`${indent(_indent)}  - inherits: ${this.supers.join(", ")}`);
        }
        if (Array.from(this.properties).length) {
            console.log(`${indent(_indent)}  Properties`);
            for (const [, value] of this.properties) {
                value.dump(_indent + 2);
            }
        }
        if (Array.from(this.methods).length) {
            console.log(`${indent(_indent)}  Methods`);
            for (const [, value] of this.methods) {
                value.dump(_indent + 2);
            }
        }
    }
    _addMethod(value) {
        if (this.methods.has(value.name)) {
            throw new Error(`method ${value.name} already defined`);
        }
        this.methods.set(value.name, value);
        value._setParent(this);
    }
    _addProperty(value, access) {
        const existing = this.properties.get(value.name);
        if (existing) {
            existing._updateDocs(value.docs);
            existing._updateAccess(access);
        }
        else {
            this.properties.set(value.name, value);
        }
        value._setParent(this);
    }
    _addSuper(value) {
        if (this.supers.indexOf(value) === -1) {
            this.supers.push(value);
            return true;
        }
        return false;
    }
}
export class ClassExport extends ObjectExport {
    constructor(filename, lineno, name, docs, isAbstract) {
        super(filename, lineno, name, docs);
        _ClassExport_ctor.set(this, void 0);
        this.isAbstract = isAbstract;
        this.staticMethods = new Map();
        __classPrivateFieldSet(this, _ClassExport_ctor, null, "f");
    }
    get ctor() { return __classPrivateFieldGet(this, _ClassExport_ctor, "f"); }
    get type() {
        return this.isAbstract ? "abstract class" : "class";
    }
    get children() {
        let children = super.children;
        children = children.concat(Array.from(this.staticMethods.values()));
        if (this.ctor) {
            children.push(this.ctor);
        }
        children.sort(sortProps);
        return children;
    }
    evaluate(config) {
        const _super = Object.create(null, {
            evaluate: { get: () => super.evaluate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            yield _super.evaluate.call(this, config);
            for (const [, obj] of this.staticMethods) {
                yield obj.evaluate(config);
            }
        });
    }
    _setConstructor(value) {
        if (__classPrivateFieldGet(this, _ClassExport_ctor, "f")) {
            throw new Error(`constructor already defined`);
        }
        __classPrivateFieldSet(this, _ClassExport_ctor, value, "f");
        value._setParent(this);
    }
    _addStaticMethod(value) {
        if (this.staticMethods.has(value.name)) {
            throw new Error(`static method ${value.name} already defined`);
        }
        this.staticMethods.set(value.name, value);
        value._setParent(this);
    }
    dump(_indent = 0) {
        super.dump(_indent);
        if (Array.from(this.staticMethods).length) {
            console.log(`${indent(_indent)}  Static Methods`);
            for (const [, value] of this.staticMethods) {
                value.dump(_indent + 2);
            }
        }
    }
}
_ClassExport_ctor = new WeakMap();
export class InterfaceExport extends ObjectExport {
    constructor(filename, lineno, name, docs) {
        super(filename, lineno, name, docs);
    }
    get type() { return "interface"; }
}
export class TypeExport extends ReturnsExport {
    get type() { return "type"; }
}
export class ConstExport extends ReturnsExport {
    get type() { return "const"; }
}
function splitDocloc(docloc) {
    const match = docloc.trim().match(/([^:]*)(:([^\[\]]*))?(\[(.*)\])?/);
    if (match == null) {
        throw new Error(`could not split docloc: ${docloc}`);
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
export class _ApiSection {
    constructor(title, flatworm, anchor) {
        __ApiSection_anchor.set(this, void 0);
        __ApiSection_flatworm.set(this, void 0);
        __ApiSection_title.set(this, void 0);
        // @todo: rename to subsections
        __ApiSection_objs.set(this, void 0);
        __ApiSection_examples.set(this, void 0);
        __classPrivateFieldSet(this, __ApiSection_title, title, "f");
        __classPrivateFieldSet(this, __ApiSection_flatworm, flatworm || "", "f");
        __classPrivateFieldSet(this, __ApiSection_anchor, anchor || null, "f");
        __classPrivateFieldSet(this, __ApiSection_objs, [], "f");
        __classPrivateFieldSet(this, __ApiSection_examples, [], "f");
    }
    get objs() {
        __classPrivateFieldGet(this, __ApiSection_objs, "f").sort(sortProps); // @TODO: cache this? lazy?
        return __classPrivateFieldGet(this, __ApiSection_objs, "f");
    }
    get examples() {
        return __classPrivateFieldGet(this, __ApiSection_examples, "f");
    }
    get anchor() { return __classPrivateFieldGet(this, __ApiSection_anchor, "f"); }
    get flatworm() { return __classPrivateFieldGet(this, __ApiSection_flatworm, "f"); }
    get title() { return __classPrivateFieldGet(this, __ApiSection_title, "f"); }
    // @TODO: should these throw if already set?
    _addObject(item) { __classPrivateFieldGet(this, __ApiSection_objs, "f").push(item); }
    _addExample(ex) { __classPrivateFieldGet(this, __ApiSection_examples, "f").push(ex); }
    _setFlatworm(flatworm) { __classPrivateFieldSet(this, __ApiSection_flatworm, flatworm, "f"); }
    _setTitle(title) { __classPrivateFieldSet(this, __ApiSection_title, title, "f"); }
    _setAnchor(anchor) { __classPrivateFieldSet(this, __ApiSection_anchor, anchor, "f"); }
}
__ApiSection_anchor = new WeakMap(), __ApiSection_flatworm = new WeakMap(), __ApiSection_title = new WeakMap(), __ApiSection_objs = new WeakMap(), __ApiSection_examples = new WeakMap();
export class ApiSubsection extends _ApiSection {
    _addExport(ex) { super._addObject(ex); }
}
export class ApiSection extends _ApiSection {
    constructor(title, flatworm, anchor) {
        super(title, flatworm, anchor);
        _ApiSection_path.set(this, void 0);
        _ApiSection_navTitle.set(this, void 0);
        this.dependencies = [];
        __classPrivateFieldSet(this, _ApiSection_path, "", "f");
        __classPrivateFieldSet(this, _ApiSection_navTitle, null, "f");
    }
    get subsections() {
        return this.objs;
    }
    get navTitle() {
        if (__classPrivateFieldGet(this, _ApiSection_navTitle, "f")) {
            return __classPrivateFieldGet(this, _ApiSection_navTitle, "f");
        }
        return this.title;
    }
    _setNavTitle(nav) {
        __classPrivateFieldSet(this, _ApiSection_navTitle, nav, "f");
    }
    get path() {
        if (__classPrivateFieldGet(this, _ApiSection_path, "f") == null) {
            throw new Error(`no path set for ${this.anchor}`);
        }
        return __classPrivateFieldGet(this, _ApiSection_path, "f");
    }
    _setPath(path) { __classPrivateFieldSet(this, _ApiSection_path, path, "f"); }
    _addSubsection(subsection) {
        super._addObject(subsection);
    }
    _addDependency(dep) {
        if (this.dependencies.indexOf(dep) >= 0) {
            return;
        }
        this.dependencies.push(dep);
    }
}
_ApiSection_path = new WeakMap(), _ApiSection_navTitle = new WeakMap();
export class ApiDocument {
    constructor(basePath) {
        this.basePath = basePath;
        this.objs = [];
        const allExports = getExports(this.basePath);
        // Map each ObjectExport to a list of supers, to be
        // filled in all Exports are available.
        const superMap = new Map();
        const fileMap = new Map();
        const filenames = [];
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
            const objs = [];
            for (const obj of getObjects(_filename, exports)) {
                const checkSkip = (key) => {
                    if (key == null) {
                        return true;
                    }
                    if (!exports.has(key)) {
                        //console.log("Skipping Obj; not exported:", key);
                        return true;
                    }
                    return false;
                };
                const getObject = (name) => {
                    const obj = objs.filter((o) => (o instanceof ObjectExport && o.name === name));
                    if (obj.length === 0) {
                        return null;
                    }
                    if (obj.length > 1) {
                        console.log("Too many objects", name, objs);
                        throw new Error();
                    }
                    return (obj[0]);
                };
                const getClass = (name) => {
                    const cls = getObject(name);
                    if (cls == null) {
                        return null;
                    }
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
                        if (checkSkip(obj.name)) {
                            break;
                        }
                        const ex = new FunctionExport(filename, obj.lineno, obj.name, obj.jsdoc, obj.returns, obj.params.map((p) => new Param(p.name, p.type, p.optional)), false, false);
                        objs.push(ex);
                        //files.get(filename).exports.push(ex);
                        break;
                    }
                    case "class": {
                        if (checkSkip(obj.name)) {
                            break;
                        }
                        const ex = new ClassExport(filename, obj.lineno, obj.name, obj.jsdoc, obj.isAbstract);
                        superMap.set(ex, obj.supers || []);
                        objs.push(ex);
                        //files.get(filename).exports.push(ex);
                        break;
                    }
                    case "interface": {
                        if (checkSkip(obj.name)) {
                            break;
                        }
                        const ex = new InterfaceExport(filename, obj.lineno, obj.name, obj.jsdoc);
                        superMap.set(ex, obj.supers || []);
                        objs.push(ex);
                        break;
                    }
                    case "property": {
                        if (checkSkip(obj.parentName) || obj.name == null) {
                            break;
                        }
                        const parent = getObject(obj.parentName);
                        if (parent) {
                            parent._addProperty(new PropertyExport(filename, obj.lineno, obj.name, obj.jsdoc, obj.returns, obj.access), obj.access);
                        }
                        break;
                    }
                    case "method": {
                        if (checkSkip(obj.parentName) || obj.name == null) {
                            break;
                        }
                        const method = new FunctionExport(filename, obj.lineno, obj.name, obj.jsdoc, obj.returns, obj.params.map((p) => new Param(p.name, p.type, p.optional)), (obj.isStatic || obj.name === "constructor"), !!obj.isAbstract);
                        if (obj.name === "constructor") {
                            const parent = getClass(obj.parentName);
                            if (parent) {
                                parent._setConstructor(method);
                            }
                        }
                        else if (obj.isStatic) {
                            const parent = getClass(obj.parentName);
                            if (parent) {
                                parent._addStaticMethod(method);
                            }
                        }
                        else {
                            const parent = getObject(obj.parentName);
                            if (parent) {
                                parent._addMethod(method);
                            }
                        }
                        break;
                    }
                    case "type": {
                        if (checkSkip(obj.name)) {
                            break;
                        }
                        const ex = new TypeExport(filename, obj.lineno, obj.name, obj.jsdoc, obj.returns);
                        objs.push(ex);
                        break;
                    }
                    case "const": {
                        if (checkSkip(obj.name)) {
                            break;
                        }
                        const ex = new ConstExport(filename, obj.lineno, obj.name, obj.jsdoc, obj.returns);
                        objs.push(ex);
                        break;
                    }
                    default:
                        console.log(obj);
                        throw new Error("unknown type");
                }
            }
            for (const obj of objs) {
                this.objs.push(obj);
            }
        }
        // Add supers
        for (const [ex, supers] of superMap) {
            for (let s of supers) {
                let e;
                try {
                    e = this.getExport(s);
                }
                catch (error) {
                    console.log(`WARNING: missing super for ${ex.name} (${s})`);
                    continue;
                }
                if (!(e instanceof ObjectExport)) {
                    console.log(`WARNING: invalid super type for ${ex.name} (${s})`);
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
                }
                catch (error) {
                    //console.log("EE", ex, error.message);
                }
            }
        }
        const missing = new Map();
        const root = fileMap.get("index.ts").exports;
        for (const [filename, { exports }] of fileMap) {
            const match = filename.match(/^([a-z0-9_]+)\/index.ts$/i);
            if (!match) {
                continue;
            }
            for (const ex of exports) {
                if (root.has(ex)) {
                    continue;
                }
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
                const types = [];
                const exs = [];
                for (const name of exports) {
                    const ex = this.getExport(name);
                    if (ex == null) {
                        throw new Error(`bad thing: ${name}`);
                    }
                    if (ex instanceof InterfaceExport || ex instanceof TypeExport) {
                        types.push(name);
                    }
                    else {
                        exs.push(name);
                    }
                }
                for (const { kind, objs } of [{ kind: "", objs: exs.sort() }, { kind: "type ", objs: types.sort() }]) {
                    if (objs.length === 0) {
                        continue;
                    }
                    console.log(`export ${kind}{`);
                    console.log(`    ${objs.join(", ")}`);
                    console.log(`} from "${filename}"`);
                }
            }
        }
        const toc = new Map();
        const remaining = new Map();
        const specific = [];
        // Pull out any objects which have an explicit docloc
        this.objs.forEach((obj) => {
            const docTags = obj.docTags;
            if ("_docloc" in docTags) {
                specific.push({ docloc: docTags["_docloc"][0], obj });
            }
            else {
                remaining.set(obj.name, obj);
            }
        });
        // Add all the subsections first; this prevents the section
        // from gobbling up all the exports
        for (const filename of filenames) {
            const { exports, jsdocs } = fileMap.get(filename);
            const { flatworm, docTags } = splitDocs(jsdocs);
            if (!("_subsection" in docTags)) {
                continue;
            }
            const { anchor, path, title } = splitDocloc(docTags["_subsection"][0]);
            let subsection;
            let section = toc.get(path);
            if (!section) {
                subsection = new ApiSubsection(title, flatworm, anchor);
                section = new ApiSection("", flatworm, null);
                section._addSubsection(subsection);
                section._addDependency(this.resolve(filename));
                toc.set(path, section);
                section._setPath(path);
            }
            else {
                section._addDependency(this.resolve(filename));
                for (const obj of section.objs) {
                    if (obj instanceof Export) {
                        continue;
                    }
                    if (obj.anchor === anchor) {
                        subsection = obj;
                        break;
                    }
                }
                if (subsection) {
                    if (subsection.flatworm.trim() === "") {
                        subsection._setFlatworm(flatworm);
                    }
                    else if (flatworm.trim() !== "") {
                        throw new Error("cannot merge subsection info");
                    }
                }
                else {
                    subsection = new ApiSubsection(title, flatworm, anchor);
                    section.objs.push(subsection);
                }
            }
            for (const ex of exports) {
                if (!remaining.has(ex)) {
                    continue;
                }
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
            if (!("_section" in docTags)) {
                continue;
            }
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
            }
            else {
                section._addDependency(this.resolve(filename));
                if ("_navTitle" in docTags) {
                    section._setNavTitle(docTags["_navTitle"][0]);
                }
                section._setAnchor(anchor);
                section._setTitle(title);
                section._setFlatworm(flatworm);
            }
            for (const ex of exports) {
                if (!remaining.has(ex)) {
                    continue;
                }
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
                throw new Error(`no matching section ${JSON.stringify(docloc)}`);
            }
            section._addDependency(this.resolve(obj.filename));
            if (!title) {
                // Add to the section
                section.objs.push(obj);
            }
            else {
                // Add to a specific subsection
                let objs = null;
                for (const obj of section.objs) {
                    if (obj instanceof Export) {
                        continue;
                    }
                    if (obj.title.trim() === title.trim()) {
                        objs = obj.objs;
                        break;
                    }
                }
                if (objs == null) {
                    throw new Error(`no matching subsection ${JSON.stringify(docloc)}`);
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
            for (const [, obj] of remaining) {
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
                let nameA, nameB;
                if (a instanceof Export) {
                    nameA = a.name;
                }
                else {
                    nameA = a.title;
                }
                if (b instanceof Export) {
                    nameB = b.name;
                }
                else {
                    nameB = b.title;
                }
                return nameA.toLowerCase().localeCompare(nameB.toLowerCase());
            });
            for (const obj of objs) {
                if (obj instanceof Export) {
                    //console.log(`  - ${ obj.name }`);
                }
                else {
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
    get sections() {
        return Array.from(this.toc.values());
    }
    getExport(name) {
        const matches = this.objs.filter((e) => (e.name === name));
        if (matches.length !== 1) {
            throw new Error(`No export found: ${name}`);
        }
        return matches[0];
    }
    resolve(...args) {
        return resolve(dirname(this.basePath), ...args);
    }
    evaluate(config) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const obj of this.objs) {
                yield obj.evaluate(config);
            }
        });
    }
    dump() {
        console.log("ABI");
        for (const obj of this.objs) {
            obj.dump(1);
        }
    }
}
export function extractExports(basePath) {
    return (new ApiDocument(basePath)).objs;
}
//# sourceMappingURL=jsdocs.js.map