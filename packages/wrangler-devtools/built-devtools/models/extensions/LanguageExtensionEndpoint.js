// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Bindings from '../bindings/bindings.js';
import { ExtensionEndpoint } from './ExtensionEndpoint.js';
class LanguageExtensionEndpointImpl extends ExtensionEndpoint {
    plugin;
    constructor(plugin, port) {
        super(port);
        this.plugin = plugin;
    }
    handleEvent({ event }) {
        switch (event) {
            case "unregisteredLanguageExtensionPlugin" /* UnregisteredLanguageExtensionPlugin */: {
                this.disconnect();
                const { pluginManager } = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance();
                if (pluginManager) {
                    pluginManager.removePlugin(this.plugin);
                }
                break;
            }
        }
    }
}
export class LanguageExtensionEndpoint {
    supportedScriptTypes;
    endpoint;
    name;
    constructor(name, supportedScriptTypes, port) {
        this.name = name;
        this.supportedScriptTypes = supportedScriptTypes;
        this.endpoint = new LanguageExtensionEndpointImpl(this, port);
    }
    handleScript(script) {
        const language = script.scriptLanguage();
        return language !== null && script.debugSymbols !== null && language === this.supportedScriptTypes.language &&
            this.supportedScriptTypes.symbol_types.includes(script.debugSymbols.type);
    }
    /** Notify the plugin about a new script
       */
    addRawModule(rawModuleId, symbolsURL, rawModule) {
        return this.endpoint.sendRequest("addRawModule" /* AddRawModule */, { rawModuleId, symbolsURL, rawModule });
    }
    /**
     * Notifies the plugin that a script is removed.
     */
    removeRawModule(rawModuleId) {
        return this.endpoint.sendRequest("removeRawModule" /* RemoveRawModule */, { rawModuleId });
    }
    /** Find locations in raw modules from a location in a source file
       */
    sourceLocationToRawLocation(sourceLocation) {
        return this.endpoint.sendRequest("sourceLocationToRawLocation" /* SourceLocationToRawLocation */, { sourceLocation });
    }
    /** Find locations in source files from a location in a raw module
       */
    rawLocationToSourceLocation(rawLocation) {
        return this.endpoint.sendRequest("rawLocationToSourceLocation" /* RawLocationToSourceLocation */, { rawLocation });
    }
    getScopeInfo(type) {
        return this.endpoint.sendRequest("getScopeInfo" /* GetScopeInfo */, { type });
    }
    /** List all variables in lexical scope at a given location in a raw module
       */
    listVariablesInScope(rawLocation) {
        return this.endpoint.sendRequest("listVariablesInScope" /* ListVariablesInScope */, { rawLocation });
    }
    /** List all function names (including inlined frames) at location
       */
    getFunctionInfo(rawLocation) {
        return this.endpoint.sendRequest("getFunctionInfo" /* GetFunctionInfo */, { rawLocation });
    }
    /** Find locations in raw modules corresponding to the inline function
       *  that rawLocation is in.
       */
    getInlinedFunctionRanges(rawLocation) {
        return this.endpoint.sendRequest("getInlinedFunctionRanges" /* GetInlinedFunctionRanges */, { rawLocation });
    }
    /** Find locations in raw modules corresponding to inline functions
       *  called by the function or inline frame that rawLocation is in.
       */
    getInlinedCalleesRanges(rawLocation) {
        return this.endpoint.sendRequest("getInlinedCalleesRanges" /* GetInlinedCalleesRanges */, { rawLocation });
    }
    getTypeInfo(expression, context) {
        return this.endpoint.sendRequest("getTypeInfo" /* GetTypeInfo */, { expression, context });
    }
    getFormatter(expressionOrField, context) {
        return this.endpoint.sendRequest("getFormatter" /* GetFormatter */, { expressionOrField, context });
    }
    getInspectableAddress(field) {
        return this.endpoint.sendRequest("getInspectableAddress" /* GetInspectableAddress */, { field });
    }
    async getMappedLines(rawModuleId, sourceFileURL) {
        return this.endpoint.sendRequest("getMappedLines" /* GetMappedLines */, { rawModuleId, sourceFileURL });
    }
    evaluate(expression, context, stopId) {
        return this.endpoint.sendRequest("formatValue" /* FormatValue */, { expression, context, stopId });
    }
    getProperties(objectId) {
        return this.endpoint.sendRequest("getProperties" /* GetProperties */, { objectId });
    }
    releaseObject(objectId) {
        return this.endpoint.sendRequest("releaseObject" /* ReleaseObject */, { objectId });
    }
}
//# sourceMappingURL=LanguageExtensionEndpoint.js.map