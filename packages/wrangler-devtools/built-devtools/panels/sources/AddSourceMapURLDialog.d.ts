import type * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class AddSourceMapURLDialog extends UI.Widget.HBox {
    private readonly input;
    private readonly dialog;
    private readonly callback;
    constructor(callback: (arg0: Platform.DevToolsPath.UrlString) => void);
    show(): void;
    private done;
    private apply;
    private onKeyDown;
    wasShown(): void;
}
