export declare enum FilterType {
    Domain = "domain",
    HasResponseHeader = "has-response-header",
    ResponseHeaderValueSetCookie = "response-header-set-cookie",
    Is = "is",
    LargerThan = "larger-than",
    Method = "method",
    MimeType = "mime-type",
    MixedContent = "mixed-content",
    Priority = "priority",
    Scheme = "scheme",
    SetCookieDomain = "set-cookie-domain",
    SetCookieName = "set-cookie-name",
    SetCookieValue = "set-cookie-value",
    ResourceType = "resource-type",
    CookieDomain = "cookie-domain",
    CookieName = "cookie-name",
    CookiePath = "cookie-path",
    CookieValue = "cookie-value",
    StatusCode = "status-code",
    Url = "url"
}
export declare enum IsFilterType {
    Running = "running",
    FromCache = "from-cache",
    ServiceWorkerIntercepted = "service-worker-intercepted",
    ServiceWorkerInitiated = "service-worker-initiated"
}
export declare enum MixedContentFilterValues {
    All = "all",
    Displayed = "displayed",
    Blocked = "blocked",
    BlockOverridden = "block-overridden"
}
interface UIFilter {
    filterType: FilterType | null;
    filterValue: string;
}
export declare class UIRequestFilter {
    readonly filters: UIFilter[];
    private constructor();
    static filters(filters: UIFilter[]): UIRequestFilter;
}
export {};
