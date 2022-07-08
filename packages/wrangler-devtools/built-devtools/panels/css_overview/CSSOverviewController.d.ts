import * as Common from '../../core/common/common.js';
import type * as Protocol from '../../generated/protocol.js';
import type { ContrastIssue } from './CSSOverviewCompletedView.js';
import type { UnusedDeclaration } from './CSSOverviewUnusedDeclarations.js';
export declare class OverviewController extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    currentUrl: string;
    constructor();
}
export declare type PopulateNodesEvent = {
    type: 'contrast';
    key: string;
    section: string | undefined;
    nodes: ContrastIssue[];
} | {
    type: 'color';
    color: string;
    section: string | undefined;
    nodes: {
        nodeId: Protocol.DOM.BackendNodeId;
    }[];
} | {
    type: 'unused-declarations';
    declaration: string;
    nodes: UnusedDeclaration[];
} | {
    type: 'media-queries';
    text: string;
    nodes: Protocol.CSS.CSSMedia[];
} | {
    type: 'font-info';
    name: string;
    nodes: {
        nodeId: Protocol.DOM.BackendNodeId;
    }[];
};
export declare type PopulateNodesEventNodes = PopulateNodesEvent['nodes'];
export declare type PopulateNodesEventNodeTypes = PopulateNodesEventNodes[0];
export declare const enum Events {
    RequestOverviewStart = "RequestOverviewStart",
    RequestNodeHighlight = "RequestNodeHighlight",
    PopulateNodes = "PopulateNodes",
    RequestOverviewCancel = "RequestOverviewCancel",
    OverviewCompleted = "OverviewCompleted",
    Reset = "Reset"
}
export declare type EventTypes = {
    [Events.RequestOverviewStart]: void;
    [Events.RequestNodeHighlight]: number;
    [Events.PopulateNodes]: {
        payload: PopulateNodesEvent;
    };
    [Events.RequestOverviewCancel]: void;
    [Events.OverviewCompleted]: void;
    [Events.Reset]: void;
};
