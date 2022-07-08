import * as UI from '../../ui/legacy/legacy.js';
import type { OverviewController } from './CSSOverviewController.js';
export declare class CSSOverviewProcessingView extends UI.Widget.Widget {
    #private;
    fragment?: UI.Fragment.Fragment;
    constructor(controller: OverviewController);
    wasShown(): void;
}
