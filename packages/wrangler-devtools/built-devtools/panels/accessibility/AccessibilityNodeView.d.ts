import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as UI from '../../ui/legacy/legacy.js';
import { AccessibilitySubPane } from './AccessibilitySubPane.js';
export declare class AXNodeSubPane extends AccessibilitySubPane {
    axNode: SDK.AccessibilityModel.AccessibilityNode | null;
    private readonly noNodeInfo;
    private readonly ignoredInfo;
    private readonly treeOutline;
    private readonly ignoredReasonsTree;
    constructor();
    setAXNode(axNode: SDK.AccessibilityModel.AccessibilityNode | null): void;
    setNode(node: SDK.DOMModel.DOMNode | null): void;
    wasShown(): void;
}
export declare class AXNodePropertyTreeElement extends UI.TreeOutline.TreeElement {
    protected axNode: SDK.AccessibilityModel.AccessibilityNode;
    constructor(axNode: SDK.AccessibilityModel.AccessibilityNode);
    static createSimpleValueElement(type: Protocol.Accessibility.AXValueType | null, value: string): Element;
    static createExclamationMark(tooltip: string): Element;
    appendNameElement(name: string): void;
    appendValueElement(value: Protocol.Accessibility.AXValue): void;
    appendRelatedNode(relatedNode: Protocol.Accessibility.AXRelatedNode, _index: number): void;
    appendRelatedNodeInline(relatedNode: Protocol.Accessibility.AXRelatedNode): void;
    appendRelatedNodeListValueElement(value: Protocol.Accessibility.AXValue): void;
}
export declare const TypeStyles: {
    [x: string]: string;
};
export declare const StringProperties: Set<Protocol.Accessibility.AXValueType>;
export declare class AXNodePropertyTreePropertyElement extends AXNodePropertyTreeElement {
    private readonly property;
    toggleOnClick: boolean;
    constructor(property: SDK.AccessibilityModel.CoreOrProtocolAxProperty, axNode: SDK.AccessibilityModel.AccessibilityNode);
    onattach(): void;
    private update;
}
export declare class AXValueSourceTreeElement extends AXNodePropertyTreeElement {
    private readonly source;
    constructor(source: Protocol.Accessibility.AXValueSource, axNode: SDK.AccessibilityModel.AccessibilityNode);
    onattach(): void;
    appendRelatedNodeWithIdref(relatedNode: Protocol.Accessibility.AXRelatedNode, idref: string): void;
    appendIDRefValueElement(value: Protocol.Accessibility.AXValue): void;
    appendRelatedNodeListValueElement(value: Protocol.Accessibility.AXValue): void;
    appendSourceNameElement(source: Protocol.Accessibility.AXValueSource): void;
    private update;
}
export declare class AXRelatedNodeSourceTreeElement extends UI.TreeOutline.TreeElement {
    private value;
    private readonly axRelatedNodeElement;
    constructor(node: {
        deferredNode?: SDK.DOMModel.DeferredDOMNode;
        idref?: string;
    }, value?: Protocol.Accessibility.AXRelatedNode);
    onattach(): void;
    onenter(): boolean;
}
export declare class AXRelatedNodeElement {
    private readonly deferredNode;
    private readonly idref;
    private readonly value;
    constructor(node: {
        deferredNode?: SDK.DOMModel.DeferredDOMNode;
        idref?: string;
    }, value?: Protocol.Accessibility.AXRelatedNode);
    render(): Element;
    /**
     * Attempts to cause the node referred to by the related node to be selected in the tree.
     */
    revealNode(): void;
}
export declare class AXNodeIgnoredReasonTreeElement extends AXNodePropertyTreeElement {
    private property;
    toggleOnClick: boolean;
    private reasonElement?;
    constructor(property: Protocol.Accessibility.AXProperty, axNode: SDK.AccessibilityModel.AccessibilityNode);
    static createReasonElement(reason: string | null, axNode: SDK.AccessibilityModel.AccessibilityNode | null): Element | null;
    onattach(): void;
}
