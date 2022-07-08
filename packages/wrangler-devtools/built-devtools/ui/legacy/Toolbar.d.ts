import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import type { Action } from './ActionRegistration.js';
import { ContextMenu } from './ContextMenu.js';
import type { Suggestion } from './SuggestBox.js';
export declare class Toolbar {
    private items;
    element: HTMLElement;
    enabled: boolean;
    private readonly shadowRoot;
    private contentElement;
    private insertionPoint;
    private compactLayout;
    constructor(className: string, parentElement?: Element);
    hasCompactLayout(): boolean;
    registerCSSFiles(cssFiles: CSSStyleSheet[]): void;
    setCompactLayout(enable: boolean): void;
    static createLongPressActionButton(action: Action, toggledOptions: ToolbarButton[], untoggledOptions: ToolbarButton[]): ToolbarButton;
    static createActionButton(action: Action, options?: ToolbarButtonOptions | undefined): ToolbarButton;
    static createActionButtonForId(actionId: string, options?: ToolbarButtonOptions | undefined): ToolbarButton;
    gripElementForResize(): Element;
    makeWrappable(growVertically?: boolean): void;
    makeVertical(): void;
    makeBlueOnHover(): void;
    makeToggledGray(): void;
    renderAsLinks(): void;
    empty(): boolean;
    setEnabled(enabled: boolean): void;
    appendToolbarItem(item: ToolbarItem): void;
    appendSeparator(): void;
    appendSpacer(): void;
    appendText(text: string): void;
    removeToolbarItem(itemToRemove: ToolbarItem): void;
    removeToolbarItems(): void;
    setColor(color: string): void;
    setToggledColor(color: string): void;
    hideSeparatorDupes(): void;
    appendItemsAtLocation(location: string): Promise<void>;
}
export interface ToolbarButtonOptions {
    showLabel: boolean;
    userActionCode?: Host.UserMetrics.Action;
}
export declare class ToolbarItem<T = any> extends Common.ObjectWrapper.ObjectWrapper<T> {
    element: HTMLElement;
    private visibleInternal;
    enabled: boolean;
    toolbar: Toolbar | null;
    protected title?: string;
    constructor(element: Element);
    setTitle(title: string, actionId?: string | undefined): void;
    setEnabled(value: boolean): void;
    applyEnabledState(enabled: boolean): void;
    visible(): boolean;
    setVisible(x: boolean): void;
    setRightAligned(alignRight: boolean): void;
    setCompactLayout(_enable: boolean): void;
}
export declare const enum ToolbarItemWithCompactLayoutEvents {
    CompactLayoutUpdated = "CompactLayoutUpdated"
}
declare type ToolbarItemWithCompactLayoutEventTypes = {
    [ToolbarItemWithCompactLayoutEvents.CompactLayoutUpdated]: boolean;
};
export declare class ToolbarItemWithCompactLayout extends ToolbarItem<ToolbarItemWithCompactLayoutEventTypes> {
    constructor(element: Element);
    setCompactLayout(enable: boolean): void;
}
export declare class ToolbarText extends ToolbarItem<void> {
    constructor(text?: string);
    text(): string;
    setText(text: string): void;
}
export declare class ToolbarButton extends ToolbarItem<ToolbarButton.EventTypes> {
    private readonly glyphElement;
    private textElement;
    private text?;
    private glyph?;
    private icon?;
    /**
     * TODO(crbug.com/1126026): remove glyph parameter in favor of icon.
     */
    constructor(title: string, glyphOrIcon?: string | HTMLElement, text?: string);
    focus(): void;
    setText(text: string): void;
    setGlyphOrIcon(glyphOrIcon: string | HTMLElement): void;
    setGlyph(glyph: string): void;
    setBackgroundImage(iconURL: string): void;
    setSecondary(): void;
    setDarkText(): void;
    turnIntoSelect(shrinkable?: boolean | undefined): void;
    clicked(event: Event): void;
    protected mouseDown(event: MouseEvent): void;
}
export declare namespace ToolbarButton {
    enum Events {
        Click = "Click",
        MouseDown = "MouseDown"
    }
    type EventTypes = {
        [Events.Click]: Event;
        [Events.MouseDown]: MouseEvent;
    };
}
export declare class ToolbarInput extends ToolbarItem<ToolbarInput.EventTypes> {
    private prompt;
    private readonly proxyElement;
    constructor(placeholder: string, accessiblePlaceholder?: string, growFactor?: number, shrinkFactor?: number, tooltip?: string, completions?: ((arg0: string, arg1: string, arg2?: boolean | undefined) => Promise<Suggestion[]>), dynamicCompletions?: boolean);
    applyEnabledState(enabled: boolean): void;
    setValue(value: string, notify?: boolean): void;
    value(): string;
    private onKeydownCallback;
    private onChangeCallback;
    private updateEmptyStyles;
}
export declare namespace ToolbarInput {
    enum Event {
        TextChanged = "TextChanged",
        EnterPressed = "EnterPressed"
    }
    interface EventTypes {
        [Event.TextChanged]: string;
        [Event.EnterPressed]: string;
    }
}
export declare class ToolbarToggle extends ToolbarButton {
    private toggledInternal;
    private readonly untoggledGlyphOrIcon;
    private readonly toggledGlyphOrIcon;
    constructor(title: string, glyphOrIcon?: string | HTMLElement, toggledGlyphOrIcon?: string | HTMLElement);
    toggled(): boolean;
    setToggled(toggled: boolean): void;
    setDefaultWithRedColor(withRedColor: boolean): void;
    setToggleWithRedColor(toggleWithRedColor: boolean): void;
    setToggleWithDot(toggleWithDot: boolean): void;
}
export declare class ToolbarMenuButton extends ToolbarButton {
    private readonly contextMenuHandler;
    private readonly useSoftMenu;
    private triggerTimeout?;
    private lastTriggerTime?;
    constructor(contextMenuHandler: (arg0: ContextMenu) => void, useSoftMenu?: boolean);
    mouseDown(event: MouseEvent): void;
    private trigger;
    clicked(event: Event): void;
}
export declare class ToolbarSettingToggle extends ToolbarToggle {
    private readonly defaultTitle;
    private readonly setting;
    private willAnnounceState;
    constructor(setting: Common.Settings.Setting<boolean>, glyph: string, title: string);
    private settingChanged;
    clicked(event: Event): void;
}
export declare class ToolbarSeparator extends ToolbarItem<void> {
    constructor(spacer?: boolean);
}
export interface Provider {
    item(): ToolbarItem | null;
}
export interface ItemsProvider {
    toolbarItems(): ToolbarItem[];
}
export declare class ToolbarComboBox extends ToolbarItem<void> {
    protected selectElementInternal: HTMLSelectElement;
    constructor(changeHandler: ((arg0: Event) => void) | null, title: string, className?: string);
    selectElement(): HTMLSelectElement;
    size(): number;
    options(): HTMLOptionElement[];
    addOption(option: Element): void;
    createOption(label: string, value?: string): Element;
    applyEnabledState(enabled: boolean): void;
    removeOption(option: Element): void;
    removeOptions(): void;
    selectedOption(): HTMLOptionElement | null;
    select(option: Element): void;
    setSelectedIndex(index: number): void;
    selectedIndex(): number;
    setMaxWidth(width: number): void;
    setMinWidth(width: number): void;
}
export interface Option {
    value: string;
    label: string;
}
export declare class ToolbarSettingComboBox extends ToolbarComboBox {
    private optionsInternal;
    private readonly setting;
    private muteSettingListener?;
    constructor(options: Option[], setting: Common.Settings.Setting<string>, accessibleName: string);
    setOptions(options: Option[]): void;
    value(): string;
    private settingChanged;
    private valueChanged;
}
export declare class ToolbarCheckbox extends ToolbarItem<void> {
    inputElement: HTMLInputElement;
    constructor(text: string, tooltip?: string, listener?: ((arg0: MouseEvent) => void));
    checked(): boolean;
    setChecked(value: boolean): void;
    applyEnabledState(enabled: boolean): void;
    setIndeterminate(indeterminate: boolean): void;
}
export declare class ToolbarSettingCheckbox extends ToolbarCheckbox {
    constructor(setting: Common.Settings.Setting<boolean>, tooltip?: string, alternateTitle?: string);
}
export declare function registerToolbarItem(registration: ToolbarItemRegistration): void;
export interface ToolbarItemRegistration {
    order?: number;
    location: ToolbarItemLocation;
    separator?: boolean;
    showLabel?: boolean;
    actionId?: string;
    condition?: string;
    loadItem?: (() => Promise<Provider>);
}
export declare enum ToolbarItemLocation {
    FILES_NAVIGATION_TOOLBAR = "files-navigator-toolbar",
    MAIN_TOOLBAR_RIGHT = "main-toolbar-right",
    MAIN_TOOLBAR_LEFT = "main-toolbar-left",
    STYLES_SIDEBARPANE_TOOLBAR = "styles-sidebarpane-toolbar"
}
export {};
