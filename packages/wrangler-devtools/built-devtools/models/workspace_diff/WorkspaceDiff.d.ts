import * as Common from '../../core/common/common.js';
import * as Diff from '../../third_party/diff/diff.js';
import * as FormatterModule from '../formatter/formatter.js';
import * as Workspace from '../workspace/workspace.js';
interface DiffRequestOptions {
    shouldFormatDiff: boolean;
}
interface DiffResponse {
    diff: Diff.Diff.DiffArray;
    formattedCurrentMapping?: FormatterModule.ScriptFormatter.FormatterSourceMapping;
}
export declare class WorkspaceDiffImpl extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private readonly uiSourceCodeDiffs;
    private readonly loadingUISourceCodes;
    private readonly modifiedUISourceCodesInternal;
    constructor(workspace: Workspace.Workspace.WorkspaceImpl);
    requestDiff(uiSourceCode: Workspace.UISourceCode.UISourceCode, diffRequestOptions: DiffRequestOptions): Promise<DiffResponse | null>;
    subscribeToDiffChange(uiSourceCode: Workspace.UISourceCode.UISourceCode, callback: () => void, thisObj?: Object): void;
    unsubscribeFromDiffChange(uiSourceCode: Workspace.UISourceCode.UISourceCode, callback: () => void, thisObj?: Object): void;
    modifiedUISourceCodes(): Workspace.UISourceCode.UISourceCode[];
    isUISourceCodeModified(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    private uiSourceCodeDiff;
    private uiSourceCodeChanged;
    private uiSourceCodeAdded;
    private uiSourceCodeRemoved;
    private projectRemoved;
    private removeUISourceCode;
    private markAsUnmodified;
    private markAsModified;
    private uiSourceCodeProcessedForTest;
    private updateModifiedState;
    requestOriginalContentForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<string | null>;
    revertToOriginal(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
}
export declare const enum Events {
    ModifiedStatusChanged = "ModifiedStatusChanged"
}
export interface ModifiedStatusChangedEvent {
    uiSourceCode: Workspace.UISourceCode.UISourceCode;
    isModified: boolean;
}
export declare type EventTypes = {
    [Events.ModifiedStatusChanged]: ModifiedStatusChangedEvent;
};
export declare class UISourceCodeDiff extends Common.ObjectWrapper.ObjectWrapper<UISourceCodeDiffEventTypes> {
    private uiSourceCode;
    private requestDiffPromise;
    private pendingChanges;
    dispose: boolean;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode);
    private uiSourceCodeChanged;
    requestDiff(diffRequestOptions: DiffRequestOptions): Promise<DiffResponse | null>;
    originalContent(): Promise<string | null>;
    private innerRequestDiff;
}
export declare enum UISourceCodeDiffEvents {
    DiffChanged = "DiffChanged"
}
export declare type UISourceCodeDiffEventTypes = {
    [UISourceCodeDiffEvents.DiffChanged]: void;
};
export declare function workspaceDiff(): WorkspaceDiffImpl;
export declare class DiffUILocation {
    uiSourceCode: Workspace.UISourceCode.UISourceCode;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode);
}
export declare const UpdateTimeout = 200;
export {};
