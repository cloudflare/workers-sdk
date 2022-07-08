import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class RequestPayloadView extends UI.Widget.VBox {
    private request;
    private decodeRequestParameters;
    private queryStringCategory;
    private formDataCategory;
    private requestPayloadCategory;
    constructor(request: SDK.NetworkRequest.NetworkRequest);
    wasShown(): void;
    willHide(): void;
    private addEntryContextMenuHandler;
    private formatParameter;
    private refreshQueryString;
    private refreshFormData;
    private populateTreeElementWithSourceText;
    private refreshParams;
    private appendParamsSource;
    private appendParamsParsed;
    private refreshRequestJSONPayload;
    private appendJSONPayloadSource;
    private appendJSONPayloadParsed;
    private createViewSourceToggle;
    private toggleURLDecoding;
    private createToggleButton;
}
export declare class Category extends UI.TreeOutline.TreeElement {
    toggleOnClick: boolean;
    private readonly expandedSetting;
    expanded: boolean;
    constructor(root: UI.TreeOutline.TreeOutline, name: string, title?: string);
    createLeaf(): UI.TreeOutline.TreeElement;
    onexpand(): void;
    oncollapse(): void;
}
