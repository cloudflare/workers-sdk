import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
export declare class PlayerMessagesView extends UI.Widget.VBox {
    private readonly headerPanel;
    private readonly bodyPanel;
    private messageLevelSelector?;
    constructor();
    private buildToolbar;
    private createDropdown;
    private createFilterInput;
    regenerateMessageDisplayCss(hiddenLevels: string[]): void;
    private matchesHiddenLevels;
    private filterByString;
    addMessage(message: Protocol.Media.PlayerMessage): void;
    wasShown(): void;
}
