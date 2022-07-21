import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import type { RemoteObject } from './RemoteObject.js';
import type { EvaluationOptions, EvaluationResult, ExecutionContext } from './RuntimeModel.js';
import { RuntimeModel } from './RuntimeModel.js';
import { Script } from './Script.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { SourceMapManager } from './SourceMapManager.js';
export declare function sortAndMergeRanges(locationRanges: LocationRange[]): LocationRange[];
export declare enum StepMode {
    StepInto = "StepInto",
    StepOut = "StepOut",
    StepOver = "StepOver"
}
export declare class DebuggerModel extends SDKModel<EventTypes> {
    #private;
    readonly agent: ProtocolProxyApi.DebuggerApi;
    runtimeModelInternal: RuntimeModel;
    continueToLocationCallback: ((arg0: DebuggerPausedDetails) => boolean) | null;
    evaluateOnCallFrameCallback: ((arg0: CallFrame, arg1: EvaluationOptions) => Promise<EvaluationResult | null>) | null;
    constructor(target: Target);
    static sourceMapId(executionContextId: number, sourceURL: string, sourceMapURL: string | undefined): string | null;
    sourceMapManager(): SourceMapManager<Script>;
    runtimeModel(): RuntimeModel;
    debuggerEnabled(): boolean;
    debuggerId(): string | null;
    private enableDebugger;
    syncDebuggerId(): Promise<Protocol.Debugger.EnableResponse>;
    private onFrameNavigated;
    private registerDebugger;
    isReadyToPause(): boolean;
    static modelForDebuggerId(debuggerId: string): Promise<DebuggerModel | null>;
    static resyncDebuggerIdForModels(): Promise<void>;
    private disableDebugger;
    private skipAllPauses;
    skipAllPausesUntilReloadOrTimeout(timeout: number): void;
    private pauseOnExceptionStateChanged;
    private asyncStackTracesStateChanged;
    private breakpointsActiveChanged;
    setComputeAutoStepRangesCallback(callback: ((arg0: StepMode, arg1: CallFrame) => Promise<Array<{
        start: Location;
        end: Location;
    }>>) | null): void;
    private computeAutoStepSkipList;
    stepInto(): Promise<void>;
    stepOver(): Promise<void>;
    stepOut(): Promise<void>;
    scheduleStepIntoAsync(): void;
    resume(): void;
    pause(): void;
    setBreakpointByURL(url: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber?: number, condition?: string): Promise<SetBreakpointResult>;
    setBreakpointInAnonymousScript(scriptId: Protocol.Runtime.ScriptId, scriptHash: string, lineNumber: number, columnNumber?: number, condition?: string): Promise<SetBreakpointResult>;
    private setBreakpointBySourceId;
    removeBreakpoint(breakpointId: Protocol.Debugger.BreakpointId): Promise<void>;
    getPossibleBreakpoints(startLocation: Location, endLocation: Location | null, restrictToFunction: boolean): Promise<BreakLocation[]>;
    fetchAsyncStackTrace(stackId: Protocol.Runtime.StackTraceId): Promise<Protocol.Runtime.StackTrace | null>;
    breakpointResolved(breakpointId: string, location: Protocol.Debugger.Location): void;
    globalObjectCleared(): void;
    private reset;
    scripts(): Script[];
    scriptForId(scriptId: string): Script | null;
    /**
     * Returns all `Script` objects with the same provided `sourceURL`. The
     * resulting array is sorted by time with the newest `Script` in the front.
     */
    scriptsForSourceURL(sourceURL: string | null): Script[];
    scriptsForExecutionContext(executionContext: ExecutionContext): Script[];
    get callFrames(): CallFrame[] | null;
    debuggerPausedDetails(): DebuggerPausedDetails | null;
    private setDebuggerPausedDetails;
    setBeforePausedCallback(callback: ((arg0: DebuggerPausedDetails) => boolean) | null): void;
    setExpandCallFramesCallback(callback: ((arg0: Array<CallFrame>) => Promise<Array<CallFrame>>) | null): void;
    setEvaluateOnCallFrameCallback(callback: ((arg0: CallFrame, arg1: EvaluationOptions) => Promise<EvaluationResult | null>) | null): void;
    setSynchronizeBreakpointsCallback(callback: ((script: Script) => Promise<void>) | null): void;
    pausedScript(callFrames: Protocol.Debugger.CallFrame[], reason: Protocol.Debugger.PausedEventReason, auxData: Object | undefined, breakpointIds: string[], asyncStackTrace?: Protocol.Runtime.StackTrace, asyncStackTraceId?: Protocol.Runtime.StackTraceId): Promise<void>;
    resumedScript(): void;
    parsedScriptSource(scriptId: Protocol.Runtime.ScriptId, sourceURL: Platform.DevToolsPath.UrlString, startLine: number, startColumn: number, endLine: number, endColumn: number, executionContextId: number, hash: string, executionContextAuxData: any, isLiveEdit: boolean, sourceMapURL: Platform.DevToolsPath.UrlString | undefined, hasSourceURLComment: boolean, hasSyntaxError: boolean, length: number, isModule: boolean | null, originStackTrace: Protocol.Runtime.StackTrace | null, codeOffset: number | null, scriptLanguage: string | null, debugSymbols: Protocol.Debugger.DebugSymbols | null, embedderName: Platform.DevToolsPath.UrlString | null): Script;
    setSourceMapURL(script: Script, newSourceMapURL: Platform.DevToolsPath.UrlString): void;
    executionContextDestroyed(executionContext: ExecutionContext): void;
    private registerScript;
    private unregisterScript;
    private collectDiscardedScripts;
    createRawLocation(script: Script, lineNumber: number, columnNumber: number, inlineFrameIndex?: number): Location;
    createRawLocationByURL(sourceURL: string, lineNumber: number, columnNumber?: number, inlineFrameIndex?: number): Location | null;
    createRawLocationByScriptId(scriptId: Protocol.Runtime.ScriptId, lineNumber: number, columnNumber?: number, inlineFrameIndex?: number): Location;
    createRawLocationsByStackTrace(stackTrace: Protocol.Runtime.StackTrace): Location[];
    isPaused(): boolean;
    isPausing(): boolean;
    setSelectedCallFrame(callFrame: CallFrame | null): void;
    selectedCallFrame(): CallFrame | null;
    evaluateOnSelectedCallFrame(options: EvaluationOptions): Promise<EvaluationResult>;
    functionDetailsPromise(remoteObject: RemoteObject): Promise<FunctionDetails | null>;
    setVariableValue(scopeNumber: number, variableName: string, newValue: Protocol.Runtime.CallArgument, callFrameId: Protocol.Debugger.CallFrameId): Promise<string | undefined>;
    addBreakpointListener(breakpointId: string, listener: (arg0: Common.EventTarget.EventTargetEvent<Location>) => void, thisObject?: Object): void;
    removeBreakpointListener(breakpointId: string, listener: (arg0: Common.EventTarget.EventTargetEvent<Location>) => void, thisObject?: Object): void;
    setBlackboxPatterns(patterns: string[]): Promise<boolean>;
    dispose(): void;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    private static shouldResyncDebuggerId;
    getContinueToLocationCallback(): ((arg0: DebuggerPausedDetails) => boolean) | null;
    getEvaluateOnCallFrameCallback(): ((arg0: CallFrame, arg1: EvaluationOptions) => Promise<EvaluationResult | null>) | null;
}
export declare const _debuggerIdToModel: Map<string, DebuggerModel>;
/**
 * Keep these in sync with WebCore::V8Debugger
 */
export declare enum PauseOnExceptionsState {
    DontPauseOnExceptions = "none",
    PauseOnAllExceptions = "all",
    PauseOnUncaughtExceptions = "uncaught"
}
export declare enum Events {
    DebuggerWasEnabled = "DebuggerWasEnabled",
    DebuggerWasDisabled = "DebuggerWasDisabled",
    DebuggerPaused = "DebuggerPaused",
    DebuggerResumed = "DebuggerResumed",
    ParsedScriptSource = "ParsedScriptSource",
    DiscardedAnonymousScriptSource = "DiscardedAnonymousScriptSource",
    GlobalObjectCleared = "GlobalObjectCleared",
    CallFrameSelected = "CallFrameSelected",
    DebuggerIsReadyToPause = "DebuggerIsReadyToPause"
}
export declare type EventTypes = {
    [Events.DebuggerWasEnabled]: DebuggerModel;
    [Events.DebuggerWasDisabled]: DebuggerModel;
    [Events.DebuggerPaused]: DebuggerModel;
    [Events.DebuggerResumed]: DebuggerModel;
    [Events.ParsedScriptSource]: Script;
    [Events.DiscardedAnonymousScriptSource]: Script;
    [Events.GlobalObjectCleared]: DebuggerModel;
    [Events.CallFrameSelected]: DebuggerModel;
    [Events.DebuggerIsReadyToPause]: DebuggerModel;
};
export declare class Location {
    debuggerModel: DebuggerModel;
    scriptId: Protocol.Runtime.ScriptId;
    lineNumber: number;
    columnNumber: number;
    inlineFrameIndex: number;
    constructor(debuggerModel: DebuggerModel, scriptId: Protocol.Runtime.ScriptId, lineNumber: number, columnNumber?: number, inlineFrameIndex?: number);
    static fromPayload(debuggerModel: DebuggerModel, payload: Protocol.Debugger.Location, inlineFrameIndex?: number): Location;
    payload(): Protocol.Debugger.Location;
    script(): Script | null;
    continueToLocation(pausedCallback?: (() => void)): void;
    private paused;
    id(): string;
}
export declare class ScriptPosition {
    lineNumber: number;
    columnNumber: number;
    constructor(lineNumber: number, columnNumber: number);
    payload(): Protocol.Debugger.ScriptPosition;
    compareTo(other: ScriptPosition): number;
}
export declare class LocationRange {
    scriptId: Protocol.Runtime.ScriptId;
    start: ScriptPosition;
    end: ScriptPosition;
    constructor(scriptId: Protocol.Runtime.ScriptId, start: ScriptPosition, end: ScriptPosition);
    payload(): Protocol.Debugger.LocationRange;
    static comparator(location1: LocationRange, location2: LocationRange): number;
    compareTo(other: LocationRange): number;
    overlap(other: LocationRange): boolean;
}
export declare class BreakLocation extends Location {
    type: Protocol.Debugger.BreakLocationType | undefined;
    constructor(debuggerModel: DebuggerModel, scriptId: Protocol.Runtime.ScriptId, lineNumber: number, columnNumber?: number, type?: Protocol.Debugger.BreakLocationType);
    static fromPayload(debuggerModel: DebuggerModel, payload: Protocol.Debugger.BreakLocation): BreakLocation;
}
export interface MissingDebugInfoDetails {
    details: string;
    resources: string[];
}
export declare class CallFrame {
    #private;
    debuggerModel: DebuggerModel;
    payload: Protocol.Debugger.CallFrame;
    readonly canBeRestarted: boolean;
    constructor(debuggerModel: DebuggerModel, script: Script, payload: Protocol.Debugger.CallFrame, inlineFrameIndex?: number, functionName?: string);
    static fromPayloadArray(debuggerModel: DebuggerModel, callFrames: Protocol.Debugger.CallFrame[]): CallFrame[];
    createVirtualCallFrame(inlineFrameIndex: number, name: string): CallFrame;
    setMissingDebugInfoDetails(details: MissingDebugInfoDetails): void;
    get missingDebugInfoDetails(): MissingDebugInfoDetails | null;
    get script(): Script;
    get id(): Protocol.Debugger.CallFrameId;
    get inlineFrameIndex(): number;
    scopeChain(): Scope[];
    localScope(): Scope | null;
    thisObject(): RemoteObject | null;
    returnValue(): RemoteObject | null;
    setReturnValue(expression: string): Promise<RemoteObject | null>;
    get functionName(): string;
    location(): Location;
    functionLocation(): Location | null;
    evaluate(options: EvaluationOptions): Promise<EvaluationResult>;
    restart(): Promise<void>;
    getPayload(): Protocol.Debugger.CallFrame;
}
export interface ScopeChainEntry {
    callFrame(): CallFrame;
    type(): string;
    typeName(): string;
    name(): string | undefined;
    startLocation(): Location | null;
    endLocation(): Location | null;
    object(): RemoteObject;
    description(): string;
    icon(): string | undefined;
}
export declare class Scope implements ScopeChainEntry {
    #private;
    constructor(callFrame: CallFrame, ordinal: number);
    callFrame(): CallFrame;
    type(): string;
    typeName(): string;
    name(): string | undefined;
    startLocation(): Location | null;
    endLocation(): Location | null;
    object(): RemoteObject;
    description(): string;
    icon(): undefined;
}
export declare class DebuggerPausedDetails {
    debuggerModel: DebuggerModel;
    callFrames: CallFrame[];
    reason: Protocol.Debugger.PausedEventReason;
    auxData: {
        [x: string]: any;
    } | undefined;
    breakpointIds: string[];
    asyncStackTrace: Protocol.Runtime.StackTrace | undefined;
    asyncStackTraceId: Protocol.Runtime.StackTraceId | undefined;
    constructor(debuggerModel: DebuggerModel, callFrames: Protocol.Debugger.CallFrame[], reason: Protocol.Debugger.PausedEventReason, auxData: {
        [x: string]: any;
    } | undefined, breakpointIds: string[], asyncStackTrace?: Protocol.Runtime.StackTrace, asyncStackTraceId?: Protocol.Runtime.StackTraceId);
    exception(): RemoteObject | null;
    private cleanRedundantFrames;
}
export interface FunctionDetails {
    location: Location | null;
    functionName: string;
}
export interface SetBreakpointResult {
    breakpointId: Protocol.Debugger.BreakpointId | null;
    locations: Location[];
}
