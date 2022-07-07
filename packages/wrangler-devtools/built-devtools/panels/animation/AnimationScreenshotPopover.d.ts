import * as UI from '../../ui/legacy/legacy.js';
export declare class AnimationScreenshotPopover extends UI.Widget.VBox {
    #private;
    constructor(images: HTMLImageElement[]);
    wasShown(): void;
    willHide(): void;
    private changeFrame;
}
