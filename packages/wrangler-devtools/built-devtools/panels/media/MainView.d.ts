import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
import type { PlayerEvent } from './MediaModel.js';
import { MediaModel } from './MediaModel.js';
export interface TriggerHandler {
    onProperty(property: Protocol.Media.PlayerProperty): void;
    onError(error: Protocol.Media.PlayerError): void;
    onMessage(message: Protocol.Media.PlayerMessage): void;
    onEvent(event: PlayerEvent): void;
}
export interface TriggerDispatcher {
    onProperty(playerID: string, property: Protocol.Media.PlayerProperty): void;
    onError(playerID: string, error: Protocol.Media.PlayerError): void;
    onMessage(playerID: string, message: Protocol.Media.PlayerMessage): void;
    onEvent(playerID: string, event: PlayerEvent): void;
}
export declare class MainView extends UI.Panel.PanelWithSidebar implements SDK.TargetManager.SDKModelObserver<MediaModel> {
    private detailPanels;
    private deletedPlayers;
    private readonly downloadStore;
    private readonly sidebar;
    constructor();
    static instance(opts?: {
        forceNew: null;
    }): MainView;
    renderMainPanel(playerID: string): void;
    wasShown(): void;
    willHide(): void;
    modelAdded(model: MediaModel): void;
    modelRemoved(model: MediaModel): void;
    private addEventListeners;
    private removeEventListeners;
    private onPlayerCreated;
    private propertiesChanged;
    private eventsAdded;
    private messagesLogged;
    private errorsRaised;
    private shouldPropagate;
    onProperty(playerID: string, property: Protocol.Media.PlayerProperty): void;
    onError(playerID: string, error: Protocol.Media.PlayerError): void;
    onMessage(playerID: string, message: Protocol.Media.PlayerMessage): void;
    onEvent(playerID: string, event: PlayerEvent): void;
    private playersCreated;
    markPlayerForDeletion(playerID: string): void;
    markOtherPlayersForDeletion(playerID: string): void;
    exportPlayerData(playerID: string): void;
}
