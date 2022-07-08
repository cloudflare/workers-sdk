import * as SDK from '../../core/sdk/sdk.js';
import type * as UI from '../../ui/legacy/legacy.js';
export declare class ExecutionContextSelector implements SDK.TargetManager.SDKModelObserver<SDK.RuntimeModel.RuntimeModel> {
    #private;
    constructor(targetManager: SDK.TargetManager.TargetManager, context: UI.Context.Context);
    modelAdded(runtimeModel: SDK.RuntimeModel.RuntimeModel): void;
    modelRemoved(runtimeModel: SDK.RuntimeModel.RuntimeModel): void;
}
