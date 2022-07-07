import * as SDK from '../../core/sdk/sdk.js';
export declare class ContrastCheckTrigger {
    #private;
    constructor();
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): ContrastCheckTrigger;
    modelAdded(resourceTreeModel: SDK.ResourceTreeModel.ResourceTreeModel): Promise<void>;
    modelRemoved(resourceTreeModel: SDK.ResourceTreeModel.ResourceTreeModel): void;
}
