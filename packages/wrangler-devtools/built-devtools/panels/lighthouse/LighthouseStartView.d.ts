import * as UI from '../../ui/legacy/legacy.js';
import type { LighthouseController, Preset } from './LighthouseController.js';
export declare class StartView extends UI.Widget.Widget {
    protected controller: LighthouseController;
    protected readonly settingsToolbarInternal: UI.Toolbar.Toolbar;
    protected startButton: HTMLButtonElement;
    protected helpText?: Element;
    protected warningText?: Element;
    protected checkboxes: Array<{
        preset: Preset;
        checkbox: UI.Toolbar.ToolbarCheckbox;
    }>;
    private shouldConfirm?;
    constructor(controller: LighthouseController);
    settingsToolbar(): UI.Toolbar.Toolbar;
    protected populateRuntimeSettingAsRadio(settingName: string, label: string, parentElement: Element): void;
    protected populateRuntimeSettingAsToolbarCheckbox(settingName: string, toolbar: UI.Toolbar.Toolbar): void;
    protected populateRuntimeSettingAsToolbarDropdown(settingName: string, toolbar: UI.Toolbar.Toolbar): void;
    protected populateFormControls(fragment: UI.Fragment.Fragment, mode?: string): void;
    protected render(): void;
    refresh(): void;
    onResize(): void;
    focusStartButton(): void;
    setStartButtonEnabled(isEnabled: boolean): void;
    setUnauditableExplanation(text: string | null): void;
    setWarningText(text: string | null): void;
    wasShown(): void;
}
