import * as UI from '../../ui/legacy/legacy.js';
import type * as ReportRenderer from './LighthouseReporterTypes.js';
export declare class ReportSelector {
    private readonly renderNewLighthouseView;
    private newLighthouseItem;
    private readonly comboBoxInternal;
    private readonly itemByOptionElement;
    constructor(renderNewLighthouseView: () => void);
    private setEmptyState;
    private handleChange;
    private selectedItem;
    hasCurrentSelection(): boolean;
    hasItems(): boolean;
    comboBox(): UI.Toolbar.ToolbarComboBox;
    prepend(item: Item): void;
    clearAll(): void;
    selectNewReport(): void;
}
export declare class Item {
    private readonly lighthouseResult;
    private readonly renderReport;
    private readonly showLandingCallback;
    private readonly element;
    constructor(lighthouseResult: ReportRenderer.ReportJSON, renderReport: () => void, showLandingCallback: () => void);
    select(): void;
    optionElement(): Element;
    delete(): void;
}
