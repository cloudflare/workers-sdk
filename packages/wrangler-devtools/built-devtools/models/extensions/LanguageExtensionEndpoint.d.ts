import type * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../bindings/bindings.js';
import type { Chrome } from '../../../extension-api/ExtensionAPI.js';
export declare class LanguageExtensionEndpoint implements Bindings.DebuggerLanguagePlugins.DebuggerLanguagePlugin {
    private readonly supportedScriptTypes;
    private endpoint;
    name: string;
    constructor(name: string, supportedScriptTypes: {
        language: string;
        symbol_types: Array<string>;
    }, port: MessagePort);
    handleScript(script: SDK.Script.Script): boolean;
    /** Notify the plugin about a new script
       */
    addRawModule(rawModuleId: string, symbolsURL: string, rawModule: Chrome.DevTools.RawModule): Promise<string[]>;
    /**
     * Notifies the plugin that a script is removed.
     */
    removeRawModule(rawModuleId: string): Promise<void>;
    /** Find locations in raw modules from a location in a source file
       */
    sourceLocationToRawLocation(sourceLocation: Chrome.DevTools.SourceLocation): Promise<Chrome.DevTools.RawLocationRange[]>;
    /** Find locations in source files from a location in a raw module
       */
    rawLocationToSourceLocation(rawLocation: Chrome.DevTools.RawLocation): Promise<Chrome.DevTools.SourceLocation[]>;
    getScopeInfo(type: string): Promise<Chrome.DevTools.ScopeInfo>;
    /** List all variables in lexical scope at a given location in a raw module
       */
    listVariablesInScope(rawLocation: Chrome.DevTools.RawLocation): Promise<Chrome.DevTools.Variable[]>;
    /** List all function names (including inlined frames) at location
       */
    getFunctionInfo(rawLocation: Chrome.DevTools.RawLocation): Promise<{
        frames: Array<Chrome.DevTools.FunctionInfo>;
    }>;
    /** Find locations in raw modules corresponding to the inline function
       *  that rawLocation is in.
       */
    getInlinedFunctionRanges(rawLocation: Chrome.DevTools.RawLocation): Promise<Chrome.DevTools.RawLocationRange[]>;
    /** Find locations in raw modules corresponding to inline functions
       *  called by the function or inline frame that rawLocation is in.
       */
    getInlinedCalleesRanges(rawLocation: Chrome.DevTools.RawLocation): Promise<Chrome.DevTools.RawLocationRange[]>;
    getTypeInfo(expression: string, context: Chrome.DevTools.RawLocation): Promise<{
        typeInfos: Array<Chrome.DevTools.TypeInfo>;
        base: Chrome.DevTools.EvalBase;
    } | null>;
    getFormatter(expressionOrField: string | {
        base: Chrome.DevTools.EvalBase;
        field: Array<Chrome.DevTools.FieldInfo>;
    }, context: Chrome.DevTools.RawLocation): Promise<{
        js: string;
    }>;
    getInspectableAddress(field: {
        base: Chrome.DevTools.EvalBase;
        field: Array<Chrome.DevTools.FieldInfo>;
    }): Promise<{
        js: string;
    }>;
    getMappedLines(rawModuleId: string, sourceFileURL: string): Promise<number[] | undefined>;
    evaluate(expression: string, context: Chrome.DevTools.RawLocation, stopId: number): Promise<Chrome.DevTools.RemoteObject>;
    getProperties(objectId: Chrome.DevTools.RemoteObjectId): Promise<Chrome.DevTools.PropertyDescriptor[]>;
    releaseObject(objectId: Chrome.DevTools.RemoteObjectId): Promise<void>;
}
