import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as WorkspaceDiff from '../../models/workspace_diff/workspace_diff.js';
import * as UI from '../../ui/legacy/legacy.js';
declare const ChangesSidebar_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.SelectedUISourceCodeChanged>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.SelectedUISourceCodeChanged>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.SelectedUISourceCodeChanged>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.SelectedUISourceCodeChanged): boolean;
    dispatchEventToListeners<T_3 extends Events.SelectedUISourceCodeChanged>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.Widget;
export declare class ChangesSidebar extends ChangesSidebar_base {
    private treeoutline;
    private readonly treeElements;
    private readonly workspaceDiff;
    constructor(workspaceDiff: WorkspaceDiff.WorkspaceDiff.WorkspaceDiffImpl);
    selectUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode, omitFocus?: boolean | undefined): void;
    selectedUISourceCode(): Workspace.UISourceCode.UISourceCode | null;
    private selectionChanged;
    private uiSourceCodeMofiedStatusChanged;
    private removeUISourceCode;
    private addUISourceCode;
    wasShown(): void;
}
export declare const enum Events {
    SelectedUISourceCodeChanged = "SelectedUISourceCodeChanged"
}
export declare type EventTypes = {
    [Events.SelectedUISourceCodeChanged]: void;
};
export declare class UISourceCodeTreeElement extends UI.TreeOutline.TreeElement {
    uiSourceCode: Workspace.UISourceCode.UISourceCode;
    private readonly eventListeners;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode);
    private updateTitle;
    dispose(): void;
}
export {};
