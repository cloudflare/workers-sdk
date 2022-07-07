import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare class StorageKeyManager extends SDKModel<EventTypes> {
    #private;
    constructor(target: Target);
    updateStorageKeys(storageKeys: Set<string>): void;
    storageKeys(): string[];
    mainStorageKey(): string;
    setMainStorageKey(storageKey: string): void;
}
export declare enum Events {
    StorageKeyAdded = "StorageKeyAdded",
    StorageKeyRemoved = "StorageKeyRemoved",
    MainStorageKeyChanged = "MainStorageKeyChanged"
}
export interface MainStorageKeyChangedEvent {
    mainStorageKey: string;
}
export declare type EventTypes = {
    [Events.StorageKeyAdded]: string;
    [Events.StorageKeyRemoved]: string;
    [Events.MainStorageKeyChanged]: MainStorageKeyChangedEvent;
};
