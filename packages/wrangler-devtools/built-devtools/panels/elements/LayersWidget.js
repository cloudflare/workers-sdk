// Copyright (c) 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as TreeOutline from '../../ui/components/tree_outline/tree_outline.js';
import { ElementsPanel } from './ElementsPanel.js';
import layersWidgetStyles from './layersWidget.css.js';
import * as IconButton from '../../ui/components/icon_button/icon_button.js';
const UIStrings = {
    /**
    * @description Title of a section in the Element State Pane Widget of the Elements panel.
    * The widget shows the layers present in the context of the currently selected node.
    * */
    cssLayersTitle: 'CSS layers',
    /**
    * @description Tooltip text in Element State Pane Widget of the Elements panel.
    * For a button that opens a tool that shows the layers present in the current document.
    */
    toggleCSSLayers: 'Toggle CSS Layers view',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/LayersWidget.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let layersWidgetInstance;
export class LayersWidget extends UI.Widget.Widget {
    cssModel;
    layerTreeComponent = new TreeOutline.TreeOutline.TreeOutline();
    constructor() {
        super(true);
        this.contentElement.className = 'styles-layers-pane';
        UI.UIUtils.createTextChild(this.contentElement.createChild('div'), i18nString(UIStrings.cssLayersTitle));
        this.contentElement.appendChild(this.layerTreeComponent);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.update, this);
    }
    updateModel(cssModel) {
        if (this.cssModel === cssModel) {
            return;
        }
        if (this.cssModel) {
            this.cssModel.removeEventListener(SDK.CSSModel.Events.StyleSheetChanged, this.update, this);
        }
        this.cssModel = cssModel;
        if (this.cssModel) {
            this.cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetChanged, this.update, this);
        }
    }
    async wasShown() {
        super.wasShown();
        this.registerCSSFiles([layersWidgetStyles]);
        return this.update();
    }
    async update() {
        if (!this.isShowing()) {
            return;
        }
        let node = UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode);
        if (node) {
            node = node.enclosingElementOrSelf();
        }
        if (!node) {
            // do something meaningful?
            return;
        }
        this.updateModel(node.domModel().cssModel());
        if (!this.cssModel) {
            return;
        }
        const makeTreeNode = (parentId) => (layer) => {
            const subLayers = layer.subLayers;
            const name = SDK.CSSModel.CSSModel.readableLayerName(layer.name);
            const treeNodeData = layer.order + ': ' + name;
            const id = parentId ? parentId + '.' + name : name;
            if (!subLayers) {
                return { treeNodeData, id };
            }
            return {
                treeNodeData,
                id,
                children: () => Promise.resolve(subLayers.sort((layer1, layer2) => layer1.order - layer2.order).map(makeTreeNode(id))),
            };
        };
        const rootLayer = await this.cssModel.getRootLayer(node.id);
        this.layerTreeComponent.data = {
            defaultRenderer: TreeOutline.TreeOutline.defaultRenderer,
            tree: [makeTreeNode('')(rootLayer)],
        };
        // We only expand the first 5 user-defined layers to not make the
        // view too overwhelming.
        await this.layerTreeComponent.expandRecursively(5);
    }
    async revealLayer(layerName) {
        if (!this.isShowing()) {
            ElementsPanel.instance().showToolbarPane(this, ButtonProvider.instance().item());
        }
        await this.update();
        return this.layerTreeComponent.expandToAndSelectTreeNodeId('implicit outer layer.' + layerName);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!layersWidgetInstance || forceNew) {
            layersWidgetInstance = new LayersWidget();
        }
        return layersWidgetInstance;
    }
}
let buttonProviderInstance;
export class ButtonProvider {
    button;
    constructor() {
        const layersIcon = new IconButton.Icon.Icon();
        layersIcon.data = {
            iconName: 'ic_layers_16x16',
            color: 'var(--color-text-secondary)',
            width: '13px',
            height: '13px',
        };
        this.button = new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.toggleCSSLayers), layersIcon);
        this.button.setVisible(false);
        this.button.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.clicked, this);
        this.button.element.classList.add('monospace');
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!buttonProviderInstance || forceNew) {
            buttonProviderInstance = new ButtonProvider();
        }
        return buttonProviderInstance;
    }
    clicked() {
        const view = LayersWidget.instance();
        ElementsPanel.instance().showToolbarPane(!view.isShowing() ? view : null, this.button);
    }
    item() {
        return this.button;
    }
}
//# sourceMappingURL=LayersWidget.js.map