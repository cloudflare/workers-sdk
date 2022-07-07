import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Platform from '../../core/platform/platform.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as TextUtils from '../text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
export declare class BreakpointManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    readonly storage: Storage;
    readonly targetManager: SDK.TargetManager.TargetManager;
    readonly debuggerWorkspaceBinding: DebuggerWorkspaceBinding;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
        targetManager: SDK.TargetManager.TargetManager | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
        debuggerWorkspaceBinding: DebuggerWorkspaceBinding | null;
    }): BreakpointManager;
    static breakpointStorageId(url: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber?: number): string;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    addUpdateBindingsCallback(callback: ((uiSourceCode: Workspace.UISourceCode.UISourceCode) => Promise<void>)): void;
    copyBreakpoints(fromURL: Platform.DevToolsPath.UrlString, toSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
    restoreBreakpointsForScript(script: SDK.Script.Script): Promise<void>;
    getUISourceCodeWithUpdatedBreakpointInfo(script: SDK.Script.Script): Promise<Workspace.UISourceCode.UISourceCode>;
    private restoreBreakpoints;
    private uiSourceCodeAdded;
    private uiSourceCodeRemoved;
    private projectRemoved;
    private removeUISourceCode;
    setBreakpoint(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number | undefined, condition: string, enabled: boolean): Promise<Breakpoint>;
    private innerSetBreakpoint;
    findBreakpoint(uiLocation: Workspace.UISourceCode.UILocation): BreakpointLocation | null;
    possibleBreakpoints(uiSourceCode: Workspace.UISourceCode.UISourceCode, textRange: TextUtils.TextRange.TextRange): Promise<Workspace.UISourceCode.UILocation[]>;
    breakpointLocationsForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): BreakpointLocation[];
    allBreakpointLocations(): BreakpointLocation[];
    removeBreakpoint(breakpoint: Breakpoint, removeFromStorage: boolean): void;
    uiLocationAdded(breakpoint: Breakpoint, uiLocation: Workspace.UISourceCode.UILocation): void;
    uiLocationRemoved(breakpoint: Breakpoint, uiLocation: Workspace.UISourceCode.UILocation): void;
}
export declare enum Events {
    BreakpointAdded = "breakpoint-added",
    BreakpointRemoved = "breakpoint-removed"
}
export declare type EventTypes = {
    [Events.BreakpointAdded]: BreakpointLocation;
    [Events.BreakpointRemoved]: BreakpointLocation;
};
export declare const enum DebuggerUpdateResult {
    OK = "OK",
    ERROR_BREAKPOINT_CLASH = "ERROR_BREAKPOINT_CLASH",
    ERROR_BACKEND = "ERROR_BACKEND",
    PENDING = "PENDING"
}
export declare type ScheduleUpdateResult = DebuggerUpdateResult.OK | DebuggerUpdateResult.ERROR_BACKEND | DebuggerUpdateResult.ERROR_BREAKPOINT_CLASH;
export declare class Breakpoint implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    readonly breakpointManager: BreakpointManager;
    urlInternal: Platform.DevToolsPath.UrlString;
    uiSourceCodes: Set<Workspace.UISourceCode.UISourceCode>;
    isRemoved: boolean;
    currentState: Breakpoint.State | null;
    constructor(breakpointManager: BreakpointManager, primaryUISourceCode: Workspace.UISourceCode.UISourceCode, url: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber: number | undefined, condition: string, enabled: boolean);
    refreshInDebugger(): Promise<void>;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelBreakpoint(debuggerModel: SDK.DebuggerModel.DebuggerModel): ModelBreakpoint | undefined;
    addUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    clearUISourceCodes(): void;
    removeUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    url(): Platform.DevToolsPath.UrlString;
    lineNumber(): number;
    columnNumber(): number | undefined;
    uiLocationAdded(uiLocation: Workspace.UISourceCode.UILocation): void;
    uiLocationRemoved(uiLocation: Workspace.UISourceCode.UILocation): void;
    enabled(): boolean;
    bound(): boolean;
    hasBoundScript(): boolean;
    setEnabled(enabled: boolean): void;
    condition(): string;
    setCondition(condition: string): void;
    updateState(condition: string, enabled: boolean): void;
    updateBreakpoint(): Promise<void>;
    remove(keepInStorage: boolean): Promise<void>;
    breakpointStorageId(): string;
    private defaultUILocation;
    private removeAllUnboundLocations;
    private addAllUnboundLocations;
    getUiSourceCodes(): Set<Workspace.UISourceCode.UISourceCode>;
    getIsRemoved(): boolean;
}
export declare class ModelBreakpoint {
    #private;
    constructor(debuggerModel: SDK.DebuggerModel.DebuggerModel, breakpoint: Breakpoint, debuggerWorkspaceBinding: DebuggerWorkspaceBinding);
    get currentState(): Breakpoint.State | null;
    resetLocations(): void;
    scheduleUpdateInDebugger(): Promise<ScheduleUpdateResult>;
    private scriptDiverged;
    resetBreakpoint(): Promise<void>;
    private didRemoveFromDebugger;
    private breakpointResolved;
    private locationUpdated;
    private addResolvedLocation;
    cleanUpAfterDebuggerIsGone(): void;
}
interface Position {
    url: Platform.DevToolsPath.UrlString;
    scriptId: Protocol.Runtime.ScriptId;
    scriptHash: string;
    lineNumber: number;
    columnNumber?: number;
}
export declare namespace Breakpoint {
    class State {
        positions: Position[];
        condition: string;
        constructor(positions: Position[], condition: string);
        static equals(stateA?: State | null, stateB?: State | null): boolean;
    }
}
declare class Storage {
    #private;
    constructor();
    get setting(): Common.Settings.Setting<Storage.Item[]>;
    mute(): void;
    unmute(): void;
    breakpointItems(url: Platform.DevToolsPath.UrlString): Storage.Item[];
    updateBreakpoint(breakpoint: Breakpoint): void;
    removeBreakpoint(breakpoint: Breakpoint): void;
    private save;
}
declare namespace Storage {
    class Item {
        url: Platform.DevToolsPath.UrlString;
        lineNumber: number;
        columnNumber?: number;
        condition: string;
        enabled: boolean;
        constructor(breakpoint: Breakpoint);
    }
}
export interface BreakpointLocation {
    breakpoint: Breakpoint;
    uiLocation: Workspace.UISourceCode.UILocation;
}
export {};
