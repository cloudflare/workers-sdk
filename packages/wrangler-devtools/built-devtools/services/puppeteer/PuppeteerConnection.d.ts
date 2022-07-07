import * as puppeteer from '../../third_party/puppeteer/puppeteer.js';
import type * as SDK from '../../core/sdk/sdk.js';
export declare class Transport implements puppeteer.ConnectionTransport {
    #private;
    constructor(connection: SDK.Connections.ParallelConnectionInterface);
    send(message: string): void;
    close(): void;
    set onmessage(cb: (message: string) => void);
    set onclose(cb: () => void);
}
export declare class PuppeteerConnection extends puppeteer.Connection {
    onMessage(message: string): Promise<void>;
}
export declare function getPuppeteerConnection(rawConnection: SDK.Connections.ParallelConnectionInterface, mainFrameId: string, mainTargetId: string): Promise<{
    page: puppeteer.Page | null;
    browser: puppeteer.Browser;
}>;
