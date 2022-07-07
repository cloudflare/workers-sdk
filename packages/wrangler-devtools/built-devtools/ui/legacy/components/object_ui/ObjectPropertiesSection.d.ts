import type * as Components from '../utils/utils.js';
import * as SDK from '../../../../core/sdk/sdk.js';
import * as UI from '../../legacy.js';
export declare const getObjectPropertiesSectionFrom: (element: Element) => ObjectPropertiesSection | undefined;
export declare class ObjectPropertiesSection extends UI.TreeOutline.TreeOutlineInShadow {
    private readonly object;
    editable: boolean;
    private readonly objectTreeElementInternal;
    titleElement: Element;
    skipProtoInternal?: boolean;
    constructor(object: SDK.RemoteObject.RemoteObject, title?: string | Element | null, linkifier?: Components.Linkifier.Linkifier, showOverflow?: boolean);
    static defaultObjectPresentation(object: SDK.RemoteObject.RemoteObject, linkifier?: Components.Linkifier.Linkifier, skipProto?: boolean, readOnly?: boolean): Element;
    static defaultObjectPropertiesSection(object: SDK.RemoteObject.RemoteObject, linkifier?: Components.Linkifier.Linkifier, skipProto?: boolean, readOnly?: boolean): ObjectPropertiesSection;
    static assignWebIDLMetadata(value: SDK.RemoteObject.RemoteObject | null, properties: SDK.RemoteObject.RemoteObjectProperty[]): void;
    static getPropertyValuesByNames(properties: SDK.RemoteObject.RemoteObjectProperty[]): Map<string, SDK.RemoteObject.RemoteObject | undefined>;
    static compareProperties(propertyA: SDK.RemoteObject.RemoteObjectProperty, propertyB: SDK.RemoteObject.RemoteObjectProperty): number;
    static createNameElement(name: string | null, isPrivate?: boolean): Element;
    static valueElementForFunctionDescription(description?: string, includePreview?: boolean, defaultName?: string): Element;
    static createPropertyValueWithCustomSupport(value: SDK.RemoteObject.RemoteObject, wasThrown: boolean, showPreview: boolean, parentElement?: Element, linkifier?: Components.Linkifier.Linkifier): ObjectPropertyValue;
    static appendMemoryIcon(element: Element, obj: SDK.RemoteObject.RemoteObject): void;
    static createPropertyValue(value: SDK.RemoteObject.RemoteObject, wasThrown: boolean, showPreview: boolean, parentElement?: Element, linkifier?: Components.Linkifier.Linkifier): ObjectPropertyValue;
    static formatObjectAsFunction(func: SDK.RemoteObject.RemoteObject, element: Element, linkify: boolean, includePreview?: boolean): Promise<void>;
    static isDisplayableProperty(property: SDK.RemoteObject.RemoteObjectProperty, parentProperty?: SDK.RemoteObject.RemoteObjectProperty): boolean;
    skipProto(): void;
    expand(): void;
    setEditable(value: boolean): void;
    objectTreeElement(): UI.TreeOutline.TreeElement;
    enableContextMenu(): void;
    private contextMenuEventFired;
    titleLessMode(): void;
}
export declare function setMaxRenderableStringLength(value: number): void;
export declare function getMaxRenderableStringLength(): number;
export declare class ObjectPropertiesSectionsTreeOutline extends UI.TreeOutline.TreeOutlineInShadow {
    private readonly editable;
    constructor(options?: TreeOutlineOptions | null);
}
export declare const enum ObjectPropertiesMode {
    All = 0,
    OwnAndInternalAndInherited = 1
}
export declare class RootElement extends UI.TreeOutline.TreeElement {
    private readonly object;
    private readonly linkifier;
    private readonly emptyPlaceholder;
    private readonly propertiesMode;
    private readonly extraProperties;
    private readonly targetObject;
    toggleOnClick: boolean;
    constructor(object: SDK.RemoteObject.RemoteObject, linkifier?: Components.Linkifier.Linkifier, emptyPlaceholder?: string | null, propertiesMode?: ObjectPropertiesMode, extraProperties?: SDK.RemoteObject.RemoteObjectProperty[], targetObject?: SDK.RemoteObject.RemoteObject);
    onexpand(): void;
    oncollapse(): void;
    ondblclick(_e: Event): boolean;
    private onContextMenu;
    onpopulate(): Promise<void>;
}
export declare const InitialVisibleChildrenLimit = 200;
export declare class ObjectPropertyTreeElement extends UI.TreeOutline.TreeElement {
    property: SDK.RemoteObject.RemoteObjectProperty;
    toggleOnClick: boolean;
    private highlightChanges;
    private linkifier;
    private readonly maxNumPropertiesToShow;
    nameElement: HTMLElement;
    valueElement: HTMLElement;
    private rowContainer;
    readOnly: boolean;
    private prompt;
    private editableDiv;
    propertyValue?: ObjectPropertyValue;
    expandedValueElement?: Element | null;
    constructor(property: SDK.RemoteObject.RemoteObjectProperty, linkifier?: Components.Linkifier.Linkifier);
    static populate(treeElement: UI.TreeOutline.TreeElement, value: SDK.RemoteObject.RemoteObject, skipProto: boolean, skipGettersAndSetters: boolean, linkifier?: Components.Linkifier.Linkifier, emptyPlaceholder?: string | null, propertiesMode?: ObjectPropertiesMode, extraProperties?: SDK.RemoteObject.RemoteObjectProperty[], targetValue?: SDK.RemoteObject.RemoteObject): Promise<void>;
    static populateWithProperties(treeNode: UI.TreeOutline.TreeElement, properties: SDK.RemoteObject.RemoteObjectProperty[], internalProperties: SDK.RemoteObject.RemoteObjectProperty[] | null, skipProto: boolean, skipGettersAndSetters: boolean, value: SDK.RemoteObject.RemoteObject | null, linkifier?: Components.Linkifier.Linkifier, emptyPlaceholder?: string | null): void;
    private static appendEmptyPlaceholderIfNeeded;
    static createRemoteObjectAccessorPropertySpan(object: SDK.RemoteObject.RemoteObject | null, propertyPath: string[], callback: (arg0: SDK.RemoteObject.CallFunctionResult) => void): HTMLElement;
    setSearchRegex(regex: RegExp, additionalCssClassName?: string): boolean;
    private applySearch;
    private showAllPropertiesElementSelected;
    private createShowAllPropertiesButton;
    revertHighlightChanges(): void;
    onpopulate(): Promise<void>;
    ondblclick(event: Event): boolean;
    onenter(): boolean;
    onattach(): void;
    onexpand(): void;
    oncollapse(): void;
    private showExpandedValueElement;
    private createExpandedValueElement;
    update(): void;
    private updatePropertyPath;
    private contextMenuFired;
    private startEditing;
    private editingEnded;
    private editingCancelled;
    private editingCommitted;
    private promptKeyDown;
    private applyExpression;
    private onInvokeGetterClick;
    private updateExpandable;
    path(): string;
}
export declare class ArrayGroupingTreeElement extends UI.TreeOutline.TreeElement {
    toggleOnClick: boolean;
    private readonly fromIndex;
    private readonly toIndex;
    private readonly object;
    private readonly readOnly;
    private readonly propertyCount;
    private readonly linkifier;
    constructor(object: SDK.RemoteObject.RemoteObject, fromIndex: number, toIndex: number, propertyCount: number, linkifier?: Components.Linkifier.Linkifier);
    static populateArray(treeNode: UI.TreeOutline.TreeElement, object: SDK.RemoteObject.RemoteObject, fromIndex: number, toIndex: number, linkifier?: Components.Linkifier.Linkifier): Promise<void>;
    private static populateRanges;
    private static populateAsFragment;
    private static populateNonIndexProperties;
    onpopulate(): Promise<void>;
    onattach(): void;
    private static bucketThreshold;
    private static sparseIterationThreshold;
}
export declare class ObjectPropertyPrompt extends UI.TextPrompt.TextPrompt {
    constructor();
}
export declare class ObjectPropertiesSectionsTreeExpandController {
    private readonly expandedProperties;
    constructor(treeOutline: UI.TreeOutline.TreeOutline);
    watchSection(id: string, section: RootElement): void;
    stopWatchSectionsWithId(id: string): void;
    private elementAttached;
    private elementExpanded;
    private elementCollapsed;
    private propertyPath;
}
export declare class Renderer implements UI.UIUtils.Renderer {
    static instance(opts?: {
        forceNew: boolean;
    }): Renderer;
    render(object: Object, options?: UI.UIUtils.Options): Promise<{
        node: Node;
        tree: UI.TreeOutline.TreeOutline | null;
    } | null>;
}
export declare class ObjectPropertyValue implements UI.ContextMenu.Provider {
    element: Element;
    constructor(element: Element);
    appendApplicableItems(_event: Event, _contextMenu: UI.ContextMenu.ContextMenu, _object: Object): void;
}
export declare class ExpandableTextPropertyValue extends ObjectPropertyValue {
    private readonly text;
    private readonly maxLength;
    private expandElement;
    private readonly maxDisplayableTextLength;
    private readonly expandElementText;
    private readonly copyButtonText;
    constructor(element: Element, text: string, maxLength: number);
    appendApplicableItems(_event: Event, contextMenu: UI.ContextMenu.ContextMenu, _object: Object): void;
    private expandText;
    private copyText;
}
export interface TreeOutlineOptions {
    readOnly?: boolean;
}
