import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class RequestCookiesView extends UI.Widget.Widget {
    private request;
    private readonly showFilteredOutCookiesSetting;
    private readonly emptyWidget;
    private readonly requestCookiesTitle;
    private readonly requestCookiesEmpty;
    private readonly requestCookiesTable;
    private readonly responseCookiesTitle;
    private readonly responseCookiesTable;
    private readonly malformedResponseCookiesTitle;
    private readonly malformedResponseCookiesList;
    constructor(request: SDK.NetworkRequest.NetworkRequest);
    private getRequestCookies;
    private getResponseCookies;
    private refreshRequestCookiesView;
    wasShown(): void;
    willHide(): void;
}
