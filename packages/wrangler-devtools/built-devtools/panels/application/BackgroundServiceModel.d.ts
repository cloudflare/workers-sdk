import * as SDK from '../../core/sdk/sdk.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
export declare class BackgroundServiceModel extends SDK.SDKModel.SDKModel<EventTypes> implements ProtocolProxyApi.BackgroundServiceDispatcher {
    private readonly backgroundServiceAgent;
    private readonly events;
    constructor(target: SDK.Target.Target);
    enable(service: Protocol.BackgroundService.ServiceName): void;
    setRecording(shouldRecord: boolean, service: Protocol.BackgroundService.ServiceName): void;
    clearEvents(service: Protocol.BackgroundService.ServiceName): void;
    getEvents(service: Protocol.BackgroundService.ServiceName): Protocol.BackgroundService.BackgroundServiceEvent[];
    recordingStateChanged({ isRecording, service }: Protocol.BackgroundService.RecordingStateChangedEvent): void;
    backgroundServiceEventReceived({ backgroundServiceEvent }: Protocol.BackgroundService.BackgroundServiceEventReceivedEvent): void;
}
export declare enum Events {
    RecordingStateChanged = "RecordingStateChanged",
    BackgroundServiceEventReceived = "BackgroundServiceEventReceived"
}
export declare type EventTypes = {
    [Events.RecordingStateChanged]: {
        isRecording: boolean;
        serviceName: Protocol.BackgroundService.ServiceName;
    };
    [Events.BackgroundServiceEventReceived]: Protocol.BackgroundService.BackgroundServiceEvent;
};
