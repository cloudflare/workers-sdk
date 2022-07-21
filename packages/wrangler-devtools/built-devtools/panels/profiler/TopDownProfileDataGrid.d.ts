import type * as SDK from '../../core/sdk/sdk.js';
import type * as UI from '../../ui/legacy/legacy.js';
import type { Formatter } from './ProfileDataGrid.js';
import { ProfileDataGridNode, ProfileDataGridTree } from './ProfileDataGrid.js';
export declare class TopDownProfileDataGridNode extends ProfileDataGridNode {
    remainingChildren: SDK.ProfileTreeModel.ProfileNode[];
    constructor(profileNode: SDK.ProfileTreeModel.ProfileNode, owningTree: TopDownProfileDataGridTree);
    static sharedPopulate(container: TopDownProfileDataGridTree | TopDownProfileDataGridNode): void;
    static excludeRecursively(container: TopDownProfileDataGridTree | TopDownProfileDataGridNode, aCallUID: string): void;
    populateChildren(): void;
}
export declare class TopDownProfileDataGridTree extends ProfileDataGridTree {
    remainingChildren: SDK.ProfileTreeModel.ProfileNode[];
    constructor(formatter: Formatter, searchableView: UI.SearchableView.SearchableView, rootProfileNode: SDK.ProfileTreeModel.ProfileNode, total: number);
    focus(profileDataGridNode: ProfileDataGridNode): void;
    exclude(profileDataGridNode: ProfileDataGridNode): void;
    restore(): void;
    populateChildren(): void;
}
