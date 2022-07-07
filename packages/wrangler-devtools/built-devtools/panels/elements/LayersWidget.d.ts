import * as UI from '../../ui/legacy/legacy.js';
export declare class LayersWidget extends UI.Widget.Widget {
    private cssModel?;
    private layerTreeComponent;
    constructor();
    private updateModel;
    wasShown(): Promise<void>;
    private update;
    revealLayer(layerName: string): Promise<void>;
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): LayersWidget;
}
export declare class ButtonProvider implements UI.Toolbar.Provider {
    private readonly button;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): ButtonProvider;
    private clicked;
    item(): UI.Toolbar.ToolbarToggle;
}
