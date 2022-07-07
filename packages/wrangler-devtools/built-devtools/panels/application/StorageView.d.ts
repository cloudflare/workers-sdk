import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as UI from '../../ui/legacy/legacy.js';
/**
 * @implements {SDK.TargetManager.Observer}
 */
export declare class StorageView extends UI.ThrottledWidget.ThrottledWidget {
    private pieColors;
    private reportView;
    private target;
    private securityOrigin;
    private storageKey;
    private settings;
    private includeThirdPartyCookiesSetting;
    private quotaRow;
    private quotaUsage;
    private pieChart;
    private previousOverrideFieldValue;
    private quotaOverrideCheckbox;
    private quotaOverrideControlRow;
    private quotaOverrideEditor;
    private quotaOverrideErrorMessage;
    private clearButton;
    constructor();
    private appendItem;
    targetAdded(target: SDK.Target.Target): void;
    targetRemoved(target: SDK.Target.Target): void;
    private originChanged;
    private storageKeyChanged;
    private updateOrigin;
    private updateStorageKey;
    private applyQuotaOverrideFromInputField;
    private clearQuotaForOrigin;
    private onClickCheckbox;
    private clear;
    static clear(target: SDK.Target.Target, securityOrigin: string, selectedStorageTypes: string[], includeThirdPartyCookies: boolean): void;
    static clearByStorageKey(target: SDK.Target.Target, storageKey: string, selectedStorageTypes: string[]): void;
    doUpdate(): Promise<void>;
    private populatePieChart;
    private getStorageTypeName;
    wasShown(): void;
}
export declare const AllStorageTypes: Protocol.Storage.StorageType[];
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
    private clear;
    private handleClear;
}
