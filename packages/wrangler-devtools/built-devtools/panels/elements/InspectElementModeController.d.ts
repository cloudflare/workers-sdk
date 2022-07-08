import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class InspectElementModeController implements SDK.TargetManager.SDKModelObserver<SDK.OverlayModel.OverlayModel> {
    private readonly toggleSearchAction;
    private mode;
    private readonly showDetailedInspectTooltipSetting;
    constructor();
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): InspectElementModeController;
    modelAdded(overlayModel: SDK.OverlayModel.OverlayModel): void;
    modelRemoved(_overlayModel: SDK.OverlayModel.OverlayModel): void;
    private isInInspectElementMode;
    toggleInspectMode(): void;
    captureScreenshotMode(): void;
    private setMode;
    private suspendStateChanged;
    private inspectNode;
    private showDetailedInspectTooltipChanged;
}
export declare class ToggleSearchActionDelegate implements UI.ActionRegistration.ActionDelegate {
    handleAction(context: UI.Context.Context, actionId: string): boolean;
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): ToggleSearchActionDelegate;
}
