import * as Platform from '../platform/platform.js';
import * as ProtocolClient from '../protocol_client/protocol_client.js';
import type * as Protocol from '../../generated/protocol.js';
import type { TargetManager } from './TargetManager.js';
import { SDKModel } from './SDKModel.js';
export declare class Target extends ProtocolClient.InspectorBackend.TargetBase {
    #private;
    constructor(targetManager: TargetManager, id: Protocol.Target.TargetID | 'main', name: string, type: Type, parentTarget: Target | null, sessionId: string, suspended: boolean, connection: ProtocolClient.InspectorBackend.Connection | null, targetInfo?: Protocol.Target.TargetInfo);
    createModels(required: Set<new (arg1: Target) => SDKModel>): void;
    id(): Protocol.Target.TargetID | 'main';
    name(): string;
    type(): Type;
    markAsNodeJSForTest(): void;
    targetManager(): TargetManager;
    hasAllCapabilities(capabilitiesMask: number): boolean;
    decorateLabel(label: string): string;
    parentTarget(): Target | null;
    dispose(reason: string): void;
    model<T extends SDKModel>(modelClass: new (arg1: Target) => T): T | null;
    models(): Map<new (arg1: Target) => SDKModel, SDKModel>;
    inspectedURL(): Platform.DevToolsPath.UrlString;
    setInspectedURL(inspectedURL: Platform.DevToolsPath.UrlString): void;
    suspend(reason?: string): Promise<void>;
    resume(): Promise<void>;
    suspended(): boolean;
    updateTargetInfo(targetInfo: Protocol.Target.TargetInfo): void;
    targetInfo(): Protocol.Target.TargetInfo | undefined;
}
export declare enum Type {
    Frame = "frame",
    ServiceWorker = "service-worker",
    Worker = "worker",
    SharedWorker = "shared-worker",
    Node = "node",
    Browser = "browser",
    AuctionWorklet = "auction-worklet"
}
export declare enum Capability {
    Browser = 1,
    DOM = 2,
    JS = 4,
    Log = 8,
    Network = 16,
    Target = 32,
    ScreenCapture = 64,
    Tracing = 128,
    Emulation = 256,
    Security = 512,
    Input = 1024,
    Inspector = 2048,
    DeviceEmulation = 4096,
    Storage = 8192,
    ServiceWorker = 16384,
    Audits = 32768,
    WebAuthn = 65536,
    IO = 131072,
    Media = 262144,
    EventBreakpoints = 524288,
    None = 0
}
