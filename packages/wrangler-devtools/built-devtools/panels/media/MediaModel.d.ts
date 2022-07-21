import * as SDK from '../../core/sdk/sdk.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
export interface PlayerEvent extends Protocol.Media.PlayerEvent {
    value: string;
    displayTimestamp: string;
    event: string;
}
export declare const enum Events {
    PlayerPropertiesChanged = "PlayerPropertiesChanged",
    PlayerEventsAdded = "PlayerEventsAdded",
    PlayerMessagesLogged = "PlayerMessagesLogged",
    PlayerErrorsRaised = "PlayerErrorsRaised",
    PlayersCreated = "PlayersCreated"
}
export declare type EventTypes = {
    [Events.PlayerPropertiesChanged]: Protocol.Media.PlayerPropertiesChangedEvent;
    [Events.PlayerEventsAdded]: Protocol.Media.PlayerEventsAddedEvent;
    [Events.PlayerMessagesLogged]: Protocol.Media.PlayerMessagesLoggedEvent;
    [Events.PlayerErrorsRaised]: Protocol.Media.PlayerErrorsRaisedEvent;
    [Events.PlayersCreated]: Protocol.Media.PlayerId[];
};
export declare class MediaModel extends SDK.SDKModel.SDKModel<EventTypes> implements ProtocolProxyApi.MediaDispatcher {
    private enabled;
    private readonly agent;
    constructor(target: SDK.Target.Target);
    resumeModel(): Promise<void>;
    ensureEnabled(): void;
    playerPropertiesChanged(event: Protocol.Media.PlayerPropertiesChangedEvent): void;
    playerEventsAdded(event: Protocol.Media.PlayerEventsAddedEvent): void;
    playerMessagesLogged(event: Protocol.Media.PlayerMessagesLoggedEvent): void;
    playerErrorsRaised(event: Protocol.Media.PlayerErrorsRaisedEvent): void;
    playersCreated({ players }: Protocol.Media.PlayersCreatedEvent): void;
}
