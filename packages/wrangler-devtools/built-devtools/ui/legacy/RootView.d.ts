import { VBox } from './Widget.js';
export declare class RootView extends VBox {
    private window?;
    constructor();
    attachToDocument(document: Document): void;
    doResize(): void;
}
