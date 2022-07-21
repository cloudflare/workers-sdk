import type * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class AccessibilityTreeView extends UI.Widget.VBox implements SDK.TargetManager.SDKModelObserver<SDK.AccessibilityModel.AccessibilityModel> {
    private accessibilityTreeComponent;
    private readonly toggleButton;
    private inspectedDOMNode;
    private root;
    constructor(toggleButton: HTMLElement);
    wasShown(): Promise<void>;
    refreshAccessibilityTree(): Promise<void>;
    renderTree(): Promise<void>;
    loadSubTreeIntoAccessibilityModel(selectedNode: SDK.DOMModel.DOMNode): Promise<void>;
    revealAndSelectNode(inspectedNode: SDK.DOMModel.DOMNode): Promise<void>;
    selectedNodeChanged(inspectedNode: SDK.DOMModel.DOMNode): Promise<void>;
    treeUpdated({ data }: Common.EventTarget.EventTargetEvent<SDK.AccessibilityModel.EventTypes[SDK.AccessibilityModel.Events.TreeUpdated]>): void;
    modelAdded(model: SDK.AccessibilityModel.AccessibilityModel): void;
    modelRemoved(model: SDK.AccessibilityModel.AccessibilityModel): void;
}
