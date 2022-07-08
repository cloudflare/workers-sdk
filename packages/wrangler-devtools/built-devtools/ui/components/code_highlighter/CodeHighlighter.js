// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
const t = CodeMirror.tags;
export const highlightStyle = CodeMirror.HighlightStyle.define([
    { tag: t.variableName, class: 'token-variable' },
    { tag: t.propertyName, class: 'token-property' },
    { tag: [t.typeName, t.className, t.namespace, t.macroName], class: 'token-type' },
    { tag: [t.special(t.name), t.constant(t.className)], class: 'token-variable-special' },
    { tag: t.definition(t.name), class: 'token-definition' },
    { tag: t.standard(t.variableName), class: 'token-builtin' },
    { tag: [t.number, t.literal, t.unit], class: 'token-number' },
    { tag: t.string, class: 'token-string' },
    { tag: [t.special(t.string), t.regexp, t.escape], class: 'token-string-special' },
    { tag: [t.atom, t.labelName, t.bool], class: 'token-atom' },
    { tag: t.keyword, class: 'token-keyword' },
    { tag: [t.comment, t.quote], class: 'token-comment' },
    { tag: t.meta, class: 'token-meta' },
    { tag: t.invalid, class: 'token-invalid' },
    { tag: t.tagName, class: 'token-tag' },
    { tag: t.attributeName, class: 'token-attribute' },
    { tag: t.attributeValue, class: 'token-attribute-value' },
    { tag: t.inserted, class: 'token-inserted' },
    { tag: t.deleted, class: 'token-deleted' },
    { tag: t.heading, class: 'token-heading' },
    { tag: t.link, class: 'token-link' },
    { tag: t.strikethrough, class: 'token-strikethrough' },
    { tag: t.strong, class: 'token-strong' },
    { tag: t.emphasis, class: 'token-emphasis' },
]);
export async function create(code, mimeType) {
    const language = await languageFromMIME(mimeType);
    let tree;
    if (language) {
        tree = language.language.parser.parse(code);
    }
    else {
        tree = new CodeMirror.Tree(CodeMirror.NodeType.none, [], [], code.length);
    }
    return new CodeHighlighter(code, tree);
}
export async function highlightNode(node, mimeType) {
    const code = node.textContent || '';
    const highlighter = await create(code, mimeType);
    node.removeChildren();
    highlighter.highlight((text, style) => {
        let token = document.createTextNode(text);
        if (style) {
            const span = document.createElement('span');
            span.className = style;
            span.appendChild(token);
            token = span;
        }
        node.appendChild(token);
    });
}
export async function languageFromMIME(mimeType) {
    switch (mimeType) {
        case 'text/javascript':
            return CodeMirror.javascript.javascript();
        case 'text/jsx':
            return CodeMirror.javascript.javascript({ jsx: true });
        case 'text/typescript':
            return CodeMirror.javascript.javascript({ typescript: true });
        case 'text/typescript-jsx':
            return CodeMirror.javascript.javascript({ typescript: true, jsx: true });
        case 'text/css':
        case 'text/x-scss':
            return CodeMirror.css.css();
        case 'text/html':
            return CodeMirror.html.html();
        case 'application/xml':
            return (await CodeMirror.xml()).xml();
        case 'text/webassembly':
            return (await CodeMirror.wast()).wast();
        case 'text/x-c++src':
            return (await CodeMirror.cpp()).cpp();
        case 'text/x-java':
            return (await CodeMirror.java()).java();
        case 'application/json':
            return (await CodeMirror.json()).json();
        case 'application/x-httpd-php':
            return (await CodeMirror.php()).php();
        case 'text/x-python':
            return (await CodeMirror.python()).python();
        case 'text/markdown':
            return (await CodeMirror.markdown()).markdown();
        case 'text/x-sh':
            return new CodeMirror.LanguageSupport(await CodeMirror.shell());
        case 'text/x-coffeescript':
            return new CodeMirror.LanguageSupport(await CodeMirror.coffeescript());
        case 'text/x-clojure':
            return new CodeMirror.LanguageSupport(await CodeMirror.clojure());
        default:
            return null;
    }
}
export class CodeHighlighter {
    code;
    tree;
    constructor(code, tree) {
        this.code = code;
        this.tree = tree;
    }
    highlight(token) {
        this.highlightRange(0, this.code.length, token);
    }
    highlightRange(from, to, token) {
        let pos = from;
        const flush = (to, style) => {
            if (to > pos) {
                token(this.code.slice(pos, to), style);
                pos = to;
            }
        };
        CodeMirror.highlightTree(this.tree, highlightStyle, (from, to, style) => {
            flush(from, '');
            flush(to, style);
        }, from, to);
        flush(to, '');
    }
}
//# sourceMappingURL=CodeHighlighter.js.map