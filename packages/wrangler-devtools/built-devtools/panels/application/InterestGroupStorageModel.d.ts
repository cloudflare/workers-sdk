import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
export declare class InterestGroupStorageModel extends SDK.SDKModel.SDKModel<EventTypes> implements ProtocolProxyApi.StorageDispatcher {
    private readonly storageAgent;
    private enabled?;
    constructor(target: SDK.Target.Target);
    enable(): void;
    disable(): void;
    interestGroupAccessed(event: Protocol.Storage.InterestGroupAccessedEvent): void;
    indexedDBListUpdated(_event: Protocol.Storage.IndexedDBListUpdatedEvent): void;
    indexedDBContentUpdated(_event: Protocol.Storage.IndexedDBContentUpdatedEvent): void;
    cacheStorageListUpdated(_event: Protocol.Storage.CacheStorageListUpdatedEvent): void;
    cacheStorageContentUpdated(_event: Protocol.Storage.CacheStorageContentUpdatedEvent): void;
}
export declare const enum Events {
    InterestGroupAccess = "InterestGroupAccess"
}
export declare type EventTypes = {
    [Events.InterestGroupAccess]: Protocol.Storage.InterestGroupAccessedEvent;
};
