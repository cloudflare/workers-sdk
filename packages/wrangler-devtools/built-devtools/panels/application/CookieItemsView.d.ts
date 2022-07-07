import * as SDK from '../../core/sdk/sdk.js';
import { StorageItemsView } from './StorageItemsView.js';
export declare class CookieItemsView extends StorageItemsView {
    private model;
    private cookieDomain;
    private totalSize;
    private cookiesTable;
    private readonly splitWidget;
    private readonly previewPanel;
    private readonly previewWidget;
    private readonly emptyWidget;
    private onlyIssuesFilterUI;
    private readonly refreshThrottler;
    private eventDescriptors;
    private allCookies;
    private shownCookies;
    private selectedCookie;
    constructor(model: SDK.CookieModel.CookieModel, cookieDomain: string);
    setCookiesDomain(model: SDK.CookieModel.CookieModel, domain: string): void;
    private showPreview;
    private handleCookieSelected;
    private saveCookie;
    private deleteCookie;
    private updateWithCookies;
    filter<T>(items: T[], keyFunction: (arg0: T) => string): T[];
    /**
     * This will only delete the currently visible cookies.
     */
    deleteAllItems(): void;
    deleteSelectedItem(): void;
    refreshItems(): void;
    refreshItemsThrottled(): void;
    private onResponseReceived;
    private onLoadingFinished;
    wasShown(): void;
}
