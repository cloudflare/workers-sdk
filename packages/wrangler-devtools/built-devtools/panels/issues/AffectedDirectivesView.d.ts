import * as Platform from '../../core/platform/platform.js';
import { AffectedResourcesView } from './AffectedResourcesView.js';
export declare class AffectedDirectivesView extends AffectedResourcesView {
    #private;
    protected getResourceNameWithCount(count: number): Platform.UIString.LocalizedString;
    update(): void;
}
