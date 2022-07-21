import * as Host from '../../core/host/host.js';
import * as Root from '../../core/root/root.js';
import type { SoftContextMenuDescriptor } from './SoftContextMenu.js';
export declare class Item {
    private readonly typeInternal;
    protected readonly label: string | undefined;
    protected disabled: boolean | undefined;
    private readonly checked;
    protected contextMenu: ContextMenu | null;
    protected idInternal: number | undefined;
    customElement?: Element;
    private shortcut?;
    constructor(contextMenu: ContextMenu | null, type: string, label?: string, disabled?: boolean, checked?: boolean);
    id(): number;
    type(): string;
    isEnabled(): boolean;
    setEnabled(enabled: boolean): void;
    buildDescriptor(): SoftContextMenuDescriptor | Host.InspectorFrontendHostAPI.ContextMenuDescriptor;
    setShortcut(shortcut: string): void;
}
export declare class Section {
    private readonly contextMenu;
    readonly items: Item[];
    constructor(contextMenu: ContextMenu | null);
    appendItem(label: string, handler: () => void, disabled?: boolean, additionalElement?: Element): Item;
    appendCustomItem(element: Element): Item;
    appendSeparator(): Item;
    appendAction(actionId: string, label?: string, optional?: boolean): void;
    appendSubMenuItem(label: string, disabled?: boolean): SubMenu;
    appendCheckboxItem(label: string, handler: () => void, checked?: boolean, disabled?: boolean, additionalElement?: Element): Item;
}
export declare class SubMenu extends Item {
    private readonly sections;
    private readonly sectionList;
    constructor(contextMenu: ContextMenu | null, label?: string, disabled?: boolean);
    init(): void;
    section(name?: string): Section;
    headerSection(): Section;
    newSection(): Section;
    revealSection(): Section;
    clipboardSection(): Section;
    editSection(): Section;
    debugSection(): Section;
    viewSection(): Section;
    defaultSection(): Section;
    saveSection(): Section;
    footerSection(): Section;
    buildDescriptor(): SoftContextMenuDescriptor | Host.InspectorFrontendHostAPI.ContextMenuDescriptor;
    appendItemsAtLocation(location: string): void;
    private static uniqueSectionName;
}
export interface ContextMenuOptions {
    useSoftMenu?: boolean;
    onSoftMenuClosed?: () => void;
    x?: number;
    y?: number;
}
export declare class ContextMenu extends SubMenu {
    protected contextMenu: this;
    private readonly defaultSectionInternal;
    private pendingPromises;
    private pendingTargets;
    private readonly event;
    private readonly useSoftMenu;
    private x;
    private y;
    private onSoftMenuClosed?;
    private readonly handlers;
    idInternal: number;
    private softMenu?;
    private contextMenuLabel?;
    constructor(event: Event, options?: ContextMenuOptions);
    static initialize(): void;
    static installHandler(doc: Document): void;
    nextId(): number;
    show(): Promise<void>;
    discard(): void;
    private innerShow;
    setContextMenuLabel(label: string): void;
    setX(x: number): void;
    setY(y: number): void;
    setHandler(id: number, handler: () => void): void;
    private buildMenuDescriptors;
    private onItemSelected;
    private itemSelected;
    private menuCleared;
    containsTarget(target: Object): boolean;
    appendApplicableItems(target: Object): void;
    markAsMenuItemCheckBox(): void;
    private static pendingMenu;
    private static useSoftMenu;
    static readonly groupWeights: string[];
}
export interface Provider {
    appendApplicableItems(event: Event, contextMenu: ContextMenu, target: Object): void;
}
export declare function registerProvider(registration: ProviderRegistration): void;
export declare function registerItem(registration: ContextMenuItemRegistration): void;
export declare function maybeRemoveItem(registration: ContextMenuItemRegistration): boolean;
export declare enum ItemLocation {
    DEVICE_MODE_MENU_SAVE = "deviceModeMenu/save",
    MAIN_MENU = "mainMenu",
    MAIN_MENU_DEFAULT = "mainMenu/default",
    MAIN_MENU_FOOTER = "mainMenu/footer",
    MAIN_MENU_HELP_DEFAULT = "mainMenuHelp/default",
    NAVIGATOR_MENU_DEFAULT = "navigatorMenu/default",
    TIMELINE_MENU_OPEN = "timelineMenu/open"
}
export interface ProviderRegistration {
    contextTypes: () => unknown[];
    loadProvider: () => Promise<Provider>;
    experiment?: Root.Runtime.ExperimentName;
}
export interface ContextMenuItemRegistration {
    location: ItemLocation;
    actionId: string;
    order?: number;
    experiment?: Root.Runtime.ExperimentName;
}
