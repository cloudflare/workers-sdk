import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as InlineEditor from '../../ui/legacy/components/inline_editor/inline_editor.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { ComputedStyleChangedEvent } from './ComputedStyleModel.js';
import { ElementsSidebarPane } from './ElementsSidebarPane.js';
import type { StylePropertyTreeElement } from './StylePropertyTreeElement.js';
import { StylePropertiesSection } from './StylePropertiesSection.js';
declare const StylesSidebarPane_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends keyof EventTypes>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends keyof EventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof EventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof EventTypes>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof ElementsSidebarPane;
export declare class StylesSidebarPane extends StylesSidebarPane_base {
    #private;
    private currentToolbarPane;
    private animatedToolbarPane;
    private pendingWidget;
    private pendingWidgetToggle;
    private toolbar;
    private toolbarPaneElement;
    private noMatchesElement;
    private sectionsContainer;
    sectionByElement: WeakMap<Node, StylePropertiesSection>;
    private readonly swatchPopoverHelperInternal;
    readonly linkifier: Components.Linkifier.Linkifier;
    private readonly decorator;
    private lastRevealedProperty;
    private userOperation;
    isEditingStyle: boolean;
    private filterRegexInternal;
    private isActivePropertyHighlighted;
    private initialUpdateCompleted;
    hasMatchedStyles: boolean;
    private sectionBlocks;
    private idleCallbackManager;
    private needsForceUpdate;
    private readonly resizeThrottler;
    private readonly imagePreviewPopover;
    activeCSSAngle: InlineEditor.CSSAngle.CSSAngle | null;
    static instance(): StylesSidebarPane;
    private constructor();
    swatchPopoverHelper(): InlineEditor.SwatchPopoverHelper.SwatchPopoverHelper;
    setUserOperation(userOperation: boolean): void;
    static createExclamationMark(property: SDK.CSSProperty.CSSProperty, title: string | null): Element;
    static ignoreErrorsForProperty(property: SDK.CSSProperty.CSSProperty): boolean;
    static createPropertyFilterElement(placeholder: string, container: Element, filterCallback: (arg0: RegExp | null) => void): Element;
    static formatLeadingProperties(section: StylePropertiesSection): {
        allDeclarationText: string;
        ruleText: string;
    };
    revealProperty(cssProperty: SDK.CSSProperty.CSSProperty): void;
    jumpToProperty(propertyName: string): void;
    forceUpdate(): void;
    private sectionsContainerKeyDown;
    private sectionsContainerFocusChanged;
    resetFocus(): void;
    onAddButtonLongClick(event: Event): void;
    private onFilterChanged;
    refreshUpdate(editedSection: StylePropertiesSection, editedTreeElement?: StylePropertyTreeElement): void;
    doUpdate(): Promise<void>;
    private fetchComputedStylesFor;
    onResize(): void;
    private innerResize;
    private resetCache;
    private fetchMatchedCascade;
    setEditingStyle(editing: boolean, _treeElement?: StylePropertyTreeElement): void;
    setActiveProperty(treeElement: StylePropertyTreeElement | null): void;
    onCSSModelChanged(event: Common.EventTarget.EventTargetEvent<ComputedStyleChangedEvent>): void;
    focusedSectionIndex(): number;
    continueEditingElement(sectionIndex: number, propertyIndex: number): void;
    private innerRebuildUpdate;
    private nodeStylesUpdatedForTest;
    private rebuildSectionsForMatchedStyleRules;
    createNewRuleInViaInspectorStyleSheet(): Promise<void>;
    private createNewRuleInStyleSheet;
    addBlankSection(insertAfterSection: StylePropertiesSection, styleSheetId: Protocol.CSS.StyleSheetId, ruleLocation: TextUtils.TextRange.TextRange): void;
    removeSection(section: StylePropertiesSection): void;
    filterRegex(): RegExp | null;
    private updateFilter;
    willHide(): void;
    hideAllPopovers(): void;
    allSections(): StylePropertiesSection[];
    trackURLForChanges(url: Platform.DevToolsPath.UrlString): Promise<void>;
    isPropertyChanged(property: SDK.CSSProperty.CSSProperty): boolean;
    updateChangeStatus(): void;
    private refreshChangedLines;
    getFormattedChanges(): Promise<string>;
    private clipboardCopy;
    private createStylesSidebarToolbar;
    showToolbarPane(widget: UI.Widget.Widget | null, toggle: UI.Toolbar.ToolbarToggle | null): void;
    appendToolbarItem(item: UI.Toolbar.ToolbarItem): void;
    private startToolbarPaneAnimation;
    private createRenderingShortcuts;
    private createCopyAllChangesButton;
}
export declare const enum Events {
    InitialUpdateCompleted = "InitialUpdateCompleted",
    StylesUpdateCompleted = "StylesUpdateCompleted"
}
export interface StylesUpdateCompletedEvent {
    hasMatchedStyles: boolean;
}
export declare type EventTypes = {
    [Events.InitialUpdateCompleted]: void;
    [Events.StylesUpdateCompleted]: StylesUpdateCompletedEvent;
};
export declare class SectionBlock {
    private readonly titleElementInternal;
    sections: StylePropertiesSection[];
    constructor(titleElement: Element | null);
    static createPseudoTypeBlock(pseudoType: Protocol.DOM.PseudoType, pseudoArgument: string | null): SectionBlock;
    static createInheritedPseudoTypeBlock(pseudoType: Protocol.DOM.PseudoType, pseudoArgument: string | null, node: SDK.DOMModel.DOMNode): Promise<SectionBlock>;
    static createKeyframesBlock(keyframesName: string): SectionBlock;
    static createInheritedNodeBlock(node: SDK.DOMModel.DOMNode): Promise<SectionBlock>;
    static createLayerBlock(rule: SDK.CSSRule.CSSStyleRule): SectionBlock;
    updateFilter(): boolean;
    titleElement(): Element | null;
}
export declare class IdleCallbackManager {
    private discarded;
    private readonly promises;
    constructor();
    discard(): void;
    schedule(fn: () => void, timeout?: number): void;
    awaitDone(): Promise<void[]>;
}
export declare function quoteFamilyName(familyName: string): string;
export declare class CSSPropertyPrompt extends UI.TextPrompt.TextPrompt {
    private readonly isColorAware;
    private readonly cssCompletions;
    private selectedNodeComputedStyles;
    private parentNodeComputedStyles;
    private treeElement;
    private isEditingName;
    private readonly cssVariables;
    constructor(treeElement: StylePropertyTreeElement, isEditingName: boolean);
    onKeyDown(event: Event): void;
    onMouseWheel(event: Event): void;
    tabKeyPressed(): boolean;
    private handleNameOrValueUpDown;
    private isValueSuggestion;
    private buildPropertyCompletions;
}
export declare function unescapeCssString(input: string): string;
export declare function escapeUrlAsCssComment(urlText: string): string;
export declare class StylesSidebarPropertyRenderer {
    private rule;
    private node;
    private propertyName;
    private propertyValue;
    private colorHandler;
    private bezierHandler;
    private fontHandler;
    private shadowHandler;
    private gridHandler;
    private varHandler;
    private angleHandler;
    private lengthHandler;
    constructor(rule: SDK.CSSRule.CSSRule | null, node: SDK.DOMModel.DOMNode | null, name: string, value: string);
    setColorHandler(handler: (arg0: string) => Node): void;
    setBezierHandler(handler: (arg0: string) => Node): void;
    setFontHandler(handler: (arg0: string) => Node): void;
    setShadowHandler(handler: (arg0: string, arg1: string) => Node): void;
    setGridHandler(handler: (arg0: string, arg1: string) => Node): void;
    setVarHandler(handler: (arg0: string) => Node): void;
    setAngleHandler(handler: (arg0: string) => Node): void;
    setLengthHandler(handler: (arg0: string) => Node): void;
    renderName(): Element;
    renderValue(): Element;
    private processURL;
}
export declare class ButtonProvider implements UI.Toolbar.Provider {
    private readonly button;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ButtonProvider;
    private clicked;
    private longClicked;
    item(): UI.Toolbar.ToolbarItem;
}
export {};
