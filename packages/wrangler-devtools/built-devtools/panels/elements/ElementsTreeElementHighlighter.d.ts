import { ElementsTreeOutline } from './ElementsTreeOutline.js';
export declare class ElementsTreeElementHighlighter {
    private readonly throttler;
    private treeOutline;
    private currentHighlightedElement;
    private alreadyExpandedParentElement;
    private pendingHighlightNode;
    private isModifyingTreeOutline;
    constructor(treeOutline: ElementsTreeOutline);
    private highlightNode;
    private highlightNodeInternal;
    private clearState;
}
