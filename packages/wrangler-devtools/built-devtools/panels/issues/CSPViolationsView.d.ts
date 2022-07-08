import * as UI from '../../ui/legacy/legacy.js';
export declare class CSPViolationsView extends UI.Widget.VBox {
    #private;
    /**
     * @private
     */
    constructor();
    static instance(opts?: {
        forceNew: null;
    }): CSPViolationsView;
    wasShown(): void;
}
