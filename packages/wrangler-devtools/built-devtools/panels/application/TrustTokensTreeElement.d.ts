import type * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ApplicationPanelTreeElement } from './ApplicationPanelTreeElement.js';
import type { ResourcesPanel } from './ResourcesPanel.js';
export declare const i18nString: (id: string, values?: import("../../core/i18n/i18nTypes.js").Values | undefined) => Platform.UIString.LocalizedString;
export declare class TrustTokensTreeElement extends ApplicationPanelTreeElement {
    private view?;
    constructor(storagePanel: ResourcesPanel);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
}
export declare class TrustTokensViewWidgetWrapper extends UI.ThrottledWidget.ThrottledWidget {
    private readonly trustTokensView;
    constructor();
    protected doUpdate(): Promise<void>;
}
