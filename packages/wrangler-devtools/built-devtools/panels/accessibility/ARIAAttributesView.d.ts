import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { AccessibilitySubPane } from './AccessibilitySubPane.js';
export declare class ARIAAttributesPane extends AccessibilitySubPane {
    private readonly noPropertiesInfo;
    private readonly treeOutline;
    constructor();
    setNode(node: SDK.DOMModel.DOMNode | null): void;
    private isARIAAttribute;
}
export declare class ARIAAttributesTreeElement extends UI.TreeOutline.TreeElement {
    private readonly parentPane;
    private readonly attribute;
    private nameElement?;
    private valueElement?;
    private prompt?;
    constructor(parentPane: ARIAAttributesPane, attribute: SDK.DOMModel.Attribute, _target: SDK.Target.Target);
    static createARIAValueElement(value: string): Element;
    onattach(): void;
    private populateListItem;
    appendNameElement(name: string): void;
    appendAttributeValueElement(value: string): void;
    private mouseClick;
    private startEditing;
    private removePrompt;
    private editingCommitted;
    private editingCancelled;
    private editingValueKeyDown;
}
export declare class ARIAAttributePrompt extends UI.TextPrompt.TextPrompt {
    private readonly ariaCompletions;
    private readonly treeElement;
    constructor(ariaCompletions: string[], treeElement: ARIAAttributesTreeElement);
    private buildPropertyCompletions;
}
