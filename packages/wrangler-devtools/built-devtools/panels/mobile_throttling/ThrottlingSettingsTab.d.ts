import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class ThrottlingSettingsTab extends UI.Widget.VBox implements UI.ListWidget.Delegate<SDK.NetworkManager.Conditions> {
    private readonly list;
    private readonly customSetting;
    private editor?;
    constructor();
    static instance(opts?: {
        forceNew: null;
    }): ThrottlingSettingsTab;
    wasShown(): void;
    private conditionsUpdated;
    private addButtonClicked;
    renderItem(conditions: SDK.NetworkManager.Conditions, _editable: boolean): Element;
    removeItemRequested(_item: SDK.NetworkManager.Conditions, index: number): void;
    retrieveOptionsTitle(conditions: SDK.NetworkManager.Conditions): string;
    commitEdit(conditions: SDK.NetworkManager.Conditions, editor: UI.ListWidget.Editor<SDK.NetworkManager.Conditions>, isNew: boolean): void;
    beginEdit(conditions: SDK.NetworkManager.Conditions): UI.ListWidget.Editor<SDK.NetworkManager.Conditions>;
    private createEditor;
}
