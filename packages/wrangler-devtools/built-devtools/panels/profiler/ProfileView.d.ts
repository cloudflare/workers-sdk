import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { BottomUpProfileDataGridTree } from './BottomUpProfileDataGrid.js';
import type { ProfileFlameChartDataProvider } from './CPUProfileFlameChart.js';
import { CPUProfileFlameChart } from './CPUProfileFlameChart.js';
import type { Formatter } from './ProfileDataGrid.js';
import { ProfileDataGridTree } from './ProfileDataGrid.js';
import type { DataDisplayDelegate, ProfileType } from './ProfileHeader.js';
import { ProfileHeader } from './ProfileHeader.js';
import { ProfileSidebarTreeElement } from './ProfileSidebarTreeElement.js';
import { TopDownProfileDataGridTree } from './TopDownProfileDataGrid.js';
export declare class ProfileView extends UI.View.SimpleView implements UI.SearchableView.Searchable {
    profileInternal: SDK.ProfileTreeModel.ProfileTreeModel | null;
    searchableViewInternal: UI.SearchableView.SearchableView;
    dataGrid: DataGrid.DataGrid.DataGridImpl<unknown>;
    viewSelectComboBox: UI.Toolbar.ToolbarComboBox;
    focusButton: UI.Toolbar.ToolbarButton;
    excludeButton: UI.Toolbar.ToolbarButton;
    resetButton: UI.Toolbar.ToolbarButton;
    readonly linkifierInternal: Components.Linkifier.Linkifier;
    nodeFormatter: Formatter;
    viewType: Common.Settings.Setting<ViewTypes>;
    adjustedTotal: number;
    profileHeader: WritableProfileHeader;
    bottomUpProfileDataGridTree?: BottomUpProfileDataGridTree | null;
    topDownProfileDataGridTree?: TopDownProfileDataGridTree | null;
    currentSearchResultIndex?: number;
    dataProvider?: ProfileFlameChartDataProvider;
    flameChart?: CPUProfileFlameChart;
    visibleView?: CPUProfileFlameChart | DataGrid.DataGrid.DataGridWidget<unknown>;
    searchableElement?: ProfileDataGridTree | CPUProfileFlameChart;
    profileDataGridTree?: ProfileDataGridTree;
    constructor();
    static buildPopoverTable(entryInfo: {
        title: string;
        value: string;
    }[]): Element;
    setProfile(profile: SDK.ProfileTreeModel.ProfileTreeModel): void;
    profile(): SDK.ProfileTreeModel.ProfileTreeModel | null;
    initialize(nodeFormatter: Formatter): void;
    focus(): void;
    columnHeader(_columnId: string): Common.UIString.LocalizedString;
    selectRange(timeLeft: number, timeRight: number): void;
    toolbarItems(): Promise<UI.Toolbar.ToolbarItem[]>;
    getBottomUpProfileDataGridTree(): ProfileDataGridTree;
    getTopDownProfileDataGridTree(): ProfileDataGridTree;
    populateContextMenu(contextMenu: UI.ContextMenu.ContextMenu, gridNode: DataGrid.DataGrid.DataGridNode<unknown>): void;
    willHide(): void;
    refresh(): void;
    refreshVisibleData(): void;
    searchableView(): UI.SearchableView.SearchableView;
    supportsCaseSensitiveSearch(): boolean;
    supportsRegexSearch(): boolean;
    searchCanceled(): void;
    performSearch(searchConfig: UI.SearchableView.SearchConfig, shouldJump: boolean, jumpBackwards?: boolean): void;
    jumpToNextSearchResult(): void;
    jumpToPreviousSearchResult(): void;
    linkifier(): Components.Linkifier.Linkifier;
    createFlameChartDataProvider(): ProfileFlameChartDataProvider;
    ensureFlameChartCreated(): void;
    onEntryInvoked(event: Common.EventTarget.EventTargetEvent<number>): Promise<void>;
    changeView(): void;
    nodeSelected(selected: boolean): void;
    focusClicked(): void;
    excludeClicked(): void;
    resetClicked(): void;
    sortProfile(): void;
}
export declare const maxLinkLength = 30;
export declare const enum ViewTypes {
    Flame = "Flame",
    Tree = "Tree",
    Heavy = "Heavy"
}
export declare class WritableProfileHeader extends ProfileHeader implements Common.StringOutputStream.OutputStream {
    readonly debuggerModel: SDK.DebuggerModel.DebuggerModel | null;
    fileName?: Platform.DevToolsPath.RawPathString;
    jsonifiedProfile?: string | null;
    profile?: Protocol.Profiler.Profile;
    protocolProfileInternal?: Protocol.Profiler.Profile;
    constructor(debuggerModel: SDK.DebuggerModel.DebuggerModel | null, type: ProfileType, title?: string);
    onChunkTransferred(_reader: Bindings.FileUtils.ChunkedReader): void;
    onError(reader: Bindings.FileUtils.ChunkedReader): void;
    write(text: string): Promise<void>;
    close(): Promise<void>;
    dispose(): void;
    createSidebarTreeElement(panel: DataDisplayDelegate): ProfileSidebarTreeElement;
    canSaveToFile(): boolean;
    saveToFile(): Promise<void>;
    loadFromFile(file: File): Promise<Error | null>;
    setProtocolProfile(profile: Protocol.Profiler.Profile): void;
}
