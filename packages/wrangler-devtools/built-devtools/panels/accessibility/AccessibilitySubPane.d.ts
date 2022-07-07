import type * as Platform from '../../core/platform/platform.js';
import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class AccessibilitySubPane extends UI.View.SimpleView {
    axNode: SDK.AccessibilityModel.AccessibilityNode | null;
    protected nodeInternal?: SDK.DOMModel.DOMNode | null;
    constructor(name: Platform.UIString.LocalizedString);
    setAXNode(_axNode: SDK.AccessibilityModel.AccessibilityNode | null): void;
    node(): SDK.DOMModel.DOMNode | null;
    setNode(node: SDK.DOMModel.DOMNode | null): void;
    createInfo(textContent: string, className?: string): Element;
    createTreeOutline(): UI.TreeOutline.TreeOutline;
    wasShown(): void;
}
