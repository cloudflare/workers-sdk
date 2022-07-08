import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class AccessibilitySidebarView extends UI.ThrottledWidget.ThrottledWidget {
    private readonly sourceOrderViewerExperimentEnabled;
    private nodeInternal;
    private axNodeInternal;
    private skipNextPullNode;
    private readonly sidebarPaneStack;
    private readonly breadcrumbsSubPane;
    private readonly ariaSubPane;
    private readonly axNodeSubPane;
    private readonly sourceOrderSubPane;
    private constructor();
    static instance(): AccessibilitySidebarView;
    node(): SDK.DOMModel.DOMNode | null;
    axNode(): SDK.AccessibilityModel.AccessibilityNode | null;
    setNode(node: SDK.DOMModel.DOMNode | null, fromAXTree?: boolean): void;
    accessibilityNodeCallback(axNode: SDK.AccessibilityModel.AccessibilityNode | null): void;
    doUpdate(): Promise<void>;
    wasShown(): void;
    willHide(): void;
    private pullNode;
    private onAttrChange;
    private onNodeChange;
}
