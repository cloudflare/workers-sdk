import * as SDK from '../../core/sdk/sdk.js';
import { NetworkGroupNode } from './NetworkDataGridNode.js';
import type { GroupLookupInterface, NetworkLogView } from './NetworkLogView.js';
export declare class NetworkFrameGrouper implements GroupLookupInterface {
    private parentView;
    private readonly activeGroups;
    constructor(parentView: NetworkLogView);
    groupNodeForRequest(request: SDK.NetworkRequest.NetworkRequest): NetworkGroupNode | null;
    reset(): void;
}
export declare class FrameGroupNode extends NetworkGroupNode {
    private readonly frame;
    constructor(parentView: NetworkLogView, frame: SDK.ResourceTreeModel.ResourceTreeFrame);
    displayName(): string;
    renderCell(cell: HTMLElement, columnId: string): void;
}
