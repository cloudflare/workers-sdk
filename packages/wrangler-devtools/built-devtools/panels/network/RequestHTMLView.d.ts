import * as UI from '../../ui/legacy/legacy.js';
export declare class RequestHTMLView extends UI.Widget.VBox {
    private readonly dataURL;
    constructor(dataURL: string);
    wasShown(): void;
    willHide(): void;
    private createIFrame;
}
