import * as UI from '../../ui/legacy/legacy.js';
import { NetworkThrottlingSelector } from './NetworkThrottlingSelector.js';
export declare class ThrottlingManager {
    #private;
    private readonly cpuThrottlingControls;
    private readonly cpuThrottlingRates;
    private readonly customNetworkConditionsSetting;
    private readonly currentNetworkThrottlingConditionsSetting;
    private lastNetworkThrottlingConditions;
    private readonly cpuThrottlingManager;
    get hardwareConcurrencyOverrideEnabled(): boolean;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ThrottlingManager;
    decorateSelectWithNetworkThrottling(selectElement: HTMLSelectElement): NetworkThrottlingSelector;
    createOfflineToolbarCheckbox(): UI.Toolbar.ToolbarCheckbox;
    createMobileThrottlingButton(): UI.Toolbar.ToolbarMenuButton;
    private updatePanelIcon;
    setCPUThrottlingRate(rate: number): void;
    createCPUThrottlingSelector(): UI.Toolbar.ToolbarComboBox;
    createHardwareConcurrencySelector(): {
        input: UI.Toolbar.ToolbarItem;
        reset: UI.Toolbar.ToolbarButton;
        warning: UI.Toolbar.ToolbarItem;
        toggle: UI.Toolbar.ToolbarItem;
    };
    setHardwareConcurrency(concurrency: number): void;
    private isDirty;
}
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
export declare function throttlingManager(): ThrottlingManager;
