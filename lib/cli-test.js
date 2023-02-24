var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fs from "fs";
import { dirname, join, resolve } from "path";
import { HtmlRenderer } from "./renderer-html.js";
import { SearchRenderer } from "./renderer-search.js";
import { Config } from "./config.js";
import { Document, Exported } from "./document.js";
(function () {
    return __awaiter(this, void 0, void 0, function* () {
        const path = resolve(process.argv[2]);
        const config = yield Config.fromPath(path);
        const doc = Document.fromConfig(config);
        yield doc.populateMtime();
        yield doc.evaluate();
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
                const path = sub.anchor ? sub.path : null;
                const text = sub.text;
                if (sub instanceof Exported) {
                    console.log("  API:", { title, anchor, path, text });
                }
                else {
                    console.log("  SUB:", { title, anchor, path, text });
                    for (const c of sub) {
                        const title = c.title;
                        const anchor = c.anchor;
                        const text = c.text;
                        if (c instanceof Exported) {
                            console.log("    API:", { title, anchor, text });
                        }
                        else {
                            console.log("    CON:", { title, anchor, text });
                        }
                    }
                }
            }
        }
        const renderer = new HtmlRenderer(doc);
        for (let { filename, content } of renderer.render()) {
            if (filename.indexOf(".") === -1) {
                filename = join(filename, "index.html");
            }
            filename = resolve("output/docs/", filename);
            fs.mkdirSync(dirname(filename), { recursive: true });
            fs.writeFileSync(filename, content);
        }
        const searchRenderer = new SearchRenderer(doc);
        for (let { filename, content } of searchRenderer.render()) {
            filename = resolve("output/docs/", filename);
            fs.writeFileSync(filename, content);
        }
    });
})();
//# sourceMappingURL=cli-test.js.map