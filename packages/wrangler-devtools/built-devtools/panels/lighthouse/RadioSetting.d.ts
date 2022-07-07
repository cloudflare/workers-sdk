import type * as Common from '../../core/common/common.js';
interface RadioOption {
    value: string;
    label: () => Common.UIString.LocalizedString;
    tooltip?: () => Common.UIString.LocalizedString;
}
export declare class RadioSetting {
    private readonly setting;
    private options;
    element: HTMLDivElement;
    private radioElements;
    private ignoreChangeEvents;
    private selectedIndex;
    constructor(options: RadioOption[], setting: Common.Settings.Setting<string>, description: string);
    private updateUI;
    private settingChanged;
    private valueChanged;
}
export {};
