import * as UI from '../../ui/legacy/legacy.js';
import type { ExtensionServer } from './ExtensionServer.js';
export declare class ExtensionView extends UI.Widget.Widget {
    private readonly server;
    private readonly id;
    private iframe;
    private frameIndex?;
    constructor(server: ExtensionServer, id: string, src: string, className: string);
    wasShown(): void;
    willHide(): void;
    private onLoad;
}
export declare class ExtensionNotifierView extends UI.Widget.VBox {
    private readonly server;
    private readonly id;
    constructor(server: ExtensionServer, id: string);
    wasShown(): void;
    willHide(): void;
}
