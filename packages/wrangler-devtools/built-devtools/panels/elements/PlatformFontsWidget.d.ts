import * as UI from '../../ui/legacy/legacy.js';
import type { ComputedStyleModel } from './ComputedStyleModel.js';
export declare class PlatformFontsWidget extends UI.ThrottledWidget.ThrottledWidget {
    private readonly sharedModel;
    private readonly sectionTitle;
    private readonly fontStatsSection;
    constructor(sharedModel: ComputedStyleModel);
    doUpdate(): Promise<any>;
    private refreshUI;
    wasShown(): void;
}
