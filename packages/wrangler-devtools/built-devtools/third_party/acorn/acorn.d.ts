import * as acorn from './package/dist/acorn.mjs';
import type * as ESTree from './estree-legacy.js';
export { ESTree };
export { type Comment, defaultOptions, getLineInfo, isNewLine, lineBreak, lineBreakG, Node, SourceLocation, Token, tokTypes, tokContexts } from './package/dist/acorn.mjs';
export declare const Parser: typeof acorn.Parser;
export declare const tokenizer: (input: string, options: acorn.Options) => {
    getToken(): acorn.Token;
    [Symbol.iterator](): Iterator<acorn.Token, any, undefined>;
};
export declare const parse: (input: string, options: acorn.Options) => acorn.Node;
