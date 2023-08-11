
import { OutputFile, Renderer } from "./renderer.js";
import {
    CodeContent, SectionWithBody
} from "./document.js";

import type { Content, Document, Section } from "./document.js";

const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Remove export later
export function toB64(value: number): string {
    let result = "";
    while (value) {
        result = b64[value % 64] + result;
        value = Math.trunc(value / 64);
    }
    return result;
}

export function fromB64(value: string): number {
    let result = 0;
    for (let i = 0; i < value.length; i++) {
        result *= 64;
        result += b64.indexOf(value[i]);
    }
    return result;
}
//for (let i = 0; i < 1000; i++) {
//    console.log(i, i.toString().length, toB64(i).length, toB64(i), fromB64(toB64(i)));
//}

function toTag(index0: number, index1: number): string {
    if (index1 < 8) {
        return toB64((index0 << 3) | index1);
    }
    return toB64(index0) + "/" + toB64(index1);
}

export type SummaryBlock = {
    link: string;
    text: string;
};

export type Summary = {
    title: string;
    blocks: Array<SummaryBlock>;
};

export class SearchRenderer extends Renderer {
    constructor(document: Document) {
        super(document);
    }
/*
    renderDocument(document: Document): Array<File> {
        const summaries: Array<Summary> = [ ];
        const indices: { [ keyword: string ]: Array<string> } = { };
        const compound: Record<string, boolean> = { };

        let section: string = null
        let subsection: string = null;

        document.pages.forEach((page) => {
            let summary: Summary = { title: null, blocks: [ ] };
            let link: string = null;
            page.fragments.forEach((fragment) => {
                if (fragment instanceof CodeFragment) { return; }

                const pretitle: Array<string> = [ ];
                if (fragment.tag === FragmentType.SECTION) {
                    section = fragment.title.textContent;
                } else if (fragment.tag === FragmentType.SUBSECTION) {
                    subsection = fragment.title.textContent;
                    pretitle.push(section);
                } else if (subsection) {
                    pretitle.push(section);
                    pretitle.push(subsection);
                } else {
                    pretitle.push(section);
                }

                const titleWords: Array<string> = [ ];
                if (fragment.title) {
                    let title = fragment.title.textContent.trim();
                    if (title) {
                        if (summary.title != null && summary.blocks.length) {
                            summaries.push(summary);
                            summary = { title: null, blocks: [ ] };
                        }
                        pretitle.push(title);
                        summary.title = pretitle.join(" -- ");

                        title.replace(/([a-z][a-z0-9]+)/ig, (all, word) => {

                            // Get each component of a camel case word
                            const camelCases = word.split(/(^[a-z]|[A-Z])/);
                            if (camelCases.length > 3 && word.toUpperCase() !== word) {
                                for (let i = 1; i < camelCases.length; i += 2) {
                                    const word = (camelCases[i] + camelCases[i + 1]).toLowerCase();
                                    if (titleWords.indexOf(word) === -1) { titleWords.push(word); }
                                }
                                if (fragment.tag !== FragmentType.CODE) {
                                    compound[word] = true;
                                }
                            }

                            word = word.toLowerCase();
                            if (titleWords.indexOf(word) === -1) { titleWords.push(word); }

                            return "";
                        });
                    }
                }
                if (fragment.link) {
                    // Link directly to this fragment
                    link = (page.path + "#" + fragment.link);
                } else {
                    const parent = fragment.parent;
                    if (parent && parent.link) {
                        // Link to our section/subsection/heading
                        link = (page.path + "#" + parent.link);
                    } else {
                        // Link to our page (better than nothing)
                        link = page.path;
                    }
                }

                let baseTag:string = null;

                fragment.body.forEach((node, index) => {
                    node.textContent.split(/\.( |$)/).forEach((sentence) => {
                        const text = sentence.trim() + ".";
                        if (text === ".") { return; }
                        summary.blocks.push({ link, text });

                        sentence.replace(/([a-z][a-z0-9]+)/ig, (all, word) => {
                            word = "_" + word.toLowerCase();

                            // The tag to the summary block
                            const tag = `${ summaries.length }/${ summary.blocks.length - 1 }`
                            if (baseTag == null) { baseTag = tag; }

                            // Link the word to the tag
                            if (indices[word] == null) { indices[word] = [ ]; }
                            if (indices[word].indexOf(tag) === -1) {
                                indices[word].push(tag);
                            }

                            return "";
                        });
                    });
                });

                // Link the first paragraph to each word in the title
                if (baseTag) {
                    titleWords.forEach((word) => {
                        word = "_" + word;
                        if (indices[word] == null) { indices[word] = [ ]; }
                        if (indices[word].indexOf(baseTag) === -1) { indices[word].push(baseTag); }
                    });
                }
            });

            if (summary.title != null && summary.blocks.length) {
                summaries.push(summary);
            }

        });
    }
*/

    render(): Array<OutputFile> {
        const rewrite = (filename: string) => {
            return this.resolveLink(filename).substring(1);
        };

        // Summary of each paragraph
        const summaries: Array<Summary> = [ ];
        const indices: { [ keyword: string ]: Array<string> } = { };
        const compound: Record<string, boolean> = { };

        let section: Section = this.document.sections[0];
        let wordCount = 0;
        let link = "";
        let summary: Summary = { title: "", blocks: [ ] };

        const addWord = (word: string, tag: string) => {
            // Words that collide with JavaScript built-ins
            // (such as `prototype` can cause problems, so
            // we add an underscore to keep things safe.
            word = "_" + word.toLowerCase();

            if (!indices[word]) { indices[word] = [ ]; }
            indices[word].push(tag);
        };

        const addBody = (body: Array<Content>) => {
            for (const p of body) {
                if (p instanceof CodeContent) { continue; }
                for (let text of p.text.split(/\.\s+/g)) {
                    text = text.trim() + ".";
                    if (text === ".") { continue; }

                    let localLink = link;
                    if (!localLink) {
                        localLink = `${ this.resolveLink(section.path) }#${ p.anchor }`;
                    }

                    summary.blocks.push({ link: localLink, text });

                    text.replace(/([a-z][a-z0-9]+)/ig, (all, word) => {
                        // After more than 100 words into a section, stop
                        // linking to the top of the section and link to
                        // the closest paragraph
                        wordCount++;
                        if (wordCount > 100) { link = null; }

                        //const tag = `${ summaries.length - 1 }/${ summary.blocks.length - 1 }`
                        const tag = toTag(summaries.length - 1, summary.blocks.length - 1);

                        addWord(word, tag);

                        return "";
                    });
                }
            }
        };

        const getTitle = (sec: SectionWithBody) => {
            const title = [ sec.title ];
            let cur = sec;
            while (cur.parent) {
                cur = cur.parent;
                title.unshift(cur.title)
            }
            return title.join(" -- ");
        };

        const addSection = (sec: SectionWithBody) => {
            try {
                link = this.resolveLink(sec.path);
            } catch (error) {
                link = null;
            }

            const blocks: Array<SummaryBlock> = [ ];
            summary = { title: getTitle(sec), blocks };
            summaries.push(summary);
            const baseTag = toTag(summaries.length - 1, 0);

            // Add each title work
            const titleWords: Array<string> = [ ];
            sec.title.replace(/([a-z][a-z0-9]+)/ig, (all, word) => {

                // Get each word of a camel case value
                const camelCases = word.split(/(^[a-z]|[A-Z])/);
                if (camelCases.length > 3 && word.toUpperCase() !== word) {
                    for (let i = 1; i < camelCases.length; i += 2) {
                        const word = (camelCases[i] + camelCases[i + 1]).toLowerCase();
                        if (titleWords.indexOf(word) === -1) { titleWords.push(word); }
                    }

                    compound[word] = true;
                }

                word = word.toLowerCase();
                if (titleWords.indexOf(word) === -1) { titleWords.push(word); }

                return "";
            });

            addBody(sec.body);
            sec.children.forEach(addSection);

            // Link words in a title to the first summary block
            if (blocks.length) {
                titleWords.forEach((word) => { addWord(word, baseTag); });
            }
        };

        for (const sec of this.document) {
            section = sec;
            wordCount = 0;
            addSection(sec);
        }

        const search = {
            version: "0.1",
            summaries: summaries,
            compound: Object.keys(compound).sort(),
            indices: Object.keys(indices).reduce((accum, key) => {
                accum[key] = indices[key].join(",")
                return accum;
            }, <Record<string, string>>{ })
        };

        return [ {
            filename: rewrite("search.json"),
            content: JSON.stringify(search)
        } ];
    }
}
