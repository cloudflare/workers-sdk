import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class InspectorMainImpl implements Common.Runnable.Runnable {
    static instance(opts?: {
        forceNew: boolean | null;
    }): InspectorMainImpl;
    run(): Promise<void>;
}
export declare class ReloadActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ReloadActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
export declare class FocusDebuggeeActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): FocusDebuggeeActionDelegate;
    handleAction(_context: UI.Context.Context, _actionId: string): boolean;
}
export declare class NodeIndicator implements UI.Toolbar.Provider {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): NodeIndicator;
    item(): UI.Toolbar.ToolbarItem | null;
}
export declare class SourcesPanelIndicator {
    constructor();
}
export declare class BackendSettingsSync implements SDK.TargetManager.Observer {
    #private;
    constructor();
    targetAdded(target: SDK.Target.Target): void;
    targetRemoved(_target: SDK.Target.Target): void;
}
