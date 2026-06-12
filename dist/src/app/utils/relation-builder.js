"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relationBuilder = void 0;
const relationBuilder = (query, key) => {
    if (!query) {
        return undefined;
    }
    const withQuery = query.with;
    const x = typeof withQuery === 'string' ? [withQuery] : withQuery;
    return Array.isArray(x) && x.includes(key) ? true : false;
};
exports.relationBuilder = relationBuilder;
