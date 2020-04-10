"use strict";

/**
 *  This is the generalized, minimal abstract syntax tree the a
 *  Flatworm document is parsed into, which can be passed to a
 *  Renderer.
 */

/*
export class StyleList {
    #styles: Readonly<{ [ style: string ]: boolean }>;

    constructor(styles: Array<string>) {
        this.#styles = Object.freeze(styles.reduce((accum: { [ style: string ]: boolean }, style: string) => {
            accum[style] = true;
            return accum;
        }, { }));
    }

    get style(): string {
        return this.styles.join(" ");
    }

    get styles(): Array<string> {
        return Object.keys(this.#styles);
    }

    contains(name: string): boolean {
        return !!this.#styles[name];
    }
}
*/

export abstract class Inline { }

export class Text extends Inline {
    readonly content: string;

    constructor(content: string) {
        super();
        this.content = content;
    }
}

export enum ElementStyle {
    NORMAL     = "normal",

    // Inline styles
    BOLD       = "bold",
    ITALIC     = "italic",
    UNDERLINE  = "Underline",
    SUPER      = "super",
    CODE       = "code",

    // Link
    LINK       = "link",

    // List (each child is a list element)
    LIST       = "list",

    // Property Styles
    PROPERTY   = "property",
    NEW        = "new",
    NAME       = "name",
    PARAMETERS = "parameters",
    ARROW      = "arrow",
    RETURNS    = "returns",
};

export class Element extends Inline {
    readonly children: ReadonlyArray<Inline>;
    readonly style: ElementStyle;

    constructor(style: ElementStyle, children: string | Array<string | Inline>) {
        super();

        this.style = style;

        if (typeof(children) === "string") {
            children = [ new Text(children) ];
        } else {
            children = children.map((child) => {
                if (typeof(child) === "string") { return new Text(child); }
                return child;
            });
        }
        this.children = Object.freeze(children);
    }
}

export class Link extends Element {
    readonly link: string;

    constructor(link: string, children: string | Array<string | Inline>) {
        super(ElementStyle.LINK, children);
        this.link = link;
    }
}

export class List extends Element {
    readonly items: ReadonlyArray<Inline>;

    constructor(children: Array<Inline>) {
        super(ElementStyle.LIST, children);
        this.items = this.children;
    }
}

export class Property extends Element {
    readonly isConstructor: boolean;
    readonly name: string;
    readonly parameters: string;
    readonly returns: string;

    constructor(isConstructor: boolean, name: string, parameters: string, returns: string) {
        const children = [
            new Element(ElementStyle.NAME, name),
            new Element(ElementStyle.PARAMETERS, parameters),
            new Element(ElementStyle.ARROW, " => "),
            new Element(ElementStyle.RETURNS, returns)
        ];
        if (isConstructor) {
            children.unshift(new Element(ElementStyle.NEW, "new "));
        }
        super(ElementStyle.PROPERTY, children);

        this.isConstructor = isConstructor;
        this.name = name;
        this.parameters = parameters;
        this.returns = returns;
    }
}

export class Block {
    readonly content: ReadonlyArray<Inline>

    constructor(content: Inline | Array<Inline>) {
        if (!Array.isArray(content)) {
            this.content = Object.freeze([ content ]);
        } else {
            this.content = Object.freeze(content.slice());
        }
    }
}

export enum BlockGroupStyles {
    SECTION     = "section",
    SUBSECTION  = "subsection",
    HEADING     = "heading",

    PROPERTY    = "property",
    DEFINITION  = "definition",

    NOTE        = "note",
    WARNING     = "warning",
};

export class BlockGroup {
    readonly blocks: ReadonlyArray<Block>;
    readonly style: string;

    constructor(style: string, blocks: Array<Block>) {
        this.style = style;
        this.blocks = Object.freeze(blocks.slice());
    }
}

export class Page {
    readonly title: string;
    readonly blockGroups: Array<BlockGroup>;

    constructor(title: string, blockGroups: Array<BlockGroup>) {
        this.title = title;
        this.blockGroups = blockGroups;
    }
}
