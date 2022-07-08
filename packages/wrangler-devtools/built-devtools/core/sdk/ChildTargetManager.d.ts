import type * as ProtocolClient from '../protocol_client/protocol_client.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare class ChildTargetManager extends SDKModel<EventTypes> implements ProtocolProxyApi.TargetDispatcher {
    #private;
    constructor(parentTarget: Target);
    static install(attachCallback?: ((arg0: {
        target: Target;
        waitingForDebugger: boolean;
    }) => Promise<void>)): void;
    childTargets(): Target[];
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    dispose(): void;
    targetCreated({ targetInfo }: Protocol.Target.TargetCreatedEvent): void;
    targetInfoChanged({ targetInfo }: Protocol.Target.TargetInfoChangedEvent): void;
    targetDestroyed({ targetId }: Protocol.Target.TargetDestroyedEvent): void;
    targetCrashed({ targetId, status, errorCode }: Protocol.Target.TargetCrashedEvent): void;
    private fireAvailableTargetsChanged;
    getParentTargetId(): Promise<Protocol.Target.TargetID>;
    attachedToTarget({ sessionId, targetInfo, waitingForDebugger }: Protocol.Target.AttachedToTargetEvent): Promise<void>;
    detachedFromTarget({ sessionId }: Protocol.Target.DetachedFromTargetEvent): void;
    receivedMessageFromTarget({}: Protocol.Target.ReceivedMessageFromTargetEvent): void;
    createParallelConnection(onMessage: (arg0: (Object | string)) => void): Promise<{
        connection: ProtocolClient.InspectorBackend.Connection;
        sessionId: string;
    }>;
    private createParallelConnectionAndSessionForTarget;
    targetInfos(): Protocol.Target.TargetInfo[];
    private static lastAnonymousTargetId;
    private static attachCallback?;
}
export declare enum Events {
    TargetCreated = "TargetCreated",
    TargetDestroyed = "TargetDestroyed",
    TargetInfoChanged = "TargetInfoChanged"
}
export declare type EventTypes = {
    [Events.TargetCreated]: Protocol.Target.TargetInfo;
    [Events.TargetDestroyed]: Protocol.Target.TargetID;
    [Events.TargetInfoChanged]: Protocol.Target.TargetInfo;
};
