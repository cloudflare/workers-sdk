import type * as Platform from '../../core/platform/platform.js';
import type * as Protocol from '../../generated/protocol.js';
import { ApplicationPanelTreeElement } from './ApplicationPanelTreeElement.js';
import type { ResourcesPanel } from './ResourcesPanel.js';
export declare const i18nString: (id: string, values?: import("../../core/i18n/i18nTypes.js").Values | undefined) => Platform.UIString.LocalizedString;
export declare class InterestGroupTreeElement extends ApplicationPanelTreeElement {
    private view;
    constructor(storagePanel: ResourcesPanel);
    get itemURL(): Platform.DevToolsPath.UrlString;
    getInterestGroupDetails(owner: string, name: string): Promise<Protocol.Storage.InterestGroupDetails | null>;
    onselect(selectedByUser?: boolean): boolean;
    addEvent(event: Protocol.Storage.InterestGroupAccessedEvent): void;
    clearEvents(): void;
}
