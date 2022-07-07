import * as UI from '../../ui/legacy/legacy.js';
export declare class RenderingOptionsView extends UI.Widget.VBox {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): RenderingOptionsView;
    wasShown(): void;
}
export declare class ReloadActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ReloadActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
