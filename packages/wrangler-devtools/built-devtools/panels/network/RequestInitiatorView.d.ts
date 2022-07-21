import * as SDK from '../../core/sdk/sdk.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class RequestInitiatorView extends UI.Widget.VBox {
    private readonly linkifier;
    private readonly request;
    private readonly emptyWidget;
    private hasShown;
    constructor(request: SDK.NetworkRequest.NetworkRequest);
    static createStackTracePreview(request: SDK.NetworkRequest.NetworkRequest, linkifier: Components.Linkifier.Linkifier, focusableLink?: boolean): {
        element: Element;
        links: Array<Element>;
    } | null;
    private createTree;
    private buildRequestChainTree;
    private depthFirstSearchTreeBuilder;
    private buildStackTraceSection;
    wasShown(): void;
}
