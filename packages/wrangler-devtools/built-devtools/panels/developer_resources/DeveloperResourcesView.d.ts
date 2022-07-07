import * as UI from '../../ui/legacy/legacy.js';
export declare class DeveloperResourcesView extends UI.Widget.VBox {
    private textFilterRegExp;
    private readonly filterInput;
    private readonly coverageResultsElement;
    private listView;
    private readonly statusToolbarElement;
    private statusMessageElement;
    private readonly throttler;
    private readonly loader;
    private constructor();
    static instance(): DeveloperResourcesView;
    private onUpdate;
    private update;
    private updateStats;
    private isVisible;
    /**
     *
     */
    private onFilterChanged;
    wasShown(): void;
}
