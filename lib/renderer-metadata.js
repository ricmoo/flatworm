import { Renderer } from "./renderer";
export class MetadataRenderer extends Renderer {
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
//# sourceMappingURL=renderer-metadata.js.map