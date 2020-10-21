import { CodeFragment, Document, FragmentType } from "./document";

import { File, Renderer } from "./renderer";

export type SummaryBlock = {
    link: string;
    text: string;
};

export type Summary = {
    title: string;
    blocks: Array<SummaryBlock>;
};

export class SearchRenderer extends Renderer {
    constructor(filename?: string) {
        super(filename || "search.json");
    }

    renderDocument(document: Document): Array<File> {
        const summaries: Array<Summary> = [ ];
        const indices: { [ keyword: string ]: Array<string> } = { };

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

                if (fragment.title) {
                    let title = fragment.title.textContent.trim();
                    if (title) {
                        if (summary.title != null && summary.blocks.length) {
                            summaries.push(summary);
                            summary = { title: null, blocks: [ ] };
                        }
                        pretitle.push(title);
                        summary.title = pretitle.join(" -- ");
                    }
                }
                if (fragment.link) {
                    link = (page.path + "#" + fragment.link);
                }
                fragment.body.forEach((node) => {
                    node.textContent.split(/\.( |$)/).forEach((sentence) => {
                        const text = sentence.trim() + ".";
                        if (text === ".") { return; }
                        summary.blocks.push({ link, text });

                        const dedup: { [ word: string ]: boolean } = { };
                        sentence.replace(/([a-z][a-z0-9]+)/ig, (all, word) => {
                            word = "_" + word.toLowerCase();
                            if (indices[word] == null) { indices[word] = [ ]; }
                            if (!dedup[word]) {
                                indices[word].push(`${ summaries.length }/${ summary.blocks.length - 1 }`);
                                dedup[word] = true;
                            }

                            return "";
                        });
                    });
                });
            });

            if (summary.title != null && summary.blocks.length) {
                summaries.push(summary);
            }

        });


        const search = {
            version: "0.1",
            summaries: summaries,
            indices: indices
        };

        //console.log(search);

        return [ {
            filename: document.config.getPath("/" + this.filename).substring(1),
            content: JSON.stringify(search)
        } ];
    }
}
