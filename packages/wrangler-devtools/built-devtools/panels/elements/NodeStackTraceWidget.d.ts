import * as UI from '../../ui/legacy/legacy.js';
export declare class NodeStackTraceWidget extends UI.ThrottledWidget.ThrottledWidget {
    private readonly noStackTraceElement;
    private readonly creationStackTraceElement;
    private readonly linkifier;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): NodeStackTraceWidget;
    wasShown(): void;
    willHide(): void;
    doUpdate(): Promise<void>;
}
export declare const MaxLengthForLinks = 40;
