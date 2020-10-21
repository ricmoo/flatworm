"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const document_1 = require("./document");
const renderer_1 = require("./renderer");
class SearchRenderer extends renderer_1.Renderer {
    constructor(filename) {
        super(filename || "search.json");
    }
    renderDocument(document) {
        const summaries = [];
        const indices = {};
        let section = null;
        let subsection = null;
        document.pages.forEach((page) => {
            let summary = { title: null, blocks: [] };
            let link = null;
            page.fragments.forEach((fragment) => {
                if (fragment instanceof document_1.CodeFragment) {
                    return;
                }
                const pretitle = [];
                if (fragment.tag === document_1.FragmentType.SECTION) {
                    section = fragment.title.textContent;
                }
                else if (fragment.tag === document_1.FragmentType.SUBSECTION) {
                    subsection = fragment.title.textContent;
                    pretitle.push(section);
                }
                else if (subsection) {
                    pretitle.push(section);
                    pretitle.push(subsection);
                }
                else {
                    pretitle.push(section);
                }
                const titleWords = [];
                if (fragment.title) {
                    let title = fragment.title.textContent.trim();
                    if (title) {
                        if (summary.title != null && summary.blocks.length) {
                            summaries.push(summary);
                            summary = { title: null, blocks: [] };
                        }
                        pretitle.push(title);
                        summary.title = pretitle.join(" -- ");
                        title.replace(/([a-z][a-z0-9]+)/ig, (all, word) => {
                            // Get each component of a camel case word
                            const camelCases = word.split(/(^[a-z]|[A-Z])/);
                            if (camelCases.length > 3) {
                                for (let i = 1; i < camelCases.length; i += 2) {
                                    const word = (camelCases[i] + camelCases[i + 1]).toLowerCase();
                                    if (titleWords.indexOf(word) === -1) {
                                        titleWords.push(word);
                                    }
                                }
                            }
                            word = word.toLowerCase();
                            if (titleWords.indexOf(word) === -1) {
                                titleWords.push(word);
                            }
                            return "";
                        });
                    }
                }
                if (fragment.link) {
                    // Link directly to this fragment
                    link = (page.path + "#" + fragment.link);
                }
                else {
                    const parent = fragment.parent;
                    if (parent && parent.link) {
                        // Link to our section/subsection/heading
                        link = (page.path + "#" + parent.link);
                    }
                    else {
                        // Link to our page (better than nothing)
                        link = page.path;
                    }
                }
                let baseTag = null;
                fragment.body.forEach((node, index) => {
                    node.textContent.split(/\.( |$)/).forEach((sentence) => {
                        const text = sentence.trim() + ".";
                        if (text === ".") {
                            return;
                        }
                        summary.blocks.push({ link, text });
                        sentence.replace(/([a-z][a-z0-9]+)/ig, (all, word) => {
                            word = "_" + word.toLowerCase();
                            // The tag to the summary block
                            const tag = `${summaries.length}/${summary.blocks.length - 1}`;
                            if (baseTag == null) {
                                baseTag = tag;
                            }
                            // Link the word to the tag
                            if (indices[word] == null) {
                                indices[word] = [];
                            }
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
                        if (indices[word] == null) {
                            indices[word] = [];
                        }
                        if (indices[word].indexOf(baseTag) === -1) {
                            indices[word].push(baseTag);
                        }
                    });
                }
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
        return [{
                filename: document.config.getPath("/" + this.filename).substring(1),
                content: JSON.stringify(search)
            }];
    }
}
exports.SearchRenderer = SearchRenderer;
