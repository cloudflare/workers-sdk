import type * as Common from '../../core/common/common.js';
export declare class AdvancedApp implements Common.App.App {
    private rootSplitWidget;
    private deviceModeView;
    private inspectedPagePlaceholder;
    private toolboxWindow?;
    private toolboxRootView?;
    private changingDockSide?;
    constructor();
    /**
     * Note: it's used by toolbox.ts without real type checks.
     */
    static instance(): AdvancedApp;
    presentUI(document: Document): void;
    private openToolboxWindow;
    deviceModeEmulationFrameLoaded(toolboxDocument: Document): void;
    private updateDeviceModeView;
    private onBeforeDockSideChange;
    private onDockSideChange;
    private onAfterDockSideChange;
    private updateForDocked;
    private updateForUndocked;
    private isDocked;
    private onSetInspectedPageBounds;
}
export declare class AdvancedAppProvider implements Common.AppProvider.AppProvider {
    static instance(opts?: {
        forceNew: boolean | null;
    }): AdvancedAppProvider;
    createApp(): Common.App.App;
}
