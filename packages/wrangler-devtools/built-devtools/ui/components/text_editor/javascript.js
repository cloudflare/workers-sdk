// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../core/sdk/sdk.js';
import * as Formatter from '../../../models/formatter/formatter.js';
import * as JavaScriptMetaData from '../../../models/javascript_metadata/javascript_metadata.js';
import * as CodeMirror from '../../../third_party/codemirror.next/codemirror.next.js';
import * as UI from '../../legacy/legacy.js';
import { closeTooltip, cursorTooltip } from './cursor_tooltip.js';
export function completion() {
    return CodeMirror.javascript.javascriptLanguage.data.of({
        autocomplete: javascriptCompletionSource,
    });
}
export async function completeInContext(textBefore, query, force = false) {
    const state = CodeMirror.EditorState.create({
        doc: textBefore + query,
        selection: { anchor: textBefore.length },
        extensions: CodeMirror.javascript.javascriptLanguage,
    });
    const result = await javascriptCompletionSource(new CodeMirror.CompletionContext(state, state.doc.length, force));
    return result ?
        result.options.filter((o) => o.label.startsWith(query)).map((o) => ({
            text: o.label,
            priority: 100 + (o.boost || 0),
            isSecondary: o.type === 'secondary',
        })) :
        [];
}
class CompletionSet {
    completions;
    seen;
    constructor(completions = [], seen = new Set()) {
        this.completions = completions;
        this.seen = seen;
    }
    add(completion) {
        if (!this.seen.has(completion.label)) {
            this.seen.add(completion.label);
            this.completions.push(completion);
        }
    }
    copy() {
        return new CompletionSet(this.completions.slice(), new Set(this.seen));
    }
}
const javascriptKeywords = [
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'let', 'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw',
    'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
];
const consoleBuiltinFunctions = [
    'clear',
    'copy',
    'debug',
    'dir',
    'dirxml',
    'getEventListeners',
    'inspect',
    'keys',
    'monitor',
    'monitorEvents',
    'profile',
    'profileEnd',
    'queryObjects',
    'table',
    'undebug',
    'unmonitor',
    'unmonitorEvents',
    'values',
];
const consoleBuiltinVariables = ['$', '$$', '$x', '$0', '$_'];
const baseCompletions = new CompletionSet();
for (const kw of javascriptKeywords) {
    baseCompletions.add({ label: kw, type: 'keyword' });
}
for (const builtin of consoleBuiltinFunctions) {
    baseCompletions.add({ label: builtin, type: 'function' });
}
for (const varName of consoleBuiltinVariables) {
    baseCompletions.add({ label: varName, type: 'variable' });
}
const dontCompleteIn = new Set([
    'TemplateString',
    'LineComment',
    'BlockComment',
    'TypeDefinition',
    'VariableDefinition',
    'PropertyDefinition',
    'TypeName',
]);
export function getQueryType(tree, pos, doc) {
    let node = tree.resolveInner(pos, -1);
    const parent = node.parent;
    if (dontCompleteIn.has(node.name)) {
        return null;
    }
    if (node.name === 'PropertyName' || node.name === 'PrivatePropertyName') {
        return parent?.name !== 'MemberExpression' ? null :
            { type: 1 /* PropertyName */, from: node.from, relatedNode: parent };
    }
    if (node.name === 'VariableName' ||
        // Treat alphabetic keywords as variables
        !node.firstChild && node.to - node.from < 20 && !/[^a-z]/.test(doc.sliceString(node.from, node.to))) {
        return { type: 0 /* Expression */, from: node.from };
    }
    if (node.name === 'String') {
        const parent = node.parent;
        return parent?.name === 'MemberExpression' && parent.childBefore(node.from)?.name === '[' ?
            { type: 2 /* PropertyExpression */, from: node.from, relatedNode: parent } :
            null;
    }
    // Enter unfinished nodes before the position.
    node = node.enterUnfinishedNodesBefore(pos);
    // Normalize to parent node when pointing after a child of a member expr.
    if (node.to === pos && node.parent?.name === 'MemberExpression') {
        node = node.parent;
    }
    if (node.name === 'MemberExpression') {
        const before = node.childBefore(Math.min(pos, node.to));
        if (before?.name === '[') {
            return { type: 2 /* PropertyExpression */, relatedNode: node };
        }
        if (before?.name === '.' || before?.name === '?.') {
            return { type: 1 /* PropertyName */, relatedNode: node };
        }
    }
    if (node.name === '(') {
        // map.get(<auto-complete>
        if (parent?.name === 'ArgList' && parent?.parent?.name === 'CallExpression') {
            // map.get
            const callReceiver = parent?.parent?.firstChild;
            if (callReceiver?.name === 'MemberExpression') {
                // get
                const propertyExpression = callReceiver?.lastChild;
                if (propertyExpression && doc.sliceString(propertyExpression.from, propertyExpression.to) === 'get') {
                    // map
                    const potentiallyMapObject = callReceiver?.firstChild;
                    return { type: 3 /* PotentiallyRetrievingFromMap */, relatedNode: potentiallyMapObject || undefined };
                }
            }
        }
    }
    return { type: 0 /* Expression */ };
}
export async function javascriptCompletionSource(cx) {
    const query = getQueryType(CodeMirror.syntaxTree(cx.state), cx.pos, cx.state.doc);
    if (!query || query.from === undefined && !cx.explicit && query.type === 0 /* Expression */) {
        return null;
    }
    let result;
    let quote = undefined;
    if (query.type === 0 /* Expression */) {
        const [scope, global] = await Promise.all([
            completeExpressionInScope(),
            completeExpressionGlobal(),
        ]);
        if (scope.completions.length) {
            result = scope;
            for (const r of global.completions) {
                result.add(r);
            }
        }
        else {
            result = global;
        }
    }
    else if (query.type === 1 /* PropertyName */ || query.type === 2 /* PropertyExpression */) {
        const objectExpr = query.relatedNode.getChild('Expression');
        if (query.type === 2 /* PropertyExpression */) {
            quote = query.from === undefined ? '\'' : cx.state.sliceDoc(query.from, query.from + 1);
        }
        if (!objectExpr) {
            return null;
        }
        result = await completeProperties(cx.state.sliceDoc(objectExpr.from, objectExpr.to), quote, cx.state.sliceDoc(cx.pos, cx.pos + 1) === ']');
    }
    else if (query.type === 3 /* PotentiallyRetrievingFromMap */) {
        const potentialMapObject = query.relatedNode;
        if (!potentialMapObject) {
            return null;
        }
        result = await maybeCompleteKeysFromMap(cx.state.sliceDoc(potentialMapObject.from, potentialMapObject.to));
    }
    else {
        return null;
    }
    return {
        from: query.from ?? cx.pos,
        options: result.completions,
        validFor: !quote ? SPAN_IDENT : quote === '\'' ? SPAN_SINGLE_QUOTE : SPAN_DOUBLE_QUOTE,
    };
}
const SPAN_IDENT = /^#?(?:[$_\p{ID_Start}])(?:[$_\u200C\u200D\p{ID_Continue}])*$/u, SPAN_SINGLE_QUOTE = /^\'(\\.|[^\\'\n])*'?$/, SPAN_DOUBLE_QUOTE = /^"(\\.|[^\\"\n])*"?$/;
function getExecutionContext() {
    return UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
}
async function evaluateExpression(context, expression, group) {
    const result = await context.evaluate({
        expression,
        objectGroup: group,
        includeCommandLineAPI: true,
        silent: true,
        returnByValue: false,
        generatePreview: false,
        throwOnSideEffect: true,
        timeout: 500,
    }, false, false);
    if ('error' in result || result.exceptionDetails || !result.object) {
        return null;
    }
    return result.object;
}
const primitivePrototypes = new Map([
    ['string', 'String'],
    ['symbol', 'Symbol'],
    ['number', 'Number'],
    ['boolean', 'Boolean'],
    ['bigint', 'BigInt'],
]);
const maxCacheAge = 30_000;
let cacheInstance = null;
// Store recent collections of property completions. The empty string
// is used to store the set of global bindings.
class PropertyCache {
    #cache = new Map();
    constructor() {
        const clear = () => this.#cache.clear();
        SDK.ConsoleModel.ConsoleModel.instance().addEventListener(SDK.ConsoleModel.Events.CommandEvaluated, clear);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.RuntimeModel.ExecutionContext, clear);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerResumed, clear);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerPaused, clear);
    }
    get(expression) {
        return this.#cache.get(expression);
    }
    set(expression, value) {
        this.#cache.set(expression, value);
        window.setTimeout(() => {
            if (this.#cache.get(expression) === value) {
                this.#cache.delete(expression);
            }
        }, maxCacheAge);
    }
    static instance() {
        if (!cacheInstance) {
            cacheInstance = new PropertyCache();
        }
        return cacheInstance;
    }
}
async function maybeCompleteKeysFromMap(objectVariable) {
    const result = new CompletionSet();
    const context = getExecutionContext();
    if (!context) {
        return result;
    }
    const maybeRetrieveKeys = await evaluateExpression(context, `[...Map.prototype.keys.call(${objectVariable})]`, 'completion');
    if (!maybeRetrieveKeys) {
        return result;
    }
    const properties = SDK.RemoteObject.RemoteArray.objectAsArray(maybeRetrieveKeys);
    const numProperties = properties.length();
    for (let i = 0; i < numProperties; i++) {
        result.add({
            label: `"${(await properties.at(i)).value}")`,
            type: 'constant',
            boost: i * -1,
        });
    }
    return result;
}
async function completeProperties(expression, quoted, hasBracket = false) {
    const cache = PropertyCache.instance();
    if (!quoted) {
        const cached = cache.get(expression);
        if (cached) {
            return cached;
        }
    }
    const context = getExecutionContext();
    if (!context) {
        return new CompletionSet();
    }
    const result = completePropertiesInner(expression, context, quoted, hasBracket);
    if (!quoted) {
        cache.set(expression, result);
    }
    return result;
}
async function completePropertiesInner(expression, context, quoted, hasBracket = false) {
    const result = new CompletionSet();
    if (!context) {
        return result;
    }
    let object = await evaluateExpression(context, expression, 'completion');
    if (!object) {
        return result;
    }
    while (object.type === 'object' && object.subtype === 'proxy') {
        const properties = await object.getOwnProperties(false);
        const innerObject = properties.internalProperties?.find(p => p.name === '[[Target]]')?.value;
        if (!innerObject) {
            break;
        }
        object = innerObject;
    }
    const toPrototype = primitivePrototypes.get(object.type);
    if (toPrototype) {
        object = await evaluateExpression(context, toPrototype + '.prototype', 'completion');
    }
    const functionType = expression === 'globalThis' ? 'function' : 'method';
    const otherType = expression === 'globalThis' ? 'variable' : 'property';
    if (object && (object.type === 'object' || object.type === 'function')) {
        const properties = await object.getAllProperties(
        /* accessorPropertiesOnly */ false, /* generatePreview */ false, /* nonIndexedPropertiesOnly */ true);
        const isFunction = object.type === 'function';
        for (const prop of properties.properties || []) {
            if (!prop.symbol && !(isFunction && (prop.name === 'arguments' || prop.name === 'caller')) &&
                (!prop.private || expression === 'this') && (quoted || SPAN_IDENT.test(prop.name))) {
                const label = quoted ? quoted + prop.name.replaceAll('\\', '\\\\').replaceAll(quoted, '\\' + quoted) + quoted : prop.name;
                const apply = (quoted && !hasBracket) ? `${label}]` : undefined;
                const boost = 2 * Number(prop.isOwn) + 1 * Number(prop.enumerable);
                const type = prop.value?.type === 'function' ? functionType : otherType;
                result.add({ apply, label, type, boost });
            }
        }
    }
    context.runtimeModel.releaseObjectGroup('completion');
    return result;
}
async function completeExpressionInScope() {
    const result = new CompletionSet();
    const selectedFrame = getExecutionContext()?.debuggerModel.selectedCallFrame();
    if (!selectedFrame) {
        return result;
    }
    const frames = await Promise.all(selectedFrame.scopeChain().map(scope => scope.object().getAllProperties(false, false)));
    for (const frame of frames) {
        for (const property of frame.properties || []) {
            result.add({
                label: property.name,
                type: property.value?.type === 'function' ? 'function' : 'variable',
            });
        }
    }
    return result;
}
async function completeExpressionGlobal() {
    const cache = PropertyCache.instance();
    const cached = cache.get('');
    if (cached) {
        return cached;
    }
    const context = getExecutionContext();
    if (!context) {
        return baseCompletions;
    }
    const result = baseCompletions.copy();
    const fetchNames = completePropertiesInner('globalThis', context).then(fromWindow => {
        return context.globalLexicalScopeNames().then(globals => {
            for (const option of fromWindow.completions) {
                result.add(option);
            }
            for (const name of globals || []) {
                result.add({ label: name, type: 'variable' });
            }
            return result;
        });
    });
    cache.set('', fetchNames);
    return fetchNames;
}
export async function isExpressionComplete(expression) {
    const currentExecutionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
    if (!currentExecutionContext) {
        return true;
    }
    const result = await currentExecutionContext.runtimeModel.compileScript(expression, '', false, currentExecutionContext.id);
    if (!result || !result.exceptionDetails || !result.exceptionDetails.exception) {
        return true;
    }
    const description = result.exceptionDetails.exception.description;
    if (description) {
        return !description.startsWith('SyntaxError: Unexpected end of input') &&
            !description.startsWith('SyntaxError: Unterminated template literal');
    }
    return false;
}
export function argumentHints() {
    return cursorTooltip(getArgumentHints);
}
export function closeArgumentsHintsTooltip(view, tooltip) {
    // If the tooltip is currently showing, the state will reflect its properties.
    // If it isn't showing, the state is explicitly set to `null`.
    if (view.state.field(tooltip) === null) {
        return false;
    }
    view.dispatch({ effects: closeTooltip.of(null) });
    return true;
}
async function getArgumentHints(state, pos) {
    const node = CodeMirror.syntaxTree(state).resolveInner(pos).enterUnfinishedNodesBefore(pos);
    if (node.name !== 'ArgList') {
        return null;
    }
    const callee = node.parent?.getChild('Expression');
    if (!callee) {
        return null;
    }
    const argumentList = await getArgumentsForExpression(callee, state.doc);
    if (!argumentList) {
        return null;
    }
    let argumentIndex = 0;
    for (let scanPos = pos;;) {
        const before = node.childBefore(scanPos);
        if (!before) {
            break;
        }
        if (before.type.is('Expression')) {
            argumentIndex++;
        }
        scanPos = before.from;
    }
    return () => tooltipBuilder(argumentList, argumentIndex);
}
async function getArgumentsForExpression(callee, doc) {
    const context = getExecutionContext();
    if (!context) {
        return null;
    }
    const expression = doc.sliceString(callee.from, callee.to);
    const result = await evaluateExpression(context, expression, 'argumentsHint');
    if (!result || result.type !== 'function') {
        return null;
    }
    const objGetter = async () => {
        const first = callee.firstChild;
        if (!first || callee.name !== 'MemberExpression') {
            return null;
        }
        return evaluateExpression(context, doc.sliceString(first.from, first.to), 'argumentsHint');
    };
    return getArgumentsForFunctionValue(result, objGetter, expression)
        .finally(() => context.runtimeModel.releaseObjectGroup('argumentsHint'));
}
async function getArgumentsForFunctionValue(object, receiverObjGetter, functionName) {
    const description = object.description;
    if (!description) {
        return null;
    }
    if (!description.endsWith('{ [native code] }')) {
        return [await Formatter.FormatterWorkerPool.formatterWorkerPool().argumentsList(description)];
    }
    // Check if this is a bound function.
    if (description === 'function () { [native code] }') {
        const fromBound = await getArgumentsForBoundFunction(object);
        if (fromBound) {
            return fromBound;
        }
    }
    const javaScriptMetadata = JavaScriptMetaData.JavaScriptMetadata.JavaScriptMetadataImpl.instance();
    const descriptionRegexResult = /^function ([^(]*)\(/.exec(description);
    const name = descriptionRegexResult && descriptionRegexResult[1] || functionName;
    if (!name) {
        return null;
    }
    const uniqueSignatures = javaScriptMetadata.signaturesForNativeFunction(name);
    if (uniqueSignatures) {
        return uniqueSignatures;
    }
    const receiverObj = await receiverObjGetter();
    if (!receiverObj) {
        return null;
    }
    const className = receiverObj.className;
    if (className) {
        const instanceMethods = javaScriptMetadata.signaturesForInstanceMethod(name, className);
        if (instanceMethods) {
            return instanceMethods;
        }
    }
    // Check for static methods on a constructor.
    if (receiverObj.description && receiverObj.type === 'function' &&
        receiverObj.description.endsWith('{ [native code] }')) {
        const receiverDescriptionRegexResult = /^function ([^(]*)\(/.exec(receiverObj.description);
        if (receiverDescriptionRegexResult) {
            const receiverName = receiverDescriptionRegexResult[1];
            const staticSignatures = javaScriptMetadata.signaturesForStaticMethod(name, receiverName);
            if (staticSignatures) {
                return staticSignatures;
            }
        }
    }
    for (const proto of await prototypesFromObject(receiverObj)) {
        const instanceSignatures = javaScriptMetadata.signaturesForInstanceMethod(name, proto);
        if (instanceSignatures) {
            return instanceSignatures;
        }
    }
    return null;
}
async function prototypesFromObject(object) {
    if (object.type === 'number') {
        return ['Number', 'Object'];
    }
    if (object.type === 'string') {
        return ['String', 'Object'];
    }
    if (object.type === 'symbol') {
        return ['Symbol', 'Object'];
    }
    if (object.type === 'bigint') {
        return ['BigInt', 'Object'];
    }
    if (object.type === 'boolean') {
        return ['Boolean', 'Object'];
    }
    if (object.type === 'undefined' || object.subtype === 'null') {
        return [];
    }
    return await object.callFunctionJSON(function () {
        const result = [];
        for (let object = this; object; object = Object.getPrototypeOf(object)) {
            if (typeof object === 'object' && object.constructor && object.constructor.name) {
                result[result.length] = object.constructor.name;
            }
        }
        return result;
    }, []);
}
// Given a function object that is probably a bound function, try to
// retrieve the argument list from its target function.
async function getArgumentsForBoundFunction(object) {
    const { internalProperties } = await object.getOwnProperties(false);
    if (!internalProperties) {
        return null;
    }
    const target = internalProperties.find(p => p.name === '[[TargetFunction]]')?.value;
    const args = internalProperties.find(p => p.name === '[[BoundArgs]]')?.value;
    const thisValue = internalProperties.find(p => p.name === '[[BoundThis]]')?.value;
    if (!thisValue || !target || !args) {
        return null;
    }
    const originalSignatures = await getArgumentsForFunctionValue(target, () => Promise.resolve(thisValue));
    const boundArgsLength = SDK.RemoteObject.RemoteObject.arrayLength(args);
    if (!originalSignatures) {
        return null;
    }
    return originalSignatures.map(signature => {
        const restIndex = signature.findIndex(arg => arg.startsWith('...'));
        return restIndex > -1 && restIndex < boundArgsLength ? signature.slice(restIndex) :
            signature.slice(boundArgsLength);
    });
}
function tooltipBuilder(signatures, currentIndex) {
    const tooltip = document.createElement('div');
    tooltip.className = 'cm-argumentHints';
    for (const args of signatures) {
        const argumentsElement = document.createElement('span');
        for (let i = 0; i < args.length; i++) {
            if (i === currentIndex || (i < currentIndex && args[i].startsWith('...'))) {
                const argElement = argumentsElement.appendChild(document.createElement('b'));
                argElement.appendChild(document.createTextNode(args[i]));
            }
            else {
                argumentsElement.appendChild(document.createTextNode(args[i]));
            }
            if (i < args.length - 1) {
                argumentsElement.appendChild(document.createTextNode(', '));
            }
        }
        const signatureElement = tooltip.appendChild(document.createElement('div'));
        signatureElement.className = 'source-code';
        signatureElement.appendChild(document.createTextNode('\u0192('));
        signatureElement.appendChild(argumentsElement);
        signatureElement.appendChild(document.createTextNode(')'));
    }
    return { dom: tooltip };
}
//# sourceMappingURL=javascript.js.map