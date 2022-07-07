import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import { CSSQuery } from './CSSQuery.js';
import type { DOMNode } from './DOMModel.js';
export declare class CSSContainerQuery extends CSSQuery {
    name?: string;
    static parseContainerQueriesPayload(cssModel: CSSModel, payload: Protocol.CSS.CSSContainerQuery[]): CSSContainerQuery[];
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSContainerQuery);
    reinitialize(payload: Protocol.CSS.CSSContainerQuery): void;
    active(): boolean;
    getContainerForNode(nodeId: Protocol.DOM.NodeId): Promise<CSSContainerQueryContainer | undefined>;
}
export declare class CSSContainerQueryContainer {
    readonly containerNode: DOMNode;
    constructor(containerNode: DOMNode);
    getContainerSizeDetails(): Promise<ContainerQueriedSizeDetails | undefined>;
}
export declare const getQueryAxis: (propertyValue: string) => QueryAxis;
export declare const getPhysicalAxisFromQueryAxis: (queryAxis: QueryAxis, writingMode: string) => PhysicalAxis;
export interface ContainerQueriedSizeDetails {
    queryAxis: QueryAxis;
    physicalAxis: PhysicalAxis;
    width?: string;
    height?: string;
}
export declare const enum QueryAxis {
    None = "",
    Inline = "inline-size",
    Block = "block-size",
    Both = "size"
}
export declare const enum PhysicalAxis {
    None = "",
    Horizontal = "Horizontal",
    Vertical = "Vertical",
    Both = "Both"
}
