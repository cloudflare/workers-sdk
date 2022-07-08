import * as Platform from '../../../../core/platform/platform.js';
import * as SDK from '../../../../core/sdk/sdk.js';
import * as UI from '../../legacy.js';
import * as DataGrid from '../data_grid/data_grid.js';
export declare class CookiesTable extends UI.Widget.VBox {
    private saveCallback?;
    private readonly refreshCallback?;
    private readonly deleteCallback?;
    private dataGrid;
    private lastEditedColumnId;
    private data;
    private cookieDomain;
    private cookieToBlockedReasons;
    constructor(renderInline?: boolean, saveCallback?: ((arg0: SDK.Cookie.Cookie, arg1: SDK.Cookie.Cookie | null) => Promise<boolean>), refreshCallback?: (() => void), selectedCallback?: (() => void), deleteCallback?: ((arg0: SDK.Cookie.Cookie, arg1: () => void) => void));
    wasShown(): void;
    setCookies(cookies: SDK.Cookie.Cookie[], cookieToBlockedReasons?: ReadonlyMap<SDK.Cookie.Cookie, SDK.CookieModel.BlockedReason[]>): void;
    setCookieFolders(cookieFolders: {
        folderName: string | null;
        cookies: Array<SDK.Cookie.Cookie> | null;
    }[], cookieToBlockedReasons?: ReadonlyMap<SDK.Cookie.Cookie, SDK.CookieModel.BlockedReason[]>): void;
    setCookieDomain(cookieDomain: string): void;
    selectedCookie(): SDK.Cookie.Cookie | null;
    private getSelectionCookies;
    willHide(): void;
    private findSelectedCookie;
    private isSameCookie;
    private rebuildTable;
    private populateNode;
    private addInactiveNode;
    private totalSize;
    private sortCookies;
    private createGridNode;
    private onDeleteCookie;
    private onUpdateCookie;
    private setDefaults;
    private saveNode;
    private createCookieFromData;
    private isValidCookieData;
    private isValidDomain;
    private isValidPath;
    private isValidDate;
    private refresh;
    private populateContextMenu;
}
export declare class DataGridNode extends DataGrid.DataGrid.DataGridNode<DataGridNode> {
    cookie: SDK.Cookie.Cookie;
    private readonly blockedReasons;
    private expiresTooltip?;
    constructor(data: {
        [x: string]: string | number | boolean;
    }, cookie: SDK.Cookie.Cookie, blockedReasons: SDK.CookieModel.BlockedReason[] | null);
    createCells(element: Element): void;
    setExpiresTooltip(tooltip: Platform.UIString.LocalizedString): void;
    createCell(columnId: string): HTMLElement;
}
