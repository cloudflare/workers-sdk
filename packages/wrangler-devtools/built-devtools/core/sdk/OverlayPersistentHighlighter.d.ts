import * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
export declare class OverlayPersistentHighlighter {
    #private;
    constructor(model: OverlayModel, flexEnabled?: boolean);
    private onSettingChange;
    private buildGridHighlightConfig;
    private buildFlexContainerHighlightConfig;
    private buildScrollSnapContainerHighlightConfig;
    highlightGridInOverlay(nodeId: Protocol.DOM.NodeId): void;
    isGridHighlighted(nodeId: Protocol.DOM.NodeId): boolean;
    colorOfGrid(nodeId: Protocol.DOM.NodeId): Common.Color.Color;
    setColorOfGrid(nodeId: Protocol.DOM.NodeId, color: Common.Color.Color): void;
    hideGridInOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightScrollSnapInOverlay(nodeId: Protocol.DOM.NodeId): void;
    isScrollSnapHighlighted(nodeId: Protocol.DOM.NodeId): boolean;
    hideScrollSnapInOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightFlexInOverlay(nodeId: Protocol.DOM.NodeId): void;
    isFlexHighlighted(nodeId: Protocol.DOM.NodeId): boolean;
    colorOfFlex(nodeId: Protocol.DOM.NodeId): Common.Color.Color;
    setColorOfFlex(nodeId: Protocol.DOM.NodeId, color: Common.Color.Color): void;
    hideFlexInOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightContainerQueryInOverlay(nodeId: Protocol.DOM.NodeId): void;
    hideContainerQueryInOverlay(nodeId: Protocol.DOM.NodeId): void;
    isContainerQueryHighlighted(nodeId: Protocol.DOM.NodeId): boolean;
    private buildContainerQueryContainerHighlightConfig;
    highlightIsolatedElementInOverlay(nodeId: Protocol.DOM.NodeId): void;
    hideIsolatedElementInOverlay(nodeId: Protocol.DOM.NodeId): void;
    isIsolatedElementHighlighted(nodeId: Protocol.DOM.NodeId): boolean;
    private buildIsolationModeHighlightConfig;
    hideAllInOverlay(): void;
    refreshHighlights(): void;
    private updateHighlightsForDeletedNodes;
    resetOverlay(): void;
    private updateHighlightsInOverlay;
    private updateGridHighlightsInOverlay;
    private updateFlexHighlightsInOverlay;
    private updateScrollSnapHighlightsInOverlay;
    updateContainerQueryHighlightsInOverlay(): void;
    updateIsolatedElementHighlightsInOverlay(): void;
}
export interface DOMModel {
    nodeForId(nodeId: Protocol.DOM.NodeId): void;
}
export interface OverlayAgent {
    invoke_setShowGridOverlays(param: {
        gridNodeHighlightConfigs: Array<{
            nodeId: number;
            gridHighlightConfig: Protocol.Overlay.GridHighlightConfig;
        }>;
    }): void;
    invoke_setShowFlexOverlays(param: {
        flexNodeHighlightConfigs: Array<{
            nodeId: number;
            flexContainerHighlightConfig: Protocol.Overlay.FlexContainerHighlightConfig;
        }>;
    }): void;
    invoke_setShowScrollSnapOverlays(param: {
        scrollSnapHighlightConfigs: Array<{
            nodeId: number;
        }>;
    }): void;
    invoke_setShowContainerQueryOverlays(param: {
        containerQueryHighlightConfigs: Array<{
            nodeId: number;
            containerQueryContainerHighlightConfig: Protocol.Overlay.ContainerQueryContainerHighlightConfig;
        }>;
    }): void;
    invoke_setShowIsolatedElements(param: {
        isolatedElementHighlightConfigs: Array<{
            nodeId: number;
            isolationModeHighlightConfig: Protocol.Overlay.IsolationModeHighlightConfig;
        }>;
    }): void;
}
export interface Target {
    overlayAgent(): OverlayAgent;
}
export interface OverlayModel {
    getDOMModel(): DOMModel;
    target(): Target;
    setShowViewportSizeOnResize(value: boolean): void;
}
