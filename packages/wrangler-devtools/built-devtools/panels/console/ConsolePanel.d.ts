import type * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class ConsolePanel extends UI.Panel.Panel {
    private readonly view;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ConsolePanel;
    static updateContextFlavor(): void;
    wasShown(): void;
    willHide(): void;
    searchableView(): UI.SearchableView.SearchableView | null;
}
export declare class WrapperView extends UI.Widget.VBox {
    private readonly view;
    private constructor();
    static instance(): WrapperView;
    wasShown(): void;
    willHide(): void;
    showViewInWrapper(): void;
}
export declare class ConsoleRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ConsoleRevealer;
    reveal(_object: Object): Promise<void>;
}
