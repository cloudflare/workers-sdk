import type { AdornerSettingsMap } from './AdornerManager.js';
export declare class AdornerSettingUpdatedEvent extends Event {
    static readonly eventName = "adornersettingupdated";
    data: {
        adornerName: string;
        isEnabledNow: boolean;
        newSettings: AdornerSettingsMap;
    };
    constructor(adornerName: string, isEnabledNow: boolean, newSettings: AdornerSettingsMap);
}
export interface AdornerSettingsPaneData {
    settings: Readonly<AdornerSettingsMap>;
}
export declare class AdornerSettingsPane extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: AdornerSettingsPaneData);
    show(): void;
    hide(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-adorner-settings-pane': AdornerSettingsPane;
    }
}
