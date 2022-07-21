import type * as Platform from '../../core/platform/platform.js';
import { AffectedElementsView } from './AffectedElementsView.js';
export declare class AffectedDocumentsInQuirksModeView extends AffectedElementsView {
    #private;
    update(): void;
    protected getResourceName(count: number): Platform.UIString.LocalizedString;
}
