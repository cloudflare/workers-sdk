import type { Setting } from './LayoutPaneUtils.js';
import type { LayoutElement } from './LayoutPaneUtils.js';
export { LayoutElement };
export declare class SettingChangedEvent extends Event {
    static readonly eventName = "settingchanged";
    data: {
        setting: string;
        value: string | boolean;
    };
    constructor(setting: string, value: string | boolean);
}
export interface LayoutPaneData {
    settings: Setting[];
    gridElements: LayoutElement[];
    flexContainerElements?: LayoutElement[];
}
export declare class LayoutPane extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    constructor();
    set data(data: LayoutPaneData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-layout-pane': LayoutPane;
    }
}
