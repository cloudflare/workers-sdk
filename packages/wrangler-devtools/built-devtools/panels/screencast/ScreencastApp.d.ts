import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class ScreencastApp implements Common.App.App, SDK.TargetManager.SDKModelObserver<SDK.ScreenCaptureModel.ScreenCaptureModel> {
    private readonly enabledSetting;
    toggleButton: UI.Toolbar.ToolbarToggle;
    private rootSplitWidget?;
    private screenCaptureModel?;
    private screencastView?;
    constructor();
    static instance(): ScreencastApp;
    presentUI(document: Document): void;
    modelAdded(screenCaptureModel: SDK.ScreenCaptureModel.ScreenCaptureModel): void;
    modelRemoved(screenCaptureModel: SDK.ScreenCaptureModel.ScreenCaptureModel): void;
    private toggleButtonClicked;
    private onScreencastEnabledChanged;
}
export declare class ToolbarButtonProvider implements UI.Toolbar.Provider {
    static instance(opts?: {
        forceNew: boolean;
    }): ToolbarButtonProvider;
    item(): UI.Toolbar.ToolbarItem | null;
}
export declare class ScreencastAppProvider implements Common.AppProvider.AppProvider {
    static instance(opts?: {
        forceNew: boolean;
    }): ScreencastAppProvider;
    createApp(): Common.App.App;
}
