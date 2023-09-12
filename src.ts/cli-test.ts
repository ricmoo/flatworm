import fs from "fs";
import { dirname, join, resolve } from "path";

import JSZip from "jszip";

import { HtmlRenderer } from "./renderer-html.js";
import { SearchRenderer } from "./renderer-search.js";

import { Config } from "./config.js";
import { Document } from "./document.js";

(async function() {
    const path = resolve(process.argv[2]);
    const config = await Config.fromPath(path);

    const doc = Document.fromConfig(config);
    await doc.populateMtime();
    await doc.evaluate();

    /*
    //console.dir(doc, { depth: null });
    for (const section of doc) {
        const title = section.title;
        const anchor = section.anchor;
        const path = section.path;
        const text = section.text;
        console.log("SECTION:", { title, anchor, path, text });
        for (const sub of section) {
            const title = sub.title;
            const anchor = sub.anchor;
            const path = sub.anchor ? sub.path: null;
            const text = sub.text;
            if (sub instanceof Exported) {
                console.log("  API:", { title, anchor, path, text });
            } else {
                console.log("  SUB:", { title, anchor, path, text });
                for (const c of sub) {
                    const title = c.title;
                    const anchor = c.anchor;
                    const text = c.text;
                    if (c instanceof Exported) {
                        console.log("    API:", { title, anchor, text });
                    } else {
                        console.log("    CON:", { title, anchor, text });
                    }
                }
            }
        }
    }
    */

    const zip = new JSZip();

    const renderer = new HtmlRenderer(doc);
    for (let { filename, content } of renderer.render()) {
        if (filename.indexOf(".") === -1) { filename = join(filename, "index.html"); }
        zip.file(join("docs", filename), content);
        filename = resolve("output/docs/", filename);
        fs.mkdirSync(dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
    }

    const searchRenderer = new SearchRenderer(doc);
    for (let { filename, content } of searchRenderer.render()) {
        zip.file(join("docs", filename), content);
        filename = resolve("output/docs/", filename);
        fs.writeFileSync(filename, content);
    }

    fs.writeFileSync(`output/docs${ config.prefix }/all-docs.zip`, await zip.generateAsync({
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
        type: "uint8array"
    }));

})();
