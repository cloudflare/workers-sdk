import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
import type { MainView, TriggerDispatcher } from './MainView.js';
import type { PlayerEvent } from './MediaModel.js';
export interface PlayerStatus {
    playerTitle: string;
    playerID: string;
    exists: boolean;
    playing: boolean;
    titleEdited: boolean;
}
export interface PlayerStatusMapElement {
    playerStatus: PlayerStatus;
    playerTitleElement: HTMLElement | null;
}
export declare class PlayerListView extends UI.Widget.VBox implements TriggerDispatcher {
    private readonly playerEntryFragments;
    private readonly playerEntriesWithHostnameFrameTitle;
    private readonly mainContainer;
    private currentlySelectedEntry;
    constructor(mainContainer: MainView);
    private createPlayerListEntry;
    private selectPlayer;
    private rightClickPlayer;
    private setMediaElementFrameTitle;
    private setMediaElementPlayerTitle;
    private setMediaElementPlayerIcon;
    private formatAndEvaluate;
    addMediaElementItem(playerID: string): void;
    deletePlayer(playerID: string): void;
    onEvent(playerID: string, event: PlayerEvent): void;
    onProperty(playerID: string, property: Protocol.Media.PlayerProperty): void;
    onError(_playerID: string, _error: Protocol.Media.PlayerError): void;
    onMessage(_playerID: string, _message: Protocol.Media.PlayerMessage): void;
    wasShown(): void;
}
