import type { Attributes } from './Cookie.js';
import { Cookie } from './Cookie.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare class CookieModel extends SDKModel<void> {
    #private;
    constructor(target: Target);
    addBlockedCookie(cookie: Cookie, blockedReasons: BlockedReason[] | null): void;
    getCookieToBlockedReasonsMap(): ReadonlyMap<Cookie, BlockedReason[]>;
    getCookies(urls: string[]): Promise<Cookie[]>;
    deleteCookie(cookie: Cookie): Promise<void>;
    clear(domain?: string, securityOrigin?: string): Promise<void>;
    saveCookie(cookie: Cookie): Promise<boolean>;
    /**
     * Returns cookies needed by current page's frames whose security origins are |domain|.
     */
    getCookiesForDomain(domain: string | null): Promise<Cookie[]>;
    deleteCookies(cookies: Cookie[]): Promise<void>;
}
export interface BlockedReason {
    uiString: string;
    attribute: Attributes | null;
}
