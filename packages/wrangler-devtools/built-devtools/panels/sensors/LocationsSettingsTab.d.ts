import * as UI from '../../ui/legacy/legacy.js';
export declare class LocationsSettingsTab extends UI.Widget.VBox implements UI.ListWidget.Delegate<LocationDescription> {
    private readonly list;
    private readonly customSetting;
    private editor?;
    private constructor();
    static instance(): LocationsSettingsTab;
    wasShown(): void;
    private locationsUpdated;
    private addButtonClicked;
    renderItem(location: LocationDescription, _editable: boolean): Element;
    removeItemRequested(item: LocationDescription, index: number): void;
    commitEdit(location: LocationDescription, editor: UI.ListWidget.Editor<LocationDescription>, isNew: boolean): void;
    beginEdit(location: LocationDescription): UI.ListWidget.Editor<LocationDescription>;
    private createEditor;
}
export interface LocationDescription {
    title: string;
    lat: number;
    long: number;
    timezoneId: string;
    locale: string;
}
