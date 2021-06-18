"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataRenderer = void 0;
const renderer_1 = require("./renderer");
class MetadataRenderer extends renderer_1.Renderer {
    constructor(filename) {
        super(filename || "metadata.json");
    }
    renderDocument(document) {
        const links = {};
        document.names.forEach((name) => {
            links[name] = document.getLinkUrl(name);
        });
        const metadata = {
            version: "0.1",
            links: links
        };
        return [{
                filename: document.config.getPath("/" + this.filename).substring(1),
                content: JSON.stringify(metadata)
            }];
    }
}
exports.MetadataRenderer = MetadataRenderer;
