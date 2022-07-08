import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class LayoutSidebarPane extends UI.ThrottledWidget.ThrottledWidget {
    private layoutPane;
    private readonly settings;
    private readonly uaShadowDOMSetting;
    private readonly boundOnSettingChanged;
    private domModels;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): LayoutSidebarPane;
    modelAdded(domModel: SDK.DOMModel.DOMModel): void;
    modelRemoved(domModel: SDK.DOMModel.DOMModel): void;
    private fetchNodesByStyle;
    private fetchGridNodes;
    private fetchFlexContainerNodes;
    private mapSettings;
    doUpdate(): Promise<void>;
    onSettingChanged(event: any): void;
    wasShown(): void;
    willHide(): void;
}
