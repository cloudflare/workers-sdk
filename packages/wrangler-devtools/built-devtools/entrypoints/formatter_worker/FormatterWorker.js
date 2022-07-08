/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as Acorn from '../../third_party/acorn/acorn.js';
import { AcornTokenizer, ECMA_VERSION } from './AcornTokenizer.js';
import { CSSFormatter } from './CSSFormatter.js';
import { ESTreeWalker } from './ESTreeWalker.js';
import { FormattedContentBuilder } from './FormattedContentBuilder.js';
import { HTMLFormatter } from './HTMLFormatter.js';
import { IdentityFormatter } from './IdentityFormatter.js';
import { JavaScriptFormatter } from './JavaScriptFormatter.js';
import { JSONFormatter } from './JSONFormatter.js';
import { substituteExpression } from './Substitute.js';
export function createTokenizer(mimeType) {
    const mode = CodeMirror.getMode({ indentUnit: 2 }, mimeType);
    const state = CodeMirror.startState(mode);
    if (!mode || mode.name === 'null') {
        throw new Error(`Could not find CodeMirror mode for MimeType: ${mimeType}`);
    }
    if (!mode.token) {
        throw new Error(`Could not find CodeMirror mode with token method: ${mimeType}`);
    }
    return (line, callback) => {
        const stream = new CodeMirror.StringStream(line);
        while (!stream.eol()) {
            // @ts-expect-error TypeScript can't determine that `mode.token` is defined based on lines above
            const style = mode.token(stream, state);
            const value = stream.current();
            if (callback(value, style, stream.start, stream.start + value.length) === AbortTokenization) {
                return;
            }
            stream.start = stream.pos;
        }
    };
}
export const AbortTokenization = {};
export function evaluatableJavaScriptSubstring(content) {
    try {
        const tokenizer = Acorn.tokenizer(content, { ecmaVersion: ECMA_VERSION });
        let token = tokenizer.getToken();
        while (AcornTokenizer.punctuator(token)) {
            token = tokenizer.getToken();
        }
        const startIndex = token.start;
        let endIndex = token.end;
        while (token.type !== Acorn.tokTypes.eof) {
            const isIdentifier = token.type === Acorn.tokTypes.name || token.type === Acorn.tokTypes.privateId;
            const isThis = AcornTokenizer.keyword(token, 'this');
            const isString = token.type === Acorn.tokTypes.string;
            if (!isThis && !isIdentifier && !isString) {
                break;
            }
            endIndex = token.end;
            token = tokenizer.getToken();
            while (AcornTokenizer.punctuator(token, '[')) {
                let openBracketCounter = 0;
                do {
                    if (AcornTokenizer.punctuator(token, '[')) {
                        ++openBracketCounter;
                    }
                    token = tokenizer.getToken();
                    if (AcornTokenizer.punctuator(token, ']')) {
                        if (--openBracketCounter === 0) {
                            endIndex = token.end;
                            token = tokenizer.getToken();
                            break;
                        }
                    }
                } while (token.type !== Acorn.tokTypes.eof);
            }
            if (!AcornTokenizer.punctuator(token, '.')) {
                break;
            }
            token = tokenizer.getToken();
        }
        return content.substring(startIndex, endIndex);
    }
    catch (e) {
        console.error(e);
        return '';
    }
}
export function javaScriptIdentifiers(content) {
    let root = null;
    try {
        root = Acorn.parse(content, { ecmaVersion: ECMA_VERSION, ranges: false });
    }
    catch (e) {
    }
    const identifiers = [];
    const walker = new ESTreeWalker(beforeVisit);
    function isFunction(node) {
        return node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' ||
            node.type === 'ArrowFunctionExpression';
    }
    function beforeVisit(node) {
        if (isFunction(node)) {
            if (node.id) {
                identifiers.push(node.id);
            }
            return ESTreeWalker.SkipSubtree;
        }
        if (node.type !== 'Identifier') {
            return;
        }
        if (node.parent && node.parent.type === 'MemberExpression') {
            const parent = node.parent;
            if (parent.property === node && !parent.computed) {
                return;
            }
        }
        identifiers.push(node);
        return;
    }
    if (!root || root.type !== 'Program' || root.body.length !== 1 || !isFunction(root.body[0])) {
        return [];
    }
    const functionNode = root.body[0];
    for (const param of functionNode.params) {
        walker.walk(param);
    }
    walker.walk(functionNode.body);
    return identifiers.map(id => ({ name: 'name' in id && id.name || undefined, offset: id.start }));
}
export function format(mimeType, text, indentString) {
    // Default to a 4-space indent.
    indentString = indentString || '    ';
    let result;
    const builder = new FormattedContentBuilder(indentString);
    const lineEndings = Platform.StringUtilities.findLineEndingIndexes(text);
    try {
        switch (mimeType) {
            case 'text/html': {
                const formatter = new HTMLFormatter(builder);
                formatter.format(text, lineEndings);
                break;
            }
            case 'text/x-scss':
            case 'text/css': {
                const formatter = new CSSFormatter(builder);
                formatter.format(text, lineEndings, 0, text.length);
                break;
            }
            case 'text/javascript':
            case 'application/javascript': {
                const formatter = new JavaScriptFormatter(builder);
                formatter.format(text, lineEndings, 0, text.length);
                break;
            }
            case 'application/json': {
                const formatter = new JSONFormatter(builder);
                formatter.format(text, lineEndings, 0, text.length);
                break;
            }
            default: {
                const formatter = new IdentityFormatter(builder);
                formatter.format(text, lineEndings, 0, text.length);
            }
        }
        result = {
            mapping: builder.mapping,
            content: builder.content(),
        };
    }
    catch (e) {
        console.error(e);
        result = {
            mapping: { original: [0], formatted: [0] },
            content: text,
        };
    }
    return result;
}
export function argumentsList(content) {
    if (content.length > 10000) {
        return [];
    }
    let parsed = null;
    try {
        parsed = Acorn.parse(`(${content})`, { ecmaVersion: ECMA_VERSION });
    }
    catch (e) {
    }
    if (!parsed) {
        try {
            parsed = Acorn.parse(`({${content}})`, { ecmaVersion: ECMA_VERSION });
        }
        catch (e) {
        }
    }
    if (!parsed || !('body' in parsed) || !Array.isArray(parsed.body) || !parsed.body[0] ||
        !('expression' in parsed.body[0])) {
        return [];
    }
    const expression = parsed.body[0].expression;
    let params = null;
    switch (expression.type) {
        case 'ClassExpression': {
            if (!expression.body.body) {
                break;
            }
            const constructor = expression.body.body.find(method => method.type === 'MethodDefinition' && method.kind === 'constructor');
            if (constructor) {
                params = constructor.value.params;
            }
            break;
        }
        case 'ObjectExpression': {
            if (!expression.properties[0] || !('value' in expression.properties[0]) ||
                !('params' in expression.properties[0].value)) {
                break;
            }
            params = expression.properties[0].value.params;
            break;
        }
        case 'FunctionExpression':
        case 'ArrowFunctionExpression': {
            params = expression.params;
            break;
        }
    }
    if (!params) {
        return [];
    }
    return params.map(paramName);
    function paramName(param) {
        switch (param.type) {
            case 'Identifier':
                return param.name;
            case 'AssignmentPattern':
                return '?' + paramName(param.left);
            case 'ObjectPattern':
                return 'obj';
            case 'ArrayPattern':
                return 'arr';
            case 'RestElement':
                return '...' + paramName(param.argument);
        }
        return '?';
    }
}
(function disableLoggingForTest() {
    if (Root.Runtime.Runtime.queryParam('test')) {
        console.error = () => undefined;
    }
})();
export { substituteExpression };
//# sourceMappingURL=FormatterWorker.js.map