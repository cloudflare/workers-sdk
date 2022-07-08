import * as SDK from '../../core/sdk/sdk.js';
import * as NetworkForward from '../../panels/network/forward/forward.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { NetworkTimeCalculator } from './NetworkTimeCalculator.js';
export declare class NetworkItemView extends UI.TabbedPane.TabbedPane {
    private requestInternal;
    private readonly resourceViewTabSetting;
    private readonly headersView;
    private readonly headersViewComponent;
    private payloadView;
    private readonly responseView;
    private cookiesView;
    private initialTab?;
    constructor(request: SDK.NetworkRequest.NetworkRequest, calculator: NetworkTimeCalculator, initialTab?: NetworkForward.UIRequestLocation.UIRequestTabs);
    wasShown(): void;
    willHide(): void;
    private requestHeadersChanged;
    private maybeAppendCookiesPanel;
    private maybeAppendPayloadPanel;
    private maybeShowErrorIconInTrustTokenTabHeader;
    private selectTabInternal;
    private tabSelected;
    request(): SDK.NetworkRequest.NetworkRequest;
    revealResponseBody(line?: number): Promise<void>;
    revealHeader(section: NetworkForward.UIRequestLocation.UIHeaderSection, header: string | undefined): void;
}
