import type * as Platform from '../platform/platform.js';
import type * as Protocol from '../../generated/protocol.js';
export declare class Cookie {
    #private;
    constructor(name: string, value: string, type?: Type | null, priority?: Protocol.Network.CookiePriority);
    static fromProtocolCookie(protocolCookie: Protocol.Network.Cookie): Cookie;
    key(): string;
    name(): string;
    value(): string;
    type(): Type | null | undefined;
    httpOnly(): boolean;
    secure(): boolean;
    sameSite(): Protocol.Network.CookieSameSite;
    sameParty(): boolean;
    partitionKey(): string;
    partitionKeyOpaque(): boolean;
    priority(): Protocol.Network.CookiePriority;
    session(): boolean;
    path(): string;
    domain(): string;
    expires(): number;
    maxAge(): number;
    sourcePort(): number;
    sourceScheme(): Protocol.Network.CookieSourceScheme;
    size(): number;
    /**
     * @deprecated
     */
    url(): Platform.DevToolsPath.UrlString | null;
    setSize(size: number): void;
    expiresDate(requestDate: Date): Date | null;
    addAttribute(key: string, value?: string | number | boolean): void;
    setCookieLine(cookieLine: string): void;
    getCookieLine(): string | null;
    matchesSecurityOrigin(securityOrigin: string): boolean;
    static isDomainMatch(domain: string, hostname: string): boolean;
}
export declare enum Type {
    Request = 0,
    Response = 1
}
export declare enum Attributes {
    Name = "name",
    Value = "value",
    Size = "size",
    Domain = "domain",
    Path = "path",
    Expires = "expires",
    HttpOnly = "httpOnly",
    Secure = "secure",
    SameSite = "sameSite",
    SameParty = "sameParty",
    SourceScheme = "sourceScheme",
    SourcePort = "sourcePort",
    Priority = "priority",
    PartitionKey = "partitionKey"
}
