import { VBox } from './Widget.js';
export declare class ThrottledWidget extends VBox {
    private readonly updateThrottler;
    private updateWhenVisible;
    constructor(isWebComponent?: boolean, timeout?: number);
    protected doUpdate(): Promise<void>;
    update(): void;
    wasShown(): void;
}
