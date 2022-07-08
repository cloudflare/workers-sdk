import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { ResourcesPanel } from './ResourcesPanel.js';
export declare class ApplicationPanelTreeElement extends UI.TreeOutline.TreeElement {
    protected readonly resourcesPanel: ResourcesPanel;
    constructor(resourcesPanel: ResourcesPanel, title: string, expandable: boolean);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser: boolean | undefined): boolean;
    showView(view: UI.Widget.Widget | null): void;
}
export declare class ExpandableApplicationPanelTreeElement extends ApplicationPanelTreeElement {
    protected readonly expandedSetting: Common.Settings.Setting<boolean>;
    protected readonly categoryName: string;
    protected categoryLink: Platform.DevToolsPath.UrlString | null;
    constructor(resourcesPanel: ResourcesPanel, categoryName: string, settingsKey: string, settingsDefault?: boolean);
    get itemURL(): Platform.DevToolsPath.UrlString;
    setLink(link: Platform.DevToolsPath.UrlString): void;
    onselect(selectedByUser: boolean | undefined): boolean;
    onattach(): void;
    onexpand(): void;
    oncollapse(): void;
}
