/*
import { Document } from "./document";

import { File, Renderer } from "./renderer";

export class MetadataRenderer extends Renderer {
    constructor(filename?: string) {
        super(filename || "metadata.json");
    }

    renderDocument(document: Document): Array<File> {
        const links: { [ name: string ]: string } = { };
        document.names.forEach((name) => {
            links[name] = document.getLinkUrl(name);
        });
        const metadata = {
            version: "0.1",
            links: links
        };

        return [ {
            filename: document.config.getPath("/" + this.filename).substring(1),
            content: JSON.stringify(metadata)
        } ];
    }
}
*/
