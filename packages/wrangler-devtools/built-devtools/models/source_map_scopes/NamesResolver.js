// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../bindings/bindings.js';
import * as Formatter from '../formatter/formatter.js';
import * as TextUtils from '../text_utils/text_utils.js';
const scopeToCachedIdentifiersMap = new WeakMap();
const cachedMapByCallFrame = new WeakMap();
export class IdentifierPositions {
    name;
    positions;
    constructor(name, positions = []) {
        this.name = name;
        this.positions = positions;
    }
    addPosition(lineNumber, columnNumber) {
        this.positions.push({ lineNumber, columnNumber });
    }
}
const computeScopeTree = async function (functionScope) {
    const functionStartLocation = functionScope.startLocation();
    const functionEndLocation = functionScope.endLocation();
    if (!functionStartLocation || !functionEndLocation) {
        return null;
    }
    const script = functionStartLocation.script();
    if (!script || !script.sourceMapURL || script !== functionEndLocation.script()) {
        return null;
    }
    const { content } = await script.requestContent();
    if (!content) {
        return null;
    }
    const text = new TextUtils.Text.Text(content);
    const scopeRange = new TextUtils.TextRange.TextRange(functionStartLocation.lineNumber, functionStartLocation.columnNumber, functionEndLocation.lineNumber, functionEndLocation.columnNumber);
    const scopeText = text.extract(scopeRange);
    const scopeStart = text.toSourceRange(scopeRange).offset;
    // We wrap the scope in a class constructor. This handles the case where the
    // scope is a (non-arrow) function and the case where it is a constructor
    // (so that parsing 'super' calls succeeds).
    let prefix = 'class DummyClass extends DummyBase { constructor';
    let suffix = '}';
    let scopeTree = await Formatter.FormatterWorkerPool.formatterWorkerPool().javaScriptScopeTree(prefix + scopeText + suffix);
    if (!scopeTree) {
        // Try to parse the function as an arrow function.
        prefix = '';
        suffix = '';
        scopeTree =
            await Formatter.FormatterWorkerPool.formatterWorkerPool().javaScriptScopeTree(prefix + scopeText + suffix);
    }
    if (!scopeTree) {
        return null;
    }
    return { scopeTree, text, slide: scopeStart - prefix.length };
};
export const scopeIdentifiers = async function (functionScope, scope) {
    if (!functionScope) {
        return null;
    }
    const startLocation = scope.startLocation();
    const endLocation = scope.endLocation();
    if (!startLocation || !endLocation) {
        return null;
    }
    // Parse the function scope to get the scope tree.
    const scopeTreeAndStart = await computeScopeTree(functionScope);
    if (!scopeTreeAndStart) {
        return null;
    }
    const { scopeTree, text, slide } = scopeTreeAndStart;
    // Compute the offset within the scope tree coordinate space.
    const scopeOffsets = {
        start: text.offsetFromPosition(startLocation.lineNumber, startLocation.columnNumber) - slide,
        end: text.offsetFromPosition(endLocation.lineNumber, endLocation.columnNumber) - slide,
    };
    if (!contains(scopeTree, scopeOffsets)) {
        return null;
    }
    // Find the corresponding scope in the scope tree.
    let containingScope = scopeTree;
    const ancestorScopes = [];
    while (true) {
        let childFound = false;
        for (const child of containingScope.children) {
            if (contains(child, scopeOffsets)) {
                // We found a nested containing scope, continue with search there.
                ancestorScopes.push(containingScope);
                containingScope = child;
                childFound = true;
                break;
            }
            // Sanity check: |scope| should not straddle any of the scopes in the tree. That is:
            // Either |scope| is disjoint from |child| or |child| must be inside |scope|.
            // (Or the |scope| is inside |child|, but that case is covered above.)
            if (!disjoint(scopeOffsets, child) && !contains(scopeOffsets, child)) {
                console.error('Wrong nesting of scopes');
                return null;
            }
        }
        if (!childFound) {
            // We found the deepest scope in the tree that contains our scope chain entry.
            break;
        }
    }
    // Now we have containing scope. Collect all the scope variables.
    const boundVariables = [];
    const cursor = new TextUtils.TextCursor.TextCursor(text.lineEndings());
    for (const variable of containingScope.variables) {
        // Skip the fixed-kind variable (i.e., 'this' or 'arguments') if we only found their "definition"
        // without any uses.
        if (variable.kind === 3 /* Fixed */ && variable.offsets.length <= 1) {
            continue;
        }
        const identifier = new IdentifierPositions(variable.name);
        for (const offset of variable.offsets) {
            const start = offset + slide;
            cursor.resetTo(start);
            identifier.addPosition(cursor.lineNumber(), cursor.columnNumber());
        }
        boundVariables.push(identifier);
    }
    // Compute free variables by collecting all the ancestor variables that are used in |containingScope|.
    const freeVariables = [];
    for (const ancestor of ancestorScopes) {
        for (const ancestorVariable of ancestor.variables) {
            let identifier = null;
            for (const offset of ancestorVariable.offsets) {
                if (offset >= containingScope.start && offset < containingScope.end) {
                    if (!identifier) {
                        identifier = new IdentifierPositions(ancestorVariable.name);
                    }
                    const start = offset + slide;
                    cursor.resetTo(start);
                    identifier.addPosition(cursor.lineNumber(), cursor.columnNumber());
                }
            }
            if (identifier) {
                freeVariables.push(identifier);
            }
        }
    }
    return { boundVariables, freeVariables };
    function contains(scope, candidate) {
        return (scope.start <= candidate.start) && (scope.end >= candidate.end);
    }
    function disjoint(scope, other) {
        return (scope.end <= other.start) || (other.end <= scope.start);
    }
};
const identifierAndPunctuationRegExp = /^\s*([A-Za-z_$][A-Za-z_$0-9]*)\s*([.;,=]?)\s*$/;
const resolveScope = async (scope) => {
    let cachedScopeMap = scopeToCachedIdentifiersMap.get(scope);
    const script = scope.callFrame().script;
    const sourceMap = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().sourceMapForScript(script);
    if (!cachedScopeMap || cachedScopeMap.sourceMap !== sourceMap) {
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const identifiersPromise = (async () => {
            const variableMapping = new Map();
            let thisMapping = null;
            if (!sourceMap) {
                return { variableMapping, thisMapping };
            }
            const textCache = new Map();
            // Extract as much as possible from SourceMap and resolve
            // missing identifier names from SourceMap ranges.
            const promises = [];
            const resolveEntry = (id, handler) => {
                // First see if we have a source map entry with a name for the identifier.
                for (const position of id.positions) {
                    const entry = sourceMap.findEntry(position.lineNumber, position.columnNumber);
                    if (entry && entry.name) {
                        handler(entry.name);
                        return;
                    }
                }
                // If there is no entry with the name field, try to infer the name from the source positions.
                async function resolvePosition() {
                    if (!sourceMap) {
                        return;
                    }
                    // Let us find the first non-empty mapping of |id| and return that. Ideally, we would
                    // try to compute all the mappings and only use the mapping if all the non-empty
                    // mappings agree. However, that can be expensive for identifiers with many uses,
                    // so we iterate sequentially, stopping at the first non-empty mapping.
                    for (const position of id.positions) {
                        const sourceName = await resolveSourceName(script, sourceMap, id.name, position, textCache);
                        if (sourceName) {
                            handler(sourceName);
                            return;
                        }
                    }
                }
                promises.push(resolvePosition());
            };
            const functionScope = findFunctionScope();
            const parsedVariables = await scopeIdentifiers(functionScope, scope);
            if (!parsedVariables) {
                return { variableMapping, thisMapping };
            }
            for (const id of parsedVariables.boundVariables) {
                resolveEntry(id, sourceName => {
                    // Let use ignore 'this' mappings - those are handled separately.
                    if (sourceName !== 'this') {
                        variableMapping.set(id.name, sourceName);
                    }
                });
            }
            for (const id of parsedVariables.freeVariables) {
                resolveEntry(id, sourceName => {
                    if (sourceName === 'this') {
                        thisMapping = id.name;
                    }
                });
            }
            await Promise.all(promises).then(getScopeResolvedForTest());
            return { variableMapping, thisMapping };
        })();
        cachedScopeMap = { sourceMap, mappingPromise: identifiersPromise };
        scopeToCachedIdentifiersMap.set(scope, { sourceMap, mappingPromise: identifiersPromise });
    }
    return await cachedScopeMap.mappingPromise;
    async function resolveSourceName(script, sourceMap, name, position, textCache) {
        const ranges = sourceMap.findEntryRanges(position.lineNumber, position.columnNumber);
        if (!ranges) {
            return null;
        }
        // Extract the underlying text from the compiled code's range and make sure that
        // it starts with the identifier |name|.
        const uiSourceCode = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().uiSourceCodeForSourceMapSourceURL(script.debuggerModel, ranges.sourceURL, script.isContentScript());
        if (!uiSourceCode) {
            return null;
        }
        const compiledText = getTextFor((await script.requestContent()).content);
        if (!compiledText) {
            return null;
        }
        const compiledToken = compiledText.extract(ranges.range);
        const parsedCompiledToken = extractIdentifier(compiledToken);
        if (!parsedCompiledToken) {
            return null;
        }
        const { name: compiledName, punctuation: compiledPunctuation } = parsedCompiledToken;
        if (compiledName !== name) {
            return null;
        }
        // Extract the mapped name from the source code range and ensure that the punctuation
        // matches the one from the compiled code.
        const sourceText = getTextFor((await uiSourceCode.requestContent()).content);
        if (!sourceText) {
            return null;
        }
        const sourceToken = sourceText.extract(ranges.sourceRange);
        const parsedSourceToken = extractIdentifier(sourceToken);
        if (!parsedSourceToken) {
            return null;
        }
        const { name: sourceName, punctuation: sourcePunctuation } = parsedSourceToken;
        // Accept the source name if it is followed by the same punctuation.
        if (compiledPunctuation === sourcePunctuation) {
            return sourceName;
        }
        // Let us also allow semicolons into commas since that it is a common transformation.
        if (compiledPunctuation === "comma" /* Comma */ && sourcePunctuation === "semicolon" /* Semicolon */) {
            return sourceName;
        }
        return null;
        function extractIdentifier(token) {
            const match = token.match(identifierAndPunctuationRegExp);
            if (!match) {
                return null;
            }
            const name = match[1];
            let punctuation = null;
            switch (match[2]) {
                case '.':
                    punctuation = "dot" /* Dot */;
                    break;
                case ',':
                    punctuation = "comma" /* Comma */;
                    break;
                case ';':
                    punctuation = "semicolon" /* Semicolon */;
                    break;
                case '=':
                    punctuation = "equals" /* Equals */;
                    break;
                case '':
                    punctuation = "none" /* None */;
                    break;
                default:
                    console.error(`Name token parsing error: unexpected token "${match[2]}"`);
                    return null;
            }
            return { name, punctuation };
        }
        function getTextFor(content) {
            if (!content) {
                return null;
            }
            let text = textCache.get(content);
            if (!text) {
                text = new TextUtils.Text.Text(content);
                textCache.set(content, text);
            }
            return text;
        }
    }
    function findFunctionScope() {
        // First find the scope in the callframe's scope chain and then find the containing function scope (closure or local).
        const scopeChain = scope.callFrame().scopeChain();
        let scopeIndex = 0;
        for (scopeIndex; scopeIndex < scopeChain.length; scopeIndex++) {
            if (scopeChain[scopeIndex] === scope) {
                break;
            }
        }
        for (scopeIndex; scopeIndex < scopeChain.length; scopeIndex++) {
            const kind = scopeChain[scopeIndex].type();
            if (kind === "local" /* Local */ || kind === "closure" /* Closure */) {
                break;
            }
        }
        return scopeIndex === scopeChain.length ? null : scopeChain[scopeIndex];
    }
};
export const resolveScopeChain = async function (callFrame) {
    if (!callFrame) {
        return null;
    }
    const { pluginManager } = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance();
    if (pluginManager) {
        const scopeChain = await pluginManager.resolveScopeChain(callFrame);
        if (scopeChain) {
            return scopeChain;
        }
    }
    return callFrame.scopeChain();
};
export const allVariablesInCallFrame = async (callFrame) => {
    const cachedMap = cachedMapByCallFrame.get(callFrame);
    if (cachedMap) {
        return cachedMap;
    }
    const scopeChain = callFrame.scopeChain();
    const nameMappings = await Promise.all(scopeChain.map(resolveScope));
    const reverseMapping = new Map();
    for (const { variableMapping } of nameMappings) {
        for (const [compiledName, originalName] of variableMapping) {
            if (originalName && !reverseMapping.has(originalName)) {
                reverseMapping.set(originalName, compiledName);
            }
        }
    }
    cachedMapByCallFrame.set(callFrame, reverseMapping);
    return reverseMapping;
};
export const resolveExpression = async (callFrame, originalText, uiSourceCode, lineNumber, startColumnNumber, endColumnNumber) => {
    if (uiSourceCode.mimeType() === 'application/wasm') {
        // For WebAssembly disassembly, lookup the different possiblities.
        return `memories["${originalText}"] ?? locals["${originalText}"] ?? tables["${originalText}"] ?? functions["${originalText}"] ?? globals["${originalText}"]`;
    }
    if (!uiSourceCode.contentType().isFromSourceMap()) {
        return '';
    }
    const reverseMapping = await allVariablesInCallFrame(callFrame);
    if (reverseMapping.has(originalText)) {
        return reverseMapping.get(originalText);
    }
    const rawLocations = await Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().uiLocationToRawLocations(uiSourceCode, lineNumber, startColumnNumber);
    const rawLocation = rawLocations.find(location => location.debuggerModel === callFrame.debuggerModel);
    if (!rawLocation) {
        return '';
    }
    const script = rawLocation.script();
    if (!script) {
        return '';
    }
    const sourceMap = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().sourceMapForScript(script);
    if (!sourceMap) {
        return '';
    }
    const { content } = await script.requestContent();
    if (!content) {
        return '';
    }
    const text = new TextUtils.Text.Text(content);
    const textRange = sourceMap.reverseMapTextRange(uiSourceCode.url(), new TextUtils.TextRange.TextRange(lineNumber, startColumnNumber, lineNumber, endColumnNumber));
    if (!textRange) {
        return '';
    }
    const subjectText = text.extract(textRange);
    if (!subjectText) {
        return '';
    }
    return await Formatter.FormatterWorkerPool.formatterWorkerPool().evaluatableJavaScriptSubstring(subjectText);
};
export const resolveThisObject = async (callFrame) => {
    if (!callFrame) {
        return null;
    }
    const scopeChain = callFrame.scopeChain();
    if (scopeChain.length === 0) {
        return callFrame.thisObject();
    }
    const { thisMapping } = await resolveScope(scopeChain[0]);
    if (!thisMapping) {
        return callFrame.thisObject();
    }
    const result = await callFrame.evaluate({
        expression: thisMapping,
        objectGroup: 'backtrace',
        includeCommandLineAPI: false,
        silent: true,
        returnByValue: false,
        generatePreview: true,
    });
    if ('exceptionDetails' in result) {
        return !result.exceptionDetails && result.object ? result.object : callFrame.thisObject();
    }
    return null;
};
export const resolveScopeInObject = function (scope) {
    const startLocation = scope.startLocation();
    const endLocation = scope.endLocation();
    const startLocationScript = startLocation ? startLocation.script() : null;
    if (scope.type() === "global" /* Global */ || !startLocationScript || !endLocation ||
        !startLocationScript.sourceMapURL || startLocationScript !== endLocation.script()) {
        return scope.object();
    }
    return new RemoteObject(scope);
};
export class RemoteObject extends SDK.RemoteObject.RemoteObject {
    scope;
    object;
    constructor(scope) {
        super();
        this.scope = scope;
        this.object = scope.object();
    }
    customPreview() {
        return this.object.customPreview();
    }
    get objectId() {
        return this.object.objectId;
    }
    get type() {
        return this.object.type;
    }
    get subtype() {
        return this.object.subtype;
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get value() {
        return this.object.value;
    }
    get description() {
        return this.object.description;
    }
    get hasChildren() {
        return this.object.hasChildren;
    }
    get preview() {
        return this.object.preview;
    }
    arrayLength() {
        return this.object.arrayLength();
    }
    getOwnProperties(generatePreview) {
        return this.object.getOwnProperties(generatePreview);
    }
    async getAllProperties(accessorPropertiesOnly, generatePreview) {
        const allProperties = await this.object.getAllProperties(accessorPropertiesOnly, generatePreview);
        const { variableMapping } = await resolveScope(this.scope);
        const properties = allProperties.properties;
        const internalProperties = allProperties.internalProperties;
        const newProperties = [];
        if (properties) {
            for (let i = 0; i < properties.length; ++i) {
                const property = properties[i];
                const name = variableMapping.get(property.name) || properties[i].name;
                if (!property.value) {
                    continue;
                }
                newProperties.push(new SDK.RemoteObject.RemoteObjectProperty(name, property.value, property.enumerable, property.writable, property.isOwn, property.wasThrown, property.symbol, property.synthetic));
            }
        }
        return { properties: newProperties, internalProperties: internalProperties };
    }
    async setPropertyValue(argumentName, value) {
        const { variableMapping } = await resolveScope(this.scope);
        let name;
        if (typeof argumentName === 'string') {
            name = argumentName;
        }
        else {
            name = argumentName.value;
        }
        let actualName = name;
        for (const compiledName of variableMapping.keys()) {
            if (variableMapping.get(compiledName) === name) {
                actualName = compiledName;
                break;
            }
        }
        return this.object.setPropertyValue(actualName, value);
    }
    async deleteProperty(name) {
        return this.object.deleteProperty(name);
    }
    callFunction(functionDeclaration, args) {
        return this.object.callFunction(functionDeclaration, args);
    }
    callFunctionJSON(functionDeclaration, args) {
        return this.object.callFunctionJSON(functionDeclaration, args);
    }
    release() {
        this.object.release();
    }
    debuggerModel() {
        return this.object.debuggerModel();
    }
    runtimeModel() {
        return this.object.runtimeModel();
    }
    isNode() {
        return this.object.isNode();
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-explicit-any
let _scopeResolvedForTest = function () { };
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-explicit-any
export const getScopeResolvedForTest = () => {
    return _scopeResolvedForTest;
};
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-explicit-any
export const setScopeResolvedForTest = (scope) => {
    _scopeResolvedForTest = scope;
};
//# sourceMappingURL=NamesResolver.js.map