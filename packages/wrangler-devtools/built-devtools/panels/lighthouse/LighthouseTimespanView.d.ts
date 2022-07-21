import * as UI from '../../ui/legacy/legacy.js';
import type { LighthouseController } from './LighthouseController.js';
export declare class TimespanView extends UI.Dialog.Dialog {
    private controller;
    private statusHeader;
    private endButton;
    constructor(controller: LighthouseController);
    show(dialogRenderElement: Element): void;
    reset(): void;
    ready(): void;
    render(): void;
    private endTimespan;
    private cancel;
}
