//import { CodeFragment, Document, FragmentType } from "./document";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _SearchBuilder_instances, _SearchBuilder_summaries, _SearchBuilder_indices, _SearchBuilder_compound, _SearchBuilder_addIndex;
export class SearchBuilder {
    constructor() {
        _SearchBuilder_instances.add(this);
        // Each summary for a search result.
        // All words within a body will link to the same SummaryBlock.
        _SearchBuilder_summaries.set(this, void 0);
        // Maps each word to a tag of the format SUMMARY_INDEX/BLOCK_INDEX
        _SearchBuilder_indices.set(this, void 0);
        // List of compound words. When searching, these words are used
        // to find other relevant terms.
        // For example, the compount word "gasPrice" will cause a search for
        // "gasprice" to search to include "gasPrice", "gas" and "price".
        _SearchBuilder_compound.set(this, void 0);
        __classPrivateFieldSet(this, _SearchBuilder_summaries, [], "f");
        __classPrivateFieldSet(this, _SearchBuilder_indices, new Map(), "f");
        __classPrivateFieldSet(this, _SearchBuilder_compound, new Set(), "f");
        console.log(__classPrivateFieldGet(this, _SearchBuilder_summaries, "f"), __classPrivateFieldGet(this, _SearchBuilder_indices, "f"), __classPrivateFieldGet(this, _SearchBuilder_compound, "f"));
    }
    add(titles, link, body) {
        console.log("SEARCH", titles.join(" -- "), link);
        __classPrivateFieldGet(this, _SearchBuilder_instances, "m", _SearchBuilder_addIndex).call(this, "word", "target");
    }
}
_SearchBuilder_summaries = new WeakMap(), _SearchBuilder_indices = new WeakMap(), _SearchBuilder_compound = new WeakMap(), _SearchBuilder_instances = new WeakSet(), _SearchBuilder_addIndex = function _SearchBuilder_addIndex(word, target) {
    let targets = __classPrivateFieldGet(this, _SearchBuilder_indices, "f").get(word);
    if (!targets) {
        targets = new Set();
        __classPrivateFieldGet(this, _SearchBuilder_indices, "f").set(word, targets);
    }
    targets.add(target);
};
//# sourceMappingURL=search.js.map