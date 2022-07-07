// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { SplitWidget } from './SplitWidget.js';
import { VBox } from './Widget.js';
export class Panel extends VBox {
    panelName;
    constructor(name) {
        super();
        this.element.classList.add('panel');
        this.element.setAttribute('aria-label', name);
        this.element.classList.add(name);
        this.panelName = name;
        // @ts-ignore: Legacy global. Requires rewriting tests to get rid of.
        // For testing.
        UI.panels[name] = this;
    }
    get name() {
        return this.panelName;
    }
    searchableView() {
        return null;
    }
    elementsToRestoreScrollPositionsFor() {
        return [];
    }
}
export class PanelWithSidebar extends Panel {
    panelSplitWidget;
    mainWidget;
    sidebarWidget;
    constructor(name, defaultWidth) {
        super(name);
        this.panelSplitWidget = new SplitWidget(true, false, this.panelName + 'PanelSplitViewState', defaultWidth || 200);
        this.panelSplitWidget.show(this.element);
        this.mainWidget = new VBox();
        this.panelSplitWidget.setMainWidget(this.mainWidget);
        this.sidebarWidget = new VBox();
        this.sidebarWidget.setMinimumSize(100, 25);
        this.panelSplitWidget.setSidebarWidget(this.sidebarWidget);
        this.sidebarWidget.element.classList.add('panel-sidebar');
    }
    panelSidebarElement() {
        return this.sidebarWidget.element;
    }
    mainElement() {
        return this.mainWidget.element;
    }
    splitWidget() {
        return this.panelSplitWidget;
    }
}
//# sourceMappingURL=Panel.js.map