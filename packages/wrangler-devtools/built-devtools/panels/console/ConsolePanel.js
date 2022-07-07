// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as UI from '../../ui/legacy/legacy.js';
import { ConsoleView } from './ConsoleView.js';
let consolePanelInstance;
export class ConsolePanel extends UI.Panel.Panel {
    view;
    constructor() {
        super('console');
        this.view = ConsoleView.instance();
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!consolePanelInstance || forceNew) {
            consolePanelInstance = new ConsolePanel();
        }
        return consolePanelInstance;
    }
    static updateContextFlavor() {
        const consoleView = ConsolePanel.instance().view;
        UI.Context.Context.instance().setFlavor(ConsoleView, consoleView.isShowing() ? consoleView : null);
    }
    wasShown() {
        super.wasShown();
        const wrapper = wrapperViewInstance;
        if (wrapper && wrapper.isShowing()) {
            UI.InspectorView.InspectorView.instance().setDrawerMinimized(true);
        }
        this.view.show(this.element);
        ConsolePanel.updateContextFlavor();
    }
    willHide() {
        super.willHide();
        // The minimized drawer has 0 height, and showing Console inside may set
        // Console's scrollTop to 0. Unminimize before calling show to avoid this.
        UI.InspectorView.InspectorView.instance().setDrawerMinimized(false);
        if (wrapperViewInstance) {
            wrapperViewInstance.showViewInWrapper();
        }
        ConsolePanel.updateContextFlavor();
    }
    searchableView() {
        return ConsoleView.instance().searchableView();
    }
}
let wrapperViewInstance = null;
export class WrapperView extends UI.Widget.VBox {
    view;
    constructor() {
        super();
        this.view = ConsoleView.instance();
    }
    static instance() {
        if (!wrapperViewInstance) {
            wrapperViewInstance = new WrapperView();
        }
        return wrapperViewInstance;
    }
    wasShown() {
        if (!ConsolePanel.instance().isShowing()) {
            this.showViewInWrapper();
        }
        else {
            UI.InspectorView.InspectorView.instance().setDrawerMinimized(true);
        }
        ConsolePanel.updateContextFlavor();
    }
    willHide() {
        UI.InspectorView.InspectorView.instance().setDrawerMinimized(false);
        ConsolePanel.updateContextFlavor();
    }
    showViewInWrapper() {
        this.view.show(this.element);
    }
}
let consoleRevealerInstance;
export class ConsoleRevealer {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!consoleRevealerInstance || forceNew) {
            consoleRevealerInstance = new ConsoleRevealer();
        }
        return consoleRevealerInstance;
    }
    async reveal(_object) {
        const consoleView = ConsoleView.instance();
        if (consoleView.isShowing()) {
            consoleView.focus();
            return;
        }
        await UI.ViewManager.ViewManager.instance().showView('console-view');
    }
}
//# sourceMappingURL=ConsolePanel.js.map