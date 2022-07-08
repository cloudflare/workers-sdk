import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ElementsTreeOutline from './ElementsTreeOutline.js';
import type { ElementsTreeElement } from './ElementsTreeElement.js';
export declare class TopLayerContainer extends UI.TreeOutline.TreeElement {
    treeOutline: ElementsTreeOutline.ElementsTreeOutline | null;
    domModel: SDK.DOMModel.DOMModel;
    currentTopLayerElements: Set<ElementsTreeElement>;
    bodyElement: ElementsTreeElement;
    constructor(bodyElement: ElementsTreeElement);
    updateBody(bodyElement: ElementsTreeElement): void;
    addTopLayerElementsAsChildren(): Promise<boolean>;
    private removeCurrentTopLayerElementsAdorners;
    private addTopLayerAdorner;
}
