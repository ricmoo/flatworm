import fs from "fs";
import { dirname, join, resolve } from "path";

import { HtmlRenderer } from "./renderer-html.js";

import { Config } from "./config.js";
import { Document, Exported } from "./document.js";

(async function() {
    const path = resolve(process.argv[2]);
    const config = await Config.fromPath(path);

    const doc = Document.fromConfig(config);
    await doc.populateMtime();

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

//    await doc.evaluate();

    const renderer = new HtmlRenderer(doc);
    for (let { filename, content } of renderer.render()) {
        if (filename.indexOf(".") === -1) { filename = join(filename, "index.html"); }
        filename = resolve("output/test/", filename);
        fs.mkdirSync(dirname(filename), { recursive: true });
        fs.writeFileSync(filename, content);
    }

//    generate(api, doc, config);
})();
