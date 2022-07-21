import type * as Common from '../../core/common/common.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as ProtocolClient from '../../core/protocol_client/protocol_client.js';
import * as SDK from '../../core/sdk/sdk.js';
export declare class NodeMainImpl implements Common.Runnable.Runnable {
    static instance(opts?: {
        forceNew: boolean | null;
    }): NodeMainImpl;
    run(): Promise<void>;
}
export declare class NodeChildTargetManager extends SDK.SDKModel.SDKModel<void> implements ProtocolProxyApi.TargetDispatcher {
    #private;
    constructor(parentTarget: SDK.Target.Target);
    dispose(): void;
    targetCreated({ targetInfo }: Protocol.Target.TargetCreatedEvent): void;
    targetInfoChanged(_event: Protocol.Target.TargetInfoChangedEvent): void;
    targetDestroyed(_event: Protocol.Target.TargetDestroyedEvent): void;
    attachedToTarget({ sessionId, targetInfo }: Protocol.Target.AttachedToTargetEvent): void;
    detachedFromTarget({ sessionId }: Protocol.Target.DetachedFromTargetEvent): void;
    receivedMessageFromTarget({ sessionId, message }: Protocol.Target.ReceivedMessageFromTargetEvent): void;
    targetCrashed(_event: Protocol.Target.TargetCrashedEvent): void;
}
export declare class NodeConnection implements ProtocolClient.InspectorBackend.Connection {
    #private;
    onMessage: ((arg0: (Object | string)) => void) | null;
    constructor(targetAgent: ProtocolProxyApi.TargetApi, sessionId: Protocol.Target.SessionID);
    setOnMessage(onMessage: (arg0: (Object | string)) => void): void;
    setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    sendRawMessage(message: string): void;
    disconnect(): Promise<void>;
}
