import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class ConsoleContextSelector implements SDK.TargetManager.SDKModelObserver<SDK.RuntimeModel.RuntimeModel>, UI.SoftDropDown.Delegate<SDK.RuntimeModel.ExecutionContext> {
    private readonly items;
    private readonly dropDown;
    private readonly toolbarItemInternal;
    constructor();
    toolbarItem(): UI.Toolbar.ToolbarItem;
    highlightedItemChanged(from: SDK.RuntimeModel.ExecutionContext | null, to: SDK.RuntimeModel.ExecutionContext | null, fromElement: Element | null, toElement: Element | null): void;
    titleFor(executionContext: SDK.RuntimeModel.ExecutionContext): string;
    private depthFor;
    private executionContextCreated;
    private onExecutionContextCreated;
    private onExecutionContextChanged;
    private executionContextDestroyed;
    private onExecutionContextDestroyed;
    private executionContextChangedExternally;
    private isTopContext;
    private hasTopContext;
    modelAdded(runtimeModel: SDK.RuntimeModel.RuntimeModel): void;
    modelRemoved(runtimeModel: SDK.RuntimeModel.RuntimeModel): void;
    createElementForItem(item: SDK.RuntimeModel.ExecutionContext): Element;
    private subtitleFor;
    isItemSelectable(item: SDK.RuntimeModel.ExecutionContext): boolean;
    itemSelected(item: SDK.RuntimeModel.ExecutionContext | null): void;
    private callFrameSelectedInUI;
    private callFrameSelectedInModel;
    private frameNavigated;
}
