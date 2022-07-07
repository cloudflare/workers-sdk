import * as UI from '../../ui/legacy/legacy.js';
export declare class KeybindsSettingsTab extends UI.Widget.VBox implements UI.ListControl.ListDelegate<KeybindsItem> {
    private readonly items;
    private list;
    private editingItem;
    private editingRow;
    constructor();
    static instance(opts?: {
        forceNew: null;
    }): KeybindsSettingsTab;
    createElementForItem(item: KeybindsItem): Element;
    commitChanges(item: UI.ActionRegistration.Action, editedShortcuts: Map<UI.KeyboardShortcut.KeyboardShortcut, UI.KeyboardShortcut.Descriptor[] | null>): void;
    /**
     * This method will never be called.
     */
    heightForItem(_item: KeybindsItem): number;
    isItemSelectable(_item: KeybindsItem): boolean;
    selectedItemChanged(from: KeybindsItem | null, to: KeybindsItem | null, fromElement: HTMLElement | null, toElement: HTMLElement | null): void;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    startEditing(action: UI.ActionRegistration.Action): void;
    stopEditing(action: UI.ActionRegistration.Action): void;
    private createListItems;
    onEscapeKeyPressed(event: Event): void;
    update(): void;
    willHide(): void;
    wasShown(): void;
}
export declare class ShortcutListItem {
    private isEditing;
    private settingsTab;
    private item;
    element: HTMLDivElement;
    private editedShortcuts;
    private readonly shortcutInputs;
    private readonly shortcuts;
    private elementToFocus;
    private confirmButton;
    private addShortcutLinkContainer;
    private errorMessageElement;
    private secondKeyTimeout;
    constructor(item: UI.ActionRegistration.Action, settingsTab: KeybindsSettingsTab, isEditing?: boolean);
    focus(): void;
    private update;
    private createEmptyInfo;
    private setupEditor;
    private addShortcut;
    private createShortcutRow;
    private createEditButton;
    private createIconButton;
    private onShortcutInputKeyDown;
    private descriptorForEvent;
    private shortcutInputTextForDescriptors;
    private resetShortcutsToDefaults;
    onEscapeKeyPressed(event: Event): void;
    private validateInputs;
}
export declare type KeybindsItem = string | UI.ActionRegistration.Action;
