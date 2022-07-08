import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type { ProtocolService } from './LighthouseProtocolService.js';
export declare class LighthouseController extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.ServiceWorkerManager.ServiceWorkerManager> {
    private manager?;
    private serviceWorkerListeners?;
    private inspectedURL?;
    constructor(protocolService: ProtocolService);
    modelAdded(serviceWorkerManager: SDK.ServiceWorkerManager.ServiceWorkerManager): void;
    modelRemoved(serviceWorkerManager: SDK.ServiceWorkerManager.ServiceWorkerManager): void;
    private hasActiveServiceWorker;
    private hasAtLeastOneCategory;
    private unauditablePageMessage;
    private javaScriptDisabled;
    private hasImportantResourcesNotCleared;
    private evaluateInspectedURL;
    getFlags(): {
        internalDisableDeviceScreenEmulation: boolean;
        emulatedFormFactor: (string | undefined);
        legacyNavigation: boolean;
        mode: string;
    };
    getCategoryIDs(): string[];
    getInspectedURL(options?: {
        force: boolean;
    }): Promise<Platform.DevToolsPath.UrlString>;
    recomputePageAuditability(): void;
}
export declare const Presets: Preset[];
export declare type Flags = {
    [flag: string]: string | boolean;
};
export declare const RuntimeSettings: RuntimeSetting[];
export declare enum Events {
    PageAuditabilityChanged = "PageAuditabilityChanged",
    PageWarningsChanged = "PageWarningsChanged",
    AuditProgressChanged = "AuditProgressChanged",
    RequestLighthouseTimespanStart = "RequestLighthouseTimespanStart",
    RequestLighthouseTimespanEnd = "RequestLighthouseTimespanEnd",
    RequestLighthouseStart = "RequestLighthouseStart",
    RequestLighthouseCancel = "RequestLighthouseCancel"
}
export interface PageAuditabilityChangedEvent {
    helpText: string;
}
export interface PageWarningsChangedEvent {
    warning: string;
}
export interface AuditProgressChangedEvent {
    message: string;
}
export declare type EventTypes = {
    [Events.PageAuditabilityChanged]: PageAuditabilityChangedEvent;
    [Events.PageWarningsChanged]: PageWarningsChangedEvent;
    [Events.AuditProgressChanged]: AuditProgressChangedEvent;
    [Events.RequestLighthouseTimespanStart]: boolean;
    [Events.RequestLighthouseTimespanEnd]: boolean;
    [Events.RequestLighthouseStart]: boolean;
    [Events.RequestLighthouseCancel]: void;
};
export interface Preset {
    setting: Common.Settings.Setting<boolean>;
    configID: string;
    title: () => Common.UIString.LocalizedString;
    description: () => Common.UIString.LocalizedString;
    plugin: boolean;
    supportedModes: string[];
}
export interface RuntimeSetting {
    setting: Common.Settings.Setting<string | boolean>;
    description: () => Common.UIString.LocalizedString;
    setFlags: (flags: Flags, value: string | boolean) => void;
    options?: {
        label: () => Common.UIString.LocalizedString;
        value: string;
        tooltip?: () => Common.UIString.LocalizedString;
    }[];
    title?: () => Common.UIString.LocalizedString;
    learnMore?: Platform.DevToolsPath.UrlString;
}
