import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as Workspace from '../workspace/workspace.js';
export declare class NetworkProjectManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private constructor();
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): NetworkProjectManager;
}
export declare enum Events {
    FrameAttributionAdded = "FrameAttributionAdded",
    FrameAttributionRemoved = "FrameAttributionRemoved"
}
export interface FrameAttributionEvent {
    uiSourceCode: Workspace.UISourceCode.UISourceCode;
    frame: SDK.ResourceTreeModel.ResourceTreeFrame;
}
export declare type EventTypes = {
    [Events.FrameAttributionAdded]: FrameAttributionEvent;
    [Events.FrameAttributionRemoved]: FrameAttributionEvent;
};
export declare class NetworkProject {
    static resolveFrame(uiSourceCode: Workspace.UISourceCode.UISourceCode, frameId: Protocol.Page.FrameId): SDK.ResourceTreeModel.ResourceTreeFrame | null;
    static setInitialFrameAttribution(uiSourceCode: Workspace.UISourceCode.UISourceCode, frameId: Protocol.Page.FrameId): void;
    static cloneInitialFrameAttribution(fromUISourceCode: Workspace.UISourceCode.UISourceCode, toUISourceCode: Workspace.UISourceCode.UISourceCode): void;
    static addFrameAttribution(uiSourceCode: Workspace.UISourceCode.UISourceCode, frameId: Protocol.Page.FrameId): void;
    static removeFrameAttribution(uiSourceCode: Workspace.UISourceCode.UISourceCode, frameId: Protocol.Page.FrameId): void;
    static targetForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Target.Target | null;
    static setTargetForProject(project: Workspace.Workspace.Project, target: SDK.Target.Target): void;
    static getTargetForProject(project: Workspace.Workspace.Project): SDK.Target.Target | null;
    static framesForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.ResourceTreeModel.ResourceTreeFrame[];
}
