import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class ThreadsSidebarPane extends UI.Widget.VBox implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel>, UI.ListControl.ListDelegate<SDK.DebuggerModel.DebuggerModel> {
    private readonly items;
    private readonly list;
    private selectedModel;
    private constructor();
    static instance(): ThreadsSidebarPane;
    static shouldBeShown(): boolean;
    createElementForItem(debuggerModel: SDK.DebuggerModel.DebuggerModel): Element;
    heightForItem(_debuggerModel: SDK.DebuggerModel.DebuggerModel): number;
    isItemSelectable(_debuggerModel: SDK.DebuggerModel.DebuggerModel): boolean;
    selectedItemChanged(_from: SDK.DebuggerModel.DebuggerModel | null, _to: SDK.DebuggerModel.DebuggerModel | null, fromElement: Element | null, toElement: Element | null): void;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    private targetFlavorChanged;
    wasShown(): void;
}
