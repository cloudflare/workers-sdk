import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
export declare class ResourceMapping implements SDK.TargetManager.SDKModelObserver<SDK.ResourceTreeModel.ResourceTreeModel> {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
        targetManager: SDK.TargetManager.TargetManager | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
    }): ResourceMapping;
    static removeInstance(): void;
    modelAdded(resourceTreeModel: SDK.ResourceTreeModel.ResourceTreeModel): void;
    modelRemoved(resourceTreeModel: SDK.ResourceTreeModel.ResourceTreeModel): void;
    private infoForTarget;
    cssLocationToUILocation(cssLocation: SDK.CSSModel.CSSLocation): Workspace.UISourceCode.UILocation | null;
    jsLocationToUILocation(jsLocation: SDK.DebuggerModel.Location): Workspace.UISourceCode.UILocation | null;
    uiLocationToJSLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number): SDK.DebuggerModel.Location[];
    uiLocationToCSSLocations(uiLocation: Workspace.UISourceCode.UILocation): SDK.CSSModel.CSSLocation[];
    resetForTest(target: SDK.Target.Target): void;
}
