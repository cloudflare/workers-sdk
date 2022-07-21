import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { PageVisibleSecurityState } from './SecurityModel.js';
import { SecurityModel } from './SecurityModel.js';
export declare class SecurityPanel extends UI.Panel.PanelWithSidebar implements SDK.TargetManager.SDKModelObserver<SecurityModel> {
    private readonly mainView;
    private readonly sidebarMainViewElement;
    private readonly sidebarTree;
    private readonly lastResponseReceivedForLoaderId;
    private readonly origins;
    private readonly filterRequestCounts;
    private visibleView;
    private eventListeners;
    private securityModel;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): SecurityPanel;
    static createCertificateViewerButtonForOrigin(text: string, origin: string): Element;
    static createCertificateViewerButtonForCert(text: string, names: string[]): Element;
    static createHighlightedUrl(url: Platform.DevToolsPath.UrlString, securityState: string): Element;
    private updateVisibleSecurityState;
    private onVisibleSecurityStateChanged;
    selectAndSwitchToMainView(): void;
    showOrigin(origin: Platform.DevToolsPath.UrlString): void;
    wasShown(): void;
    focus(): void;
    private setVisibleView;
    private onResponseReceived;
    private processRequest;
    private onRequestFinished;
    private updateFilterRequestCounts;
    filterRequestCount(filterKey: string): number;
    private securityStateMin;
    modelAdded(securityModel: SecurityModel): void;
    modelRemoved(securityModel: SecurityModel): void;
    private onMainFrameNavigated;
    private onInterstitialShown;
    private onInterstitialHidden;
}
export declare class SecurityPanelSidebarTree extends UI.TreeOutline.TreeOutlineInShadow {
    private readonly showOriginInPanel;
    private mainOrigin;
    private readonly originGroupTitles;
    private originGroups;
    private readonly elementsByOrigin;
    constructor(mainViewElement: SecurityPanelSidebarTreeElement, showOriginInPanel: (arg0: Origin) => void);
    private originGroupTitle;
    private originGroupElement;
    private createOriginGroupElement;
    toggleOriginsList(hidden: boolean): void;
    addOrigin(origin: Platform.DevToolsPath.UrlString, securityState: Protocol.Security.SecurityState): void;
    setMainOrigin(origin: string): void;
    updateOrigin(origin: string, securityState: Protocol.Security.SecurityState): void;
    private clearOriginGroups;
    clearOrigins(): void;
    wasShown(): void;
}
export declare enum OriginGroup {
    MainOrigin = "MainOrigin",
    NonSecure = "NonSecure",
    Secure = "Secure",
    Unknown = "Unknown"
}
export declare class SecurityPanelSidebarTreeElement extends UI.TreeOutline.TreeElement {
    private readonly selectCallback;
    private readonly cssPrefix;
    private readonly iconElement;
    private securityStateInternal;
    constructor(textElement: Element, selectCallback: () => void, className: string, cssPrefix: string);
    setSecurityState(newSecurityState: Protocol.Security.SecurityState): void;
    securityState(): Protocol.Security.SecurityState | null;
    onselect(): boolean;
}
export declare class SecurityMainView extends UI.Widget.VBox {
    private readonly panel;
    private readonly summarySection;
    private readonly securityExplanationsMain;
    private readonly securityExplanationsExtra;
    private readonly lockSpectrum;
    private summaryText;
    private explanations;
    private securityState;
    constructor(panel: SecurityPanel);
    getLockSpectrumDiv(securityState: Protocol.Security.SecurityState): HTMLElement;
    private addExplanation;
    updateVisibleSecurityState(visibleSecurityState: PageVisibleSecurityState): void;
    private getSecuritySummaryAndExplanations;
    private explainSafetyTipSecurity;
    private explainCertificateSecurity;
    private explainConnectionSecurity;
    private explainContentSecurity;
    private orderExplanations;
    refreshExplanations(): void;
    private addMixedContentExplanation;
    showNetworkFilter(filterKey: string, e: Event): void;
    wasShown(): void;
}
export declare class SecurityOriginView extends UI.Widget.VBox {
    private readonly panel;
    private readonly originLockIcon;
    constructor(panel: SecurityPanel, origin: Platform.DevToolsPath.UrlString, originState: OriginState);
    private createSanDiv;
    setSecurityState(newSecurityState: Protocol.Security.SecurityState): void;
    wasShown(): void;
}
export declare class SecurityDetailsTable {
    private readonly elementInternal;
    constructor();
    element(): HTMLTableElement;
    addRow(key: string, value: string | Node): void;
}
export interface OriginState {
    securityState: Protocol.Security.SecurityState;
    securityDetails: Protocol.Network.SecurityDetails | null;
    loadedFromCache: boolean;
    originView?: SecurityOriginView | null;
}
export declare type Origin = Platform.DevToolsPath.UrlString;
