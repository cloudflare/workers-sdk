// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
import { assertNotNullOrUndefined } from '../../core/platform/platform.js';
const UIStrings = {
    /**
    *@description Error message that is displayed in the Console when language #plugins report errors
    *@example {File not found} PH1
    */
    errorInDebuggerLanguagePlugin: 'Error in debugger language plugin: {PH1}',
    /**
    *@description Status message that is shown in the Console when debugging information is being
    *loaded. The 2nd and 3rd placeholders are URLs.
    *@example {C/C++ DevTools Support (DWARF)} PH1
    *@example {http://web.dev/file.wasm} PH2
    *@example {http://web.dev/file.wasm.debug.wasm} PH3
    */
    loadingDebugSymbolsForVia: '[{PH1}] Loading debug symbols for {PH2} (via {PH3})...',
    /**
    *@description Status message that is shown in the Console when debugging information is being loaded
    *@example {C/C++ DevTools Support (DWARF)} PH1
    *@example {http://web.dev/file.wasm} PH2
    */
    loadingDebugSymbolsFor: '[{PH1}] Loading debug symbols for {PH2}...',
    /**
    *@description Warning message that is displayed in the Console when debugging information was loaded, but no source files were found
    *@example {C/C++ DevTools Support (DWARF)} PH1
    *@example {http://web.dev/file.wasm} PH2
    */
    loadedDebugSymbolsForButDidnt: '[{PH1}] Loaded debug symbols for {PH2}, but didn\'t find any source files',
    /**
    *@description Status message that is shown in the Console when debugging information is successfully loaded
    *@example {C/C++ DevTools Support (DWARF)} PH1
    *@example {http://web.dev/file.wasm} PH2
    *@example {42} PH3
    */
    loadedDebugSymbolsForFound: '[{PH1}] Loaded debug symbols for {PH2}, found {PH3} source file(s)',
    /**
    *@description Error message that is displayed in the Console when debugging information cannot be loaded
    *@example {C/C++ DevTools Support (DWARF)} PH1
    *@example {http://web.dev/file.wasm} PH2
    *@example {File not found} PH3
    */
    failedToLoadDebugSymbolsFor: '[{PH1}] Failed to load debug symbols for {PH2} ({PH3})',
    /**
    *@description Error message that is displayed in UI debugging information cannot be found for a call frame
    *@example {main} PH1
    */
    failedToLoadDebugSymbolsForFunction: 'No debug information for function "{PH1}"',
    /**
    *@description Error message that is displayed in UI when a file needed for debugging information for a call frame is missing
    *@example {mainp.debug.wasm.dwp} PH1
    */
    debugSymbolsIncomplete: 'The debug information for function {PH1} is incomplete',
};
const str_ = i18n.i18n.registerUIStrings('models/bindings/DebuggerLanguagePlugins.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
class SourceType {
    typeInfo;
    members;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeMap;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(typeInfo, members, typeMap) {
        this.typeInfo = typeInfo;
        this.members = members;
        this.typeMap = typeMap;
    }
    /**
     * Create a type graph
     */
    static create(typeInfos) {
        if (typeInfos.length === 0) {
            return null;
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typeMap = new Map();
        for (const typeInfo of typeInfos) {
            typeMap.set(typeInfo.typeId, new SourceType(typeInfo, [], typeMap));
        }
        for (const sourceType of typeMap.values()) {
            sourceType.members = sourceType.typeInfo.members.map(({ typeId }) => {
                const memberType = typeMap.get(typeId);
                if (!memberType) {
                    throw new Error(`Incomplete type information for type ${typeInfos[0].typeNames[0] || '<anonymous>'}`);
                }
                return memberType;
            });
        }
        return typeMap.get(typeInfos[0].typeId) || null;
    }
}
/**
 * Generates the raw module ID for a script, which is used
 * to uniquely identify the debugging data for a script on
 * the responsible language #plugin.
 *
 * @param script the unique raw module ID for the script.
 */
function rawModuleIdForScript(script) {
    return `${script.sourceURL}@${script.hash}`;
}
function getRawLocation(callFrame) {
    const { script } = callFrame;
    return {
        rawModuleId: rawModuleIdForScript(script),
        codeOffset: callFrame.location().columnNumber - (script.codeOffset() || 0),
        inlineFrameIndex: callFrame.inlineFrameIndex,
    };
}
async function resolveRemoteObject(
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
callFrame, object) {
    if (typeof object.value !== 'undefined') {
        return object.value;
    }
    const response = await callFrame.debuggerModel.target().runtimeAgent().invoke_callFunctionOn({ functionDeclaration: 'function() { return this; }', objectId: object.objectId, returnByValue: true });
    const { result } = response;
    if (!result) {
        return undefined;
    }
    return result.value;
}
export class ValueNode extends SDK.RemoteObject.RemoteObjectImpl {
    inspectableAddress;
    callFrame;
    constructor(callFrame, objectId, type, subtype, 
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value, inspectableAddress, unserializableValue, description, preview, customPreview, className) {
        super(callFrame.debuggerModel.runtimeModel(), objectId, type, subtype, value, unserializableValue, description, preview, customPreview, className);
        this.inspectableAddress = inspectableAddress;
        this.callFrame = callFrame;
    }
    get sourceType() {
        throw new Error('Not Implemented');
    }
}
// Debugger language #plugins present source-language values as trees with mixed dynamic and static structural
// information. The static structure is defined by the variable's static type in the source language. Formatters are
// able to present source-language values in an arbitrary user-friendly way, which contributes the dynamic structural
// information. The classes StaticallyTypedValue and FormatedValueNode respectively implement the static and dynamic
// parts in the RemoteObject tree that defines the presentation of the source-language value in the debugger UI.
//
// struct S {
//   int i;
//   struct A {
//     int j;
//   } a[3];
// } s
//
// The RemoteObject tree representing the C struct above could look like the graph below with a formatter for the type
// struct A[3], interleaving static and dynamic representations:
//
// StaticallyTypedValueNode   -->  s: struct S
//                                 \
//                                 |\
// StaticallyTypedValueNode   -->  | i: int
//                                 \
//                                  \
// StaticallyTypedValueNode   -->    a: struct A[3]
//                                   \
//                                   |\
// FormattedValueNode         -->    | 0: struct A
//                                   | \
//                                   |  \
// StaticallyTypedValueNode   -->    |   j: int
//                                   .
//                                   .
//                                   .
/** Create a new value tree from an expression.
 */
async function getValueTreeForExpression(callFrame, plugin, expression, evalOptions) {
    const location = getRawLocation(callFrame);
    let typeInfo;
    try {
        typeInfo = await plugin.getTypeInfo(expression, location);
    }
    catch (e) {
        throw FormattingError.makeLocal(callFrame, e.message);
    }
    // If there's no type information we cannot represent this expression.
    if (!typeInfo) {
        return new SDK.RemoteObject.LocalJSONObject(undefined);
    }
    const { base, typeInfos } = typeInfo;
    const sourceType = SourceType.create(typeInfos);
    if (!sourceType) {
        return new SDK.RemoteObject.LocalJSONObject(undefined);
    }
    if (sourceType.typeInfo.hasValue && !sourceType.typeInfo.canExpand && base) {
        // Need to run the formatter for the expression result.
        return formatSourceValue(callFrame, plugin, sourceType, base, [], evalOptions);
    }
    // Create a new value tree with static information for the root.
    const address = await StaticallyTypedValueNode.getInspectableAddress(callFrame, plugin, base, [], evalOptions);
    return new StaticallyTypedValueNode(callFrame, plugin, sourceType, base, [], evalOptions, address);
}
/** Run the formatter for the value defined by the pair of #base and #fieldChain.
 */
async function formatSourceValue(callFrame, plugin, sourceType, base, field, evalOptions) {
    const location = getRawLocation(callFrame);
    let evalCode = await plugin.getFormatter({ base, field }, location);
    if (!evalCode) {
        evalCode = { js: '' };
    }
    const response = await callFrame.debuggerModel.target().debuggerAgent().invoke_evaluateOnCallFrame({
        callFrameId: callFrame.id,
        expression: evalCode.js,
        objectGroup: evalOptions.objectGroup,
        includeCommandLineAPI: evalOptions.includeCommandLineAPI,
        silent: evalOptions.silent,
        returnByValue: evalOptions.returnByValue,
        generatePreview: evalOptions.generatePreview,
        throwOnSideEffect: evalOptions.throwOnSideEffect,
        timeout: evalOptions.timeout,
    });
    const error = response.getError();
    if (error) {
        throw new Error(error);
    }
    const { result, exceptionDetails } = response;
    if (exceptionDetails) {
        throw new FormattingError(callFrame.debuggerModel.runtimeModel().createRemoteObject(result), exceptionDetails);
    }
    // Wrap the formatted result into a FormattedValueNode.
    const object = new FormattedValueNode(callFrame, sourceType, plugin, result, null, evalOptions, undefined);
    // Check whether the formatter returned a plain object or and object alongisde a formatter tag.
    const unpackedResultObject = await unpackResultObject(object);
    const node = unpackedResultObject || object;
    if (typeof node.value === 'undefined' && node.type !== 'undefined') {
        node.description = sourceType.typeInfo.typeNames[0];
    }
    return node;
    async function unpackResultObject(object) {
        const { tag, value, inspectableAddress, description } = await object.findProperties('tag', 'value', 'inspectableAddress', 'description');
        if (!tag || !value) {
            return null;
        }
        const { className, symbol } = await tag.findProperties('className', 'symbol');
        if (!className || !symbol) {
            return null;
        }
        const resolvedClassName = className.value;
        if (typeof resolvedClassName !== 'string' || typeof symbol.objectId === 'undefined') {
            return null;
        }
        const descriptionText = description?.value;
        if (typeof descriptionText === 'string') {
            value.description = descriptionText;
        }
        value.formatterTag = { symbol: symbol.objectId, className: resolvedClassName };
        value.inspectableAddress = inspectableAddress ? inspectableAddress.value : undefined;
        return value;
    }
}
// Formatters produce proper JavaScript objects, which are mirrored as RemoteObjects. To implement interleaving of
// formatted and statically typed values, formatters may insert markers in the JavaScript objects. The markers contain
// the static type information (`EvalBase`)to create a new StaticallyTypedValueNode tree root. Markers are identified by
// their className and the presence of a special Symbol property. Both the class name and the symbol are defined by the
// `formatterTag` property.
//
// A FormattedValueNode is a RemoteObject whose properties can be either FormattedValueNodes or
// StaticallyTypedValueNodes. The class hooks into the creation of RemoteObjects for properties to check whether a
// property is a marker.
class FormattedValueNode extends ValueNode {
    #plugin;
    #sourceType;
    formatterTag;
    #evalOptions;
    constructor(callFrame, sourceType, plugin, object, formatterTag, evalOptions, inspectableAddress) {
        super(callFrame, object.objectId, object.type, object.subtype, object.value, inspectableAddress, object.unserializableValue, object.description, object.preview, object.customPreview, object.className);
        this.#plugin = plugin;
        this.#sourceType = sourceType;
        // The tag describes how to identify a marker by its className and its identifier symbol's object id.
        this.formatterTag = formatterTag;
        this.#evalOptions = evalOptions;
    }
    async findProperties(...properties) {
        const result = {};
        for (const prop of (await this.getOwnProperties(false)).properties || []) {
            if (properties.indexOf(prop.name) >= 0) {
                if (prop.value) {
                    result[prop.name] = prop.value;
                }
            }
        }
        return result;
    }
    /**
     * Hook into RemoteObject creation for properties to check whether a property is a marker.
     */
    async createRemoteObject(newObject) {
        // Check if the property RemoteObject is a marker
        const base = await this.getEvalBaseFromObject(newObject);
        if (!base) {
            return new FormattedValueNode(this.callFrame, this.#sourceType, this.#plugin, newObject, this.formatterTag, this.#evalOptions, undefined);
        }
        // Property is a marker, check if it's just static type information or if we need to run formatters for the value.
        const newSourceType = this.#sourceType.typeMap.get(base.rootType.typeId);
        if (!newSourceType) {
            throw new Error('Unknown typeId in eval base');
        }
        // The marker refers to a value that needs to be formatted, so run the formatter.
        if (base.rootType.hasValue && !base.rootType.canExpand && base) {
            return formatSourceValue(this.callFrame, this.#plugin, newSourceType, base, [], this.#evalOptions);
        }
        // The marker is just static information, so start a new subtree with a static type info root.
        const address = await StaticallyTypedValueNode.getInspectableAddress(this.callFrame, this.#plugin, base, [], this.#evalOptions);
        return new StaticallyTypedValueNode(this.callFrame, this.#plugin, newSourceType, base, [], this.#evalOptions, address);
    }
    /**
     * Check whether an object is a marker and if so return the EvalBase it contains.
     */
    async getEvalBaseFromObject(object) {
        const { objectId } = object;
        if (!object || !this.formatterTag) {
            return null;
        }
        // A marker is definitively identified by the symbol property. To avoid checking the properties of all objects,
        // check the className first for an early exit.
        const { className, symbol } = this.formatterTag;
        if (className !== object.className) {
            return null;
        }
        const response = await this.debuggerModel().target().runtimeAgent().invoke_callFunctionOn({
            functionDeclaration: 'function(sym) { return this[sym]; }',
            objectId,
            arguments: [{ objectId: symbol }],
        });
        const { result } = response;
        if (!result || result.type === 'undefined') {
            return null;
        }
        // The object is a marker, so pull the static type information from its symbol property. The symbol property is not
        // a formatted value per se, but we wrap it as one to be able to call `findProperties`.
        const baseObject = new FormattedValueNode(this.callFrame, this.#sourceType, this.#plugin, result, null, this.#evalOptions, undefined);
        const { payload, rootType } = await baseObject.findProperties('payload', 'rootType');
        if (typeof payload === 'undefined' || typeof rootType === 'undefined') {
            return null;
        }
        const value = await resolveRemoteObject(this.callFrame, payload);
        const { typeId } = await rootType.findProperties('typeId');
        if (typeof value === 'undefined' || typeof typeId === 'undefined') {
            return null;
        }
        const newSourceType = this.#sourceType.typeMap.get(typeId.value);
        if (!newSourceType) {
            return null;
        }
        return { payload: value, rootType: newSourceType.typeInfo };
    }
}
class FormattingError extends Error {
    exception;
    exceptionDetails;
    constructor(exception, exceptionDetails) {
        const { description } = exceptionDetails.exception || {};
        super(description || exceptionDetails.text);
        this.exception = exception;
        this.exceptionDetails = exceptionDetails;
    }
    static makeLocal(callFrame, message) {
        const exception = {
            type: "object" /* Object */,
            subtype: "error" /* Error */,
            description: message,
        };
        const exceptionDetails = { text: 'Uncaught', exceptionId: -1, columnNumber: 0, lineNumber: 0, exception };
        const errorObject = callFrame.debuggerModel.runtimeModel().createRemoteObject(exception);
        return new FormattingError(errorObject, exceptionDetails);
    }
}
// This class implements a `RemoteObject` for source language value whose immediate properties are defined purely by
// static type information. Static type information is expressed by an `EvalBase` together with a `#fieldChain`. The
// latter is necessary to express navigating through type members. We don't know how to make sense of an `EvalBase`'s
// payload here, which is why member navigation is relayed to the formatter via the `#fieldChain`.
class StaticallyTypedValueNode extends ValueNode {
    #variableType;
    #plugin;
    #sourceType;
    #base;
    #fieldChain;
    #evalOptions;
    constructor(callFrame, plugin, sourceType, base, fieldChain, evalOptions, inspectableAddress) {
        const typeName = sourceType.typeInfo.typeNames[0] || '<anonymous>';
        const variableType = 'object';
        super(callFrame, 
        /* objectId=*/ undefined, 
        /* type=*/ variableType, 
        /* subtype=*/ undefined, /* value=*/ null, inspectableAddress, /* unserializableValue=*/ undefined, 
        /* description=*/ typeName, /* preview=*/ undefined, /* customPreview=*/ undefined, /* className=*/ typeName);
        this.#variableType = variableType;
        this.#plugin = plugin;
        this.#sourceType = sourceType;
        this.#base = base;
        this.#fieldChain = fieldChain;
        this.hasChildrenInternal = true;
        this.#evalOptions = evalOptions;
    }
    get type() {
        return this.#variableType;
    }
    get sourceType() {
        return this.#sourceType;
    }
    async expandMember(sourceType, fieldInfo) {
        const fieldChain = this.#fieldChain.concat(fieldInfo);
        if (sourceType.typeInfo.hasValue && !sourceType.typeInfo.canExpand && this.#base) {
            return formatSourceValue(this.callFrame, this.#plugin, sourceType, this.#base, fieldChain, this.#evalOptions);
        }
        const address = this.inspectableAddress !== undefined ? this.inspectableAddress + fieldInfo.offset : undefined;
        return new StaticallyTypedValueNode(this.callFrame, this.#plugin, sourceType, this.#base, fieldChain, this.#evalOptions, address);
    }
    static async getInspectableAddress(callFrame, plugin, base, field, evalOptions) {
        if (!base) {
            return undefined;
        }
        const addressCode = await plugin.getInspectableAddress({ base, field });
        if (!addressCode.js) {
            return undefined;
        }
        const response = await callFrame.debuggerModel.target().debuggerAgent().invoke_evaluateOnCallFrame({
            callFrameId: callFrame.id,
            expression: addressCode.js,
            objectGroup: evalOptions.objectGroup,
            includeCommandLineAPI: evalOptions.includeCommandLineAPI,
            silent: evalOptions.silent,
            returnByValue: true,
            generatePreview: evalOptions.generatePreview,
            throwOnSideEffect: evalOptions.throwOnSideEffect,
            timeout: evalOptions.timeout,
        });
        const error = response.getError();
        if (error) {
            throw new Error(error);
        }
        const { result, exceptionDetails } = response;
        if (exceptionDetails) {
            throw new FormattingError(callFrame.debuggerModel.runtimeModel().createRemoteObject(result), exceptionDetails);
        }
        const address = result.value;
        if (!Number.isSafeInteger(address) || address < 0) {
            console.error(`Inspectable address is not a positive, safe integer: ${address}`);
            return undefined;
        }
        return address;
    }
    async doGetProperties(_ownProperties, accessorPropertiesOnly, _generatePreview) {
        const { typeInfo } = this.#sourceType;
        if (accessorPropertiesOnly || !typeInfo.canExpand) {
            return { properties: [], internalProperties: [] };
        }
        if (typeInfo.members.length > 0) {
            // This value doesn't have a formatter, but we can eagerly expand arrays in the frontend if the size is known.
            if (typeInfo.arraySize > 0) {
                const { typeId } = this.#sourceType.typeInfo.members[0];
                const properties = [];
                const elementTypeInfo = this.#sourceType.members[0];
                for (let i = 0; i < typeInfo.arraySize; ++i) {
                    const name = `${i}`;
                    const elementField = { name, typeId, offset: elementTypeInfo.typeInfo.size * i };
                    properties.push(new SDK.RemoteObject.RemoteObjectProperty(name, await this.expandMember(elementTypeInfo, elementField), /* enumerable=*/ false, 
                    /* writable=*/ false, 
                    /* isOwn=*/ true, 
                    /* wasThrown=*/ false));
                }
                return { properties, internalProperties: [] };
            }
            // The node is expanded, just make remote objects for its members
            const members = Promise.all(this.#sourceType.members.map(async (memberTypeInfo, idx) => {
                const fieldInfo = this.#sourceType.typeInfo.members[idx];
                const propertyObject = await this.expandMember(memberTypeInfo, fieldInfo);
                const name = fieldInfo.name || '';
                return new SDK.RemoteObject.RemoteObjectProperty(name, propertyObject, /* enumerable=*/ false, /* writable=*/ false, /* isOwn=*/ true, 
                /* wasThrown=*/ false);
            }));
            return { properties: await members, internalProperties: [] };
        }
        return { properties: [], internalProperties: [] };
    }
}
class NamespaceObject extends SDK.RemoteObject.LocalJSONObject {
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(value) {
        super(value);
    }
    get description() {
        return this.type;
    }
    get type() {
        return 'namespace';
    }
}
class SourceScopeRemoteObject extends SDK.RemoteObject.RemoteObjectImpl {
    variables;
    #callFrame;
    #plugin;
    stopId;
    constructor(callFrame, stopId, plugin) {
        super(callFrame.debuggerModel.runtimeModel(), undefined, 'object', undefined, null);
        this.variables = [];
        this.#callFrame = callFrame;
        this.#plugin = plugin;
        this.stopId = stopId;
    }
    async doGetProperties(ownProperties, accessorPropertiesOnly, _generatePreview) {
        if (accessorPropertiesOnly) {
            return { properties: [], internalProperties: [] };
        }
        const properties = [];
        const namespaces = {};
        function makeProperty(name, obj) {
            return new SDK.RemoteObject.RemoteObjectProperty(name, obj, 
            /* enumerable=*/ false, /* writable=*/ false, /* isOwn=*/ true, /* wasThrown=*/ false);
        }
        for (const variable of this.variables) {
            let sourceVar;
            try {
                sourceVar = await getValueTreeForExpression(this.#callFrame, this.#plugin, variable.name, {
                    generatePreview: false,
                    includeCommandLineAPI: true,
                    objectGroup: 'backtrace',
                    returnByValue: false,
                    silent: false,
                });
            }
            catch (e) {
                console.warn(e);
                sourceVar = new SDK.RemoteObject.LocalJSONObject(undefined);
            }
            if (variable.nestedName && variable.nestedName.length > 1) {
                let parent = namespaces;
                for (let index = 0; index < variable.nestedName.length - 1; index++) {
                    const nestedName = variable.nestedName[index];
                    let child = parent[nestedName];
                    if (!child) {
                        child = new NamespaceObject({});
                        parent[nestedName] = child;
                    }
                    parent = child.value;
                }
                const name = variable.nestedName[variable.nestedName.length - 1];
                parent[name] = sourceVar;
            }
            else {
                properties.push(makeProperty(variable.name, sourceVar));
            }
        }
        for (const namespace in namespaces) {
            properties.push(makeProperty(namespace, namespaces[namespace]));
        }
        return { properties: properties, internalProperties: [] };
    }
}
export class SourceScope {
    #callFrameInternal;
    #typeInternal;
    #typeNameInternal;
    #iconInternal;
    #objectInternal;
    #startLocationInternal;
    #endLocationInternal;
    constructor(callFrame, stopId, type, typeName, icon, plugin) {
        this.#callFrameInternal = callFrame;
        this.#typeInternal = type;
        this.#typeNameInternal = typeName;
        this.#iconInternal = icon;
        this.#objectInternal = new SourceScopeRemoteObject(callFrame, stopId, plugin);
        this.#startLocationInternal = null;
        this.#endLocationInternal = null;
    }
    async getVariableValue(name) {
        for (let v = 0; v < this.#objectInternal.variables.length; ++v) {
            if (this.#objectInternal.variables[v].name !== name) {
                continue;
            }
            const properties = await this.#objectInternal.getAllProperties(false, false);
            if (!properties.properties) {
                continue;
            }
            const { value } = properties.properties[v];
            if (value) {
                return value;
            }
        }
        return null;
    }
    callFrame() {
        return this.#callFrameInternal;
    }
    type() {
        return this.#typeInternal;
    }
    typeName() {
        return this.#typeNameInternal;
    }
    name() {
        return undefined;
    }
    startLocation() {
        return this.#startLocationInternal;
    }
    endLocation() {
        return this.#endLocationInternal;
    }
    object() {
        return this.#objectInternal;
    }
    description() {
        return '';
    }
    icon() {
        return this.#iconInternal;
    }
}
export class ExtensionRemoteObject extends SDK.RemoteObject.RemoteObject {
    extensionObject;
    plugin;
    callFrame;
    constructor(callFrame, extensionObject, plugin) {
        super();
        this.extensionObject = extensionObject;
        this.plugin = plugin;
        this.callFrame = callFrame;
    }
    get linearMemoryAddress() {
        return this.extensionObject.linearMemoryAddress;
    }
    get objectId() {
        return this.extensionObject.objectId;
    }
    get type() {
        if (this.extensionObject.type === 'array' || this.extensionObject.type === 'null') {
            return 'object';
        }
        return this.extensionObject.type;
    }
    get subtype() {
        if (this.extensionObject.type === 'array' || this.extensionObject.type === 'null') {
            return this.extensionObject.type;
        }
        return undefined;
    }
    get value() {
        return this.extensionObject.value;
    }
    unserializableValue() {
        return undefined;
    }
    get description() {
        return this.extensionObject.description;
    }
    set description(description) {
    }
    get hasChildren() {
        return this.extensionObject.hasChildren;
    }
    get preview() {
        return undefined;
    }
    get className() {
        return this.extensionObject.className ?? null;
    }
    arrayLength() {
        return 0;
    }
    arrayBufferByteLength() {
        return 0;
    }
    getOwnProperties(_generatePreview, _nonIndexedPropertiesOnly) {
        return this.getAllProperties(false, _generatePreview, _nonIndexedPropertiesOnly);
    }
    async getAllProperties(_accessorPropertiesOnly, _generatePreview, _nonIndexedPropertiesOnly) {
        const { objectId } = this.extensionObject;
        if (objectId) {
            const extensionObjectProperties = await this.plugin.getProperties(objectId);
            const properties = extensionObjectProperties.map(p => new SDK.RemoteObject.RemoteObjectProperty(p.name, new ExtensionRemoteObject(this.callFrame, p.value, this.plugin)));
            return { properties, internalProperties: null };
        }
        return { properties: null, internalProperties: null };
    }
    release() {
        const { objectId } = this.extensionObject;
        if (objectId) {
            void this.plugin.releaseObject(objectId);
        }
    }
    debuggerModel() {
        return this.callFrame.debuggerModel;
    }
    runtimeModel() {
        return this.callFrame.debuggerModel.runtimeModel();
    }
}
export class DebuggerLanguagePluginManager {
    #workspace;
    #debuggerWorkspaceBinding;
    #plugins;
    #debuggerModelToData;
    #rawModuleHandles;
    callFrameByStopId = new Map();
    stopIdByCallFrame = new Map();
    nextStopId = 0n;
    constructor(targetManager, workspace, debuggerWorkspaceBinding) {
        this.#workspace = workspace;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.#plugins = [];
        this.#debuggerModelToData = new Map();
        targetManager.observeModels(SDK.DebuggerModel.DebuggerModel, this);
        this.#rawModuleHandles = new Map();
    }
    async evaluateOnCallFrame(callFrame, options) {
        const { script } = callFrame;
        const { expression } = options;
        const { plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return null;
        }
        const location = getRawLocation(callFrame);
        const sourceLocations = await plugin.rawLocationToSourceLocation(location);
        if (sourceLocations.length === 0) {
            return null;
        }
        try {
            const object = await getValueTreeForExpression(callFrame, plugin, expression, options);
            return { object, exceptionDetails: undefined };
        }
        catch (error) {
            if (error instanceof FormattingError) {
                const { exception: object, exceptionDetails } = error;
                return { object, exceptionDetails };
            }
            const { exception: object, exceptionDetails } = FormattingError.makeLocal(callFrame, error.message);
            return { object, exceptionDetails };
        }
    }
    stopIdForCallFrame(callFrame) {
        let stopId = this.stopIdByCallFrame.get(callFrame);
        if (stopId !== undefined) {
            return stopId;
        }
        stopId = this.nextStopId++;
        this.stopIdByCallFrame.set(callFrame, stopId);
        this.callFrameByStopId.set(stopId, callFrame);
        return stopId;
    }
    callFrameForStopId(stopId) {
        return this.callFrameByStopId.get(stopId);
    }
    expandCallFrames(callFrames) {
        return Promise
            .all(callFrames.map(async (callFrame) => {
            const functionInfo = await this.getFunctionInfo(callFrame.script, callFrame.location());
            if (functionInfo) {
                if ('frames' in functionInfo && functionInfo.frames.length) {
                    return functionInfo.frames.map(({ name }, index) => callFrame.createVirtualCallFrame(index, name));
                }
                if ('missingSymbolFiles' in functionInfo && functionInfo.missingSymbolFiles.length) {
                    const resources = functionInfo.missingSymbolFiles;
                    const details = i18nString(UIStrings.debugSymbolsIncomplete, { PH1: callFrame.functionName });
                    callFrame.setMissingDebugInfoDetails({ details, resources });
                }
                else {
                    callFrame.setMissingDebugInfoDetails({
                        resources: [],
                        details: i18nString(UIStrings.failedToLoadDebugSymbolsForFunction, { PH1: callFrame.functionName }),
                    });
                }
            }
            return callFrame;
        }))
            .then(callFrames => callFrames.flat());
    }
    modelAdded(debuggerModel) {
        this.#debuggerModelToData.set(debuggerModel, new ModelData(debuggerModel, this.#workspace));
        debuggerModel.addEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this.globalObjectCleared, this);
        debuggerModel.addEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, this.parsedScriptSource, this);
        debuggerModel.addEventListener(SDK.DebuggerModel.Events.DebuggerResumed, this.debuggerResumed, this);
        debuggerModel.setEvaluateOnCallFrameCallback(this.evaluateOnCallFrame.bind(this));
        debuggerModel.setExpandCallFramesCallback(this.expandCallFrames.bind(this));
    }
    modelRemoved(debuggerModel) {
        debuggerModel.removeEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this.globalObjectCleared, this);
        debuggerModel.removeEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, this.parsedScriptSource, this);
        debuggerModel.removeEventListener(SDK.DebuggerModel.Events.DebuggerResumed, this.debuggerResumed, this);
        debuggerModel.setEvaluateOnCallFrameCallback(null);
        debuggerModel.setExpandCallFramesCallback(null);
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (modelData) {
            modelData.dispose();
            this.#debuggerModelToData.delete(debuggerModel);
        }
        this.#rawModuleHandles.forEach((rawModuleHandle, rawModuleId) => {
            const scripts = rawModuleHandle.scripts.filter(script => script.debuggerModel !== debuggerModel);
            if (scripts.length === 0) {
                rawModuleHandle.plugin.removeRawModule(rawModuleId).catch(error => {
                    Common.Console.Console.instance().error(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
                });
                this.#rawModuleHandles.delete(rawModuleId);
            }
            else {
                rawModuleHandle.scripts = scripts;
            }
        });
    }
    globalObjectCleared(event) {
        const debuggerModel = event.data;
        this.modelRemoved(debuggerModel);
        this.modelAdded(debuggerModel);
    }
    addPlugin(plugin) {
        this.#plugins.push(plugin);
        for (const debuggerModel of this.#debuggerModelToData.keys()) {
            for (const script of debuggerModel.scripts()) {
                if (this.hasPluginForScript(script)) {
                    continue;
                }
                this.parsedScriptSource({ data: script });
            }
        }
    }
    removePlugin(plugin) {
        this.#plugins = this.#plugins.filter(p => p !== plugin);
        const scripts = new Set();
        this.#rawModuleHandles.forEach((rawModuleHandle, rawModuleId) => {
            if (rawModuleHandle.plugin !== plugin) {
                return;
            }
            rawModuleHandle.scripts.forEach(script => scripts.add(script));
            this.#rawModuleHandles.delete(rawModuleId);
        });
        for (const script of scripts) {
            const modelData = this.#debuggerModelToData.get(script.debuggerModel);
            modelData.removeScript(script);
            // Let's see if we have another #plugin that's happy to
            // take this orphaned script now. This is important to
            // get right, since the same #plugin might race during
            // unregister/register and we might already have the
            // new instance of the #plugin added before we remove
            // the previous instance.
            this.parsedScriptSource({ data: script });
        }
    }
    hasPluginForScript(script) {
        const rawModuleId = rawModuleIdForScript(script);
        const rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
        return rawModuleHandle !== undefined && rawModuleHandle.scripts.includes(script);
    }
    /**
     * Returns the responsible language #plugin and the raw module ID for a script.
     *
     * This ensures that the `addRawModule` call finishes first such that the
     * caller can immediately issue calls to the returned #plugin without the
     * risk of racing with the `addRawModule` call. The returned #plugin will be
     * set to undefined to indicate that there's no #plugin for the script.
     */
    async rawModuleIdAndPluginForScript(script) {
        const rawModuleId = rawModuleIdForScript(script);
        const rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
        if (rawModuleHandle) {
            await rawModuleHandle.addRawModulePromise;
            if (rawModuleHandle === this.#rawModuleHandles.get(rawModuleId)) {
                return { rawModuleId, plugin: rawModuleHandle.plugin };
            }
        }
        return { rawModuleId, plugin: null };
    }
    uiSourceCodeForURL(debuggerModel, url) {
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (modelData) {
            return modelData.getProject().uiSourceCodeForURL(url);
        }
        return null;
    }
    async rawLocationToUILocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return null;
        }
        const pluginLocation = {
            rawModuleId,
            // RawLocation.#columnNumber is the byte offset in the full raw wasm module. Plugins expect the offset in the code
            // section, so subtract the offset of the code section in the module here.
            codeOffset: rawLocation.columnNumber - (script.codeOffset() || 0),
            inlineFrameIndex: rawLocation.inlineFrameIndex,
        };
        try {
            const sourceLocations = await plugin.rawLocationToSourceLocation(pluginLocation);
            for (const sourceLocation of sourceLocations) {
                const uiSourceCode = this.uiSourceCodeForURL(script.debuggerModel, sourceLocation.sourceFileURL);
                if (!uiSourceCode) {
                    continue;
                }
                // Absence of column information is indicated by the value `-1` in talking to language #plugins.
                return uiSourceCode.uiLocation(sourceLocation.lineNumber, sourceLocation.columnNumber >= 0 ? sourceLocation.columnNumber : undefined);
            }
        }
        catch (error) {
            Common.Console.Console.instance().error(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
        }
        return null;
    }
    uiLocationToRawLocationRanges(uiSourceCode, lineNumber, columnNumber = -1) {
        const locationPromises = [];
        this.scriptsForUISourceCode(uiSourceCode).forEach(script => {
            const rawModuleId = rawModuleIdForScript(script);
            const rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
            if (!rawModuleHandle) {
                return;
            }
            const { plugin } = rawModuleHandle;
            locationPromises.push(getLocations(rawModuleId, plugin, script));
        });
        if (locationPromises.length === 0) {
            return Promise.resolve(null);
        }
        return Promise.all(locationPromises).then(locations => locations.flat()).catch(error => {
            Common.Console.Console.instance().error(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
            return null;
        });
        async function getLocations(rawModuleId, plugin, script) {
            const pluginLocation = { rawModuleId, sourceFileURL: uiSourceCode.url(), lineNumber, columnNumber };
            const rawLocations = await plugin.sourceLocationToRawLocation(pluginLocation);
            if (!rawLocations) {
                return [];
            }
            return rawLocations.map(m => ({
                start: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.startOffset) + (script.codeOffset() || 0)),
                end: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.endOffset) + (script.codeOffset() || 0)),
            }));
        }
    }
    async uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const locationRanges = await this.uiLocationToRawLocationRanges(uiSourceCode, lineNumber, columnNumber);
        if (!locationRanges) {
            return null;
        }
        return locationRanges.map(({ start }) => start);
    }
    scriptsForUISourceCode(uiSourceCode) {
        for (const modelData of this.#debuggerModelToData.values()) {
            const scripts = modelData.uiSourceCodeToScripts.get(uiSourceCode);
            if (scripts) {
                return scripts;
            }
        }
        return [];
    }
    parsedScriptSource(event) {
        const script = event.data;
        if (!script.sourceURL) {
            return;
        }
        for (const plugin of this.#plugins) {
            if (!plugin.handleScript(script)) {
                return;
            }
            const rawModuleId = rawModuleIdForScript(script);
            let rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
            if (!rawModuleHandle) {
                const sourceFileURLsPromise = (async () => {
                    const console = Common.Console.Console.instance();
                    const url = script.sourceURL;
                    const symbolsUrl = (script.debugSymbols && script.debugSymbols.externalURL) || '';
                    if (symbolsUrl) {
                        console.log(i18nString(UIStrings.loadingDebugSymbolsForVia, { PH1: plugin.name, PH2: url, PH3: symbolsUrl }));
                    }
                    else {
                        console.log(i18nString(UIStrings.loadingDebugSymbolsFor, { PH1: plugin.name, PH2: url }));
                    }
                    try {
                        const code = (!symbolsUrl && url.startsWith('wasm://')) ? await script.getWasmBytecode() : undefined;
                        const addModuleResult = await plugin.addRawModule(rawModuleId, symbolsUrl, { url, code });
                        // Check that the handle isn't stale by now. This works because the code that assigns to
                        // `rawModuleHandle` below will run before this code because of the `await` in the preceding
                        // line. This is primarily to avoid logging the message below, which would give the developer
                        // the misleading information that we're done, while in reality it was a stale call that finished.
                        if (rawModuleHandle !== this.#rawModuleHandles.get(rawModuleId)) {
                            return [];
                        }
                        if ('missingSymbolFiles' in addModuleResult) {
                            return { missingSymbolFiles: addModuleResult.missingSymbolFiles };
                        }
                        const sourceFileURLs = addModuleResult;
                        if (sourceFileURLs.length === 0) {
                            console.warn(i18nString(UIStrings.loadedDebugSymbolsForButDidnt, { PH1: plugin.name, PH2: url }));
                        }
                        else {
                            console.log(i18nString(UIStrings.loadedDebugSymbolsForFound, { PH1: plugin.name, PH2: url, PH3: sourceFileURLs.length }));
                        }
                        return sourceFileURLs;
                    }
                    catch (error) {
                        console.error(i18nString(UIStrings.failedToLoadDebugSymbolsFor, { PH1: plugin.name, PH2: url, PH3: error.message }));
                        this.#rawModuleHandles.delete(rawModuleId);
                        return [];
                    }
                })();
                rawModuleHandle = { rawModuleId, plugin, scripts: [script], addRawModulePromise: sourceFileURLsPromise };
                this.#rawModuleHandles.set(rawModuleId, rawModuleHandle);
            }
            else {
                rawModuleHandle.scripts.push(script);
            }
            // Wait for the addRawModule call to finish and
            // update the #project. It's important to check
            // for the DebuggerModel again, which may disappear
            // in the meantime...
            void rawModuleHandle.addRawModulePromise.then(sourceFileURLs => {
                if (!('missingSymbolFiles' in sourceFileURLs)) {
                    // The script might have disappeared meanwhile...
                    if (script.debuggerModel.scriptForId(script.scriptId) === script) {
                        const modelData = this.#debuggerModelToData.get(script.debuggerModel);
                        if (modelData) { // The DebuggerModel could have disappeared meanwhile...
                            modelData.addSourceFiles(script, sourceFileURLs);
                            void this.#debuggerWorkspaceBinding.updateLocations(script);
                        }
                    }
                }
            });
            return;
        }
    }
    debuggerResumed(event) {
        const resumedFrames = Array.from(this.callFrameByStopId.values()).filter(callFrame => callFrame.debuggerModel === event.data);
        for (const callFrame of resumedFrames) {
            const stopId = this.stopIdByCallFrame.get(callFrame);
            assertNotNullOrUndefined(stopId);
            this.stopIdByCallFrame.delete(callFrame);
            this.callFrameByStopId.delete(stopId);
        }
    }
    getSourcesForScript(script) {
        const rawModuleId = rawModuleIdForScript(script);
        const rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
        if (rawModuleHandle) {
            return rawModuleHandle.addRawModulePromise;
        }
        return Promise.resolve(undefined);
    }
    async resolveScopeChain(callFrame) {
        const script = callFrame.script;
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return null;
        }
        const location = {
            rawModuleId,
            codeOffset: callFrame.location().columnNumber - (script.codeOffset() || 0),
            inlineFrameIndex: callFrame.inlineFrameIndex,
        };
        const stopId = this.stopIdForCallFrame(callFrame);
        try {
            const sourceMapping = await plugin.rawLocationToSourceLocation(location);
            if (sourceMapping.length === 0) {
                return null;
            }
            const scopes = new Map();
            const variables = await plugin.listVariablesInScope(location);
            for (const variable of variables || []) {
                let scope = scopes.get(variable.scope);
                if (!scope) {
                    const { type, typeName, icon } = await plugin.getScopeInfo(variable.scope);
                    scope = new SourceScope(callFrame, stopId, type, typeName, icon, plugin);
                    scopes.set(variable.scope, scope);
                }
                scope.object().variables.push(variable);
            }
            return Array.from(scopes.values());
        }
        catch (error) {
            Common.Console.Console.instance().error(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
            return null;
        }
    }
    async getFunctionInfo(script, location) {
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return null;
        }
        const rawLocation = {
            rawModuleId,
            codeOffset: location.columnNumber - (script.codeOffset() || 0),
            inlineFrameIndex: 0,
        };
        try {
            const functionInfo = await plugin.getFunctionInfo(rawLocation);
            return functionInfo;
        }
        catch (error) {
            Common.Console.Console.instance().warn(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
            return { frames: [] };
        }
    }
    async getInlinedFunctionRanges(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return [];
        }
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return [];
        }
        const pluginLocation = {
            rawModuleId,
            // RawLocation.#columnNumber is the byte offset in the full raw wasm module. Plugins expect the offset in the code
            // section, so subtract the offset of the code section in the module here.
            codeOffset: rawLocation.columnNumber - (script.codeOffset() || 0),
        };
        try {
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
            // @ts-ignore
            const locations = await plugin.getInlinedFunctionRanges(pluginLocation);
            return locations.map(m => ({
                start: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.startOffset) + (script.codeOffset() || 0)),
                end: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.endOffset) + (script.codeOffset() || 0)),
            }));
        }
        catch (error) {
            Common.Console.Console.instance().warn(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
            return [];
        }
    }
    async getInlinedCalleesRanges(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return [];
        }
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return [];
        }
        const pluginLocation = {
            rawModuleId,
            // RawLocation.#columnNumber is the byte offset in the full raw wasm module. Plugins expect the offset in the code
            // section, so subtract the offset of the code section in the module here.
            codeOffset: rawLocation.columnNumber - (script.codeOffset() || 0),
        };
        try {
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
            // @ts-ignore
            const locations = await plugin.getInlinedCalleesRanges(pluginLocation);
            return locations.map(m => ({
                start: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.startOffset) + (script.codeOffset() || 0)),
                end: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.endOffset) + (script.codeOffset() || 0)),
            }));
        }
        catch (error) {
            Common.Console.Console.instance().warn(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
            return [];
        }
    }
    async getMappedLines(uiSourceCode) {
        const rawModuleIds = await Promise.all(this.scriptsForUISourceCode(uiSourceCode).map(s => this.rawModuleIdAndPluginForScript(s)));
        let mappedLines;
        for (const { rawModuleId, plugin } of rawModuleIds) {
            if (!plugin) {
                continue;
            }
            const lines = await plugin.getMappedLines(rawModuleId, uiSourceCode.url());
            if (lines === undefined) {
                continue;
            }
            if (mappedLines === undefined) {
                mappedLines = new Set(lines);
            }
            else {
                /**
                 * @param {number} l
                 */
                lines.forEach(l => mappedLines.add(l));
            }
        }
        return mappedLines;
    }
}
class ModelData {
    project;
    uiSourceCodeToScripts;
    constructor(debuggerModel, workspace) {
        this.project = new ContentProviderBasedProject(workspace, 'language_plugins::' + debuggerModel.target().id(), Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */);
        NetworkProject.setTargetForProject(this.project, debuggerModel.target());
        this.uiSourceCodeToScripts = new Map();
    }
    addSourceFiles(script, urls) {
        const initiator = script.createPageResourceLoadInitiator();
        for (const url of urls) {
            let uiSourceCode = this.project.uiSourceCodeForURL(url);
            if (!uiSourceCode) {
                uiSourceCode = this.project.createUISourceCode(url, Common.ResourceType.resourceTypes.SourceMapScript);
                NetworkProject.setInitialFrameAttribution(uiSourceCode, script.frameId);
                // Bind the uiSourceCode to the script first before we add the
                // uiSourceCode to the #project and thereby notify the rest of
                // the system about the new source file.
                // https://crbug.com/1150295 is an example where the breakpoint
                // resolution logic kicks in right after adding the uiSourceCode
                // and at that point we already need to have the mapping in place
                // otherwise we will not get the breakpoint right.
                this.uiSourceCodeToScripts.set(uiSourceCode, [script]);
                const contentProvider = new SDK.CompilerSourceMappingContentProvider.CompilerSourceMappingContentProvider(url, Common.ResourceType.resourceTypes.SourceMapScript, initiator);
                const mimeType = Common.ResourceType.ResourceType.mimeFromURL(url) || 'text/javascript';
                this.project.addUISourceCodeWithProvider(uiSourceCode, contentProvider, null, mimeType);
            }
            else {
                // The same uiSourceCode can be provided by different scripts,
                // but we don't expect that to happen frequently.
                const scripts = this.uiSourceCodeToScripts.get(uiSourceCode);
                if (!scripts.includes(script)) {
                    scripts.push(script);
                }
            }
        }
    }
    removeScript(script) {
        this.uiSourceCodeToScripts.forEach((scripts, uiSourceCode) => {
            scripts = scripts.filter(s => s !== script);
            if (scripts.length === 0) {
                this.uiSourceCodeToScripts.delete(uiSourceCode);
                this.project.removeUISourceCode(uiSourceCode.url());
            }
            else {
                this.uiSourceCodeToScripts.set(uiSourceCode, scripts);
            }
        });
    }
    dispose() {
        this.project.dispose();
    }
    getProject() {
        return this.project;
    }
}
//# sourceMappingURL=DebuggerLanguagePlugins.js.map