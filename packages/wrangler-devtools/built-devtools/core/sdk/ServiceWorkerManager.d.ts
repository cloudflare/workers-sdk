import * as Common from '../common/common.js';
import type * as Platform from '../platform/platform.js';
import * as Protocol from '../../generated/protocol.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare class ServiceWorkerManager extends SDKModel<EventTypes> {
    #private;
    serviceWorkerNetworkRequestsPanelStatus: {
        isOpen: boolean;
        openedAt: number;
    };
    constructor(target: Target);
    enable(): Promise<void>;
    disable(): Promise<void>;
    registrations(): Map<string, ServiceWorkerRegistration>;
    hasRegistrationForURLs(urls: string[]): boolean;
    findVersion(versionId: string): ServiceWorkerVersion | null;
    deleteRegistration(registrationId: string): void;
    updateRegistration(registrationId: string): Promise<void>;
    deliverPushMessage(registrationId: Protocol.ServiceWorker.RegistrationID, data: string): Promise<void>;
    dispatchSyncEvent(registrationId: Protocol.ServiceWorker.RegistrationID, tag: string, lastChance: boolean): Promise<void>;
    dispatchPeriodicSyncEvent(registrationId: Protocol.ServiceWorker.RegistrationID, tag: string): Promise<void>;
    private unregister;
    startWorker(scopeURL: string): Promise<void>;
    skipWaiting(scopeURL: string): Promise<void>;
    stopWorker(versionId: string): Promise<void>;
    inspectWorker(versionId: string): Promise<void>;
    workerRegistrationUpdated(registrations: Protocol.ServiceWorker.ServiceWorkerRegistration[]): void;
    workerVersionUpdated(versions: Protocol.ServiceWorker.ServiceWorkerVersion[]): void;
    workerErrorReported(payload: Protocol.ServiceWorker.ServiceWorkerErrorMessage): void;
    forceUpdateOnReloadSetting(): Common.Settings.Setting<boolean>;
    private forceUpdateSettingChanged;
}
export declare enum Events {
    RegistrationUpdated = "RegistrationUpdated",
    RegistrationErrorAdded = "RegistrationErrorAdded",
    RegistrationDeleted = "RegistrationDeleted"
}
export interface RegistrationErrorAddedEvent {
    registration: ServiceWorkerRegistration;
    error: Protocol.ServiceWorker.ServiceWorkerErrorMessage;
}
export declare type EventTypes = {
    [Events.RegistrationUpdated]: ServiceWorkerRegistration;
    [Events.RegistrationErrorAdded]: RegistrationErrorAddedEvent;
    [Events.RegistrationDeleted]: ServiceWorkerRegistration;
};
/**
 * For every version, we keep a history of ServiceWorkerVersionState. Every time
 * a version is updated we will add a new state at the head of the history chain.
 * This history tells us information such as what the current state is, or when
 * the version becomes installed.
 */
export declare class ServiceWorkerVersionState {
    runningStatus: Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus;
    status: Protocol.ServiceWorker.ServiceWorkerVersionStatus;
    last_updated_timestamp: number;
    previousState: ServiceWorkerVersionState | null;
    constructor(runningStatus: Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus, status: Protocol.ServiceWorker.ServiceWorkerVersionStatus, previousState: ServiceWorkerVersionState | null, timestamp: number);
}
export declare class ServiceWorkerVersion {
    id: string;
    scriptURL: Platform.DevToolsPath.UrlString;
    parsedURL: Common.ParsedURL.ParsedURL;
    securityOrigin: string;
    scriptLastModified: number | undefined;
    scriptResponseTime: number | undefined;
    controlledClients: Protocol.Target.TargetID[];
    targetId: string | null;
    currentState: ServiceWorkerVersionState;
    registration: ServiceWorkerRegistration;
    constructor(registration: ServiceWorkerRegistration, payload: Protocol.ServiceWorker.ServiceWorkerVersion);
    update(payload: Protocol.ServiceWorker.ServiceWorkerVersion): void;
    isStartable(): boolean;
    isStoppedAndRedundant(): boolean;
    isStopped(): boolean;
    isStarting(): boolean;
    isRunning(): boolean;
    isStopping(): boolean;
    isNew(): boolean;
    isInstalling(): boolean;
    isInstalled(): boolean;
    isActivating(): boolean;
    isActivated(): boolean;
    isRedundant(): boolean;
    get status(): Protocol.ServiceWorker.ServiceWorkerVersionStatus;
    get runningStatus(): Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus;
    mode(): string;
}
export declare namespace ServiceWorkerVersion {
    const RunningStatus: {
        running: () => Common.UIString.LocalizedString;
        starting: () => Common.UIString.LocalizedString;
        stopped: () => Common.UIString.LocalizedString;
        stopping: () => Common.UIString.LocalizedString;
    };
    const Status: {
        activated: () => Common.UIString.LocalizedString;
        activating: () => Common.UIString.LocalizedString;
        installed: () => Common.UIString.LocalizedString;
        installing: () => Common.UIString.LocalizedString;
        new: () => Common.UIString.LocalizedString;
        redundant: () => Common.UIString.LocalizedString;
    };
    enum Modes {
        Installing = "installing",
        Waiting = "waiting",
        Active = "active",
        Redundant = "redundant"
    }
}
export declare class ServiceWorkerRegistration {
    #private;
    id: Protocol.ServiceWorker.RegistrationID;
    scopeURL: Platform.DevToolsPath.UrlString;
    securityOrigin: Platform.DevToolsPath.UrlString;
    isDeleted: boolean;
    versions: Map<string, ServiceWorkerVersion>;
    deleting: boolean;
    errors: Protocol.ServiceWorker.ServiceWorkerErrorMessage[];
    constructor(payload: Protocol.ServiceWorker.ServiceWorkerRegistration);
    update(payload: Protocol.ServiceWorker.ServiceWorkerRegistration): void;
    fingerprint(): symbol;
    versionsByMode(): Map<string, ServiceWorkerVersion>;
    updateVersion(payload: Protocol.ServiceWorker.ServiceWorkerVersion): ServiceWorkerVersion;
    isRedundant(): boolean;
    shouldBeRemoved(): boolean;
    canBeRemoved(): boolean;
    clearErrors(): void;
}
