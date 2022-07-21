import type * as SDK from '../../../core/sdk/sdk.js';
import type * as TextUtils from '../../../models/text_utils/text_utils.js';
export declare enum UIHeaderSection {
    General = "General",
    Request = "Request",
    Response = "Response"
}
interface UIHeaderLocation {
    section: UIHeaderSection;
    header: SDK.NetworkRequest.NameValue | null;
}
export declare enum UIRequestTabs {
    Cookies = "cookies",
    EventSource = "eventSource",
    Headers = "headers",
    HeadersComponent = "headersComponent",
    Payload = "payload",
    Initiator = "initiator",
    Preview = "preview",
    Response = "response",
    Timing = "timing",
    TrustTokens = "trustTokens",
    WsFrames = "webSocketFrames"
}
export interface FilterOptions {
    clearFilter: boolean;
}
export declare class UIRequestLocation {
    readonly request: SDK.NetworkRequest.NetworkRequest;
    readonly header: UIHeaderLocation | null;
    readonly searchMatch: TextUtils.ContentProvider.SearchMatch | null;
    readonly isUrlMatch: boolean;
    readonly tab: UIRequestTabs | undefined;
    readonly filterOptions: FilterOptions | undefined;
    private constructor();
    static requestHeaderMatch(request: SDK.NetworkRequest.NetworkRequest, header: SDK.NetworkRequest.NameValue | null): UIRequestLocation;
    static responseHeaderMatch(request: SDK.NetworkRequest.NetworkRequest, header: SDK.NetworkRequest.NameValue | null): UIRequestLocation;
    static bodyMatch(request: SDK.NetworkRequest.NetworkRequest, searchMatch: TextUtils.ContentProvider.SearchMatch | null): UIRequestLocation;
    static urlMatch(request: SDK.NetworkRequest.NetworkRequest): UIRequestLocation;
    static header(request: SDK.NetworkRequest.NetworkRequest, section: UIHeaderSection, name: string): UIRequestLocation;
    static tab(request: SDK.NetworkRequest.NetworkRequest, tab: UIRequestTabs, filterOptions?: FilterOptions): UIRequestLocation;
}
export {};
