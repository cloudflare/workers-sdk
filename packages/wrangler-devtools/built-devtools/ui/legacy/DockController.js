/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import { ToolbarButton } from './Toolbar.js';
const UIStrings = {
    /**
    *@description Text to close something
    */
    close: 'Close',
    /**
    *@description Text to dock the DevTools to the right of the browser tab
    */
    dockToRight: 'Dock to right',
    /**
    *@description Text to dock the DevTools to the bottom of the browser tab
    */
    dockToBottom: 'Dock to bottom',
    /**
    *@description Text to dock the DevTools to the left of the browser tab
    */
    dockToLeft: 'Dock to left',
    /**
    *@description Text to undock the DevTools
    */
    undockIntoSeparateWindow: 'Undock into separate window',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/DockController.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let dockControllerInstance;
export class DockController extends Common.ObjectWrapper.ObjectWrapper {
    canDockInternal;
    closeButton;
    currentDockStateSetting;
    lastDockStateSetting;
    dockSideInternal = undefined;
    titles;
    savedFocus;
    constructor(canDock) {
        super();
        this.canDockInternal = canDock;
        this.closeButton = new ToolbarButton(i18nString(UIStrings.close), 'largeicon-delete');
        this.closeButton.element.classList.add('close-devtools');
        this.closeButton.addEventListener(ToolbarButton.Events.Click, Host.InspectorFrontendHost.InspectorFrontendHostInstance.closeWindow.bind(Host.InspectorFrontendHost.InspectorFrontendHostInstance));
        this.currentDockStateSetting = Common.Settings.Settings.instance().moduleSetting('currentDockState');
        this.lastDockStateSetting = Common.Settings.Settings.instance().createSetting('lastDockState', "bottom" /* BOTTOM */);
        if (!canDock) {
            this.dockSideInternal = "undocked" /* UNDOCKED */;
            this.closeButton.setVisible(false);
            return;
        }
        this.currentDockStateSetting.addChangeListener(this.dockSideChanged, this);
        if (states.indexOf(this.currentDockStateSetting.get()) === -1) {
            this.currentDockStateSetting.set("right" /* RIGHT */);
        }
        if (states.indexOf(this.lastDockStateSetting.get()) === -1) {
            this.currentDockStateSetting.set("bottom" /* BOTTOM */);
        }
    }
    static instance(opts = { forceNew: null, canDock: false }) {
        const { forceNew, canDock } = opts;
        if (!dockControllerInstance || forceNew) {
            dockControllerInstance = new DockController(canDock);
        }
        return dockControllerInstance;
    }
    initialize() {
        if (!this.canDockInternal) {
            return;
        }
        this.titles = [
            i18nString(UIStrings.dockToRight),
            i18nString(UIStrings.dockToBottom),
            i18nString(UIStrings.dockToLeft),
            i18nString(UIStrings.undockIntoSeparateWindow),
        ];
        this.dockSideChanged();
    }
    dockSideChanged() {
        this.setDockSide(this.currentDockStateSetting.get());
    }
    dockSide() {
        return this.dockSideInternal;
    }
    canDock() {
        return this.canDockInternal;
    }
    isVertical() {
        return this.dockSideInternal === "right" /* RIGHT */ || this.dockSideInternal === "left" /* LEFT */;
    }
    setDockSide(dockSide) {
        if (states.indexOf(dockSide) === -1) {
            // If the side is invalid, default to a valid one
            dockSide = states[0];
        }
        if (this.dockSideInternal === dockSide) {
            return;
        }
        if (this.dockSideInternal !== undefined) {
            document.body.classList.remove(this.dockSideInternal);
        }
        document.body.classList.add(dockSide);
        if (this.dockSideInternal) {
            this.lastDockStateSetting.set(this.dockSideInternal);
        }
        this.savedFocus = Platform.DOMUtilities.deepActiveElement(document);
        const eventData = { from: this.dockSideInternal, to: dockSide };
        this.dispatchEventToListeners("BeforeDockSideChanged" /* BeforeDockSideChanged */, eventData);
        console.timeStamp('DockController.setIsDocked');
        this.dockSideInternal = dockSide;
        this.currentDockStateSetting.set(dockSide);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.setIsDocked(dockSide !== "undocked" /* UNDOCKED */, this.setIsDockedResponse.bind(this, eventData));
        this.closeButton.setVisible(this.dockSideInternal !== "undocked" /* UNDOCKED */);
        this.dispatchEventToListeners("DockSideChanged" /* DockSideChanged */, eventData);
    }
    setIsDockedResponse(eventData) {
        this.dispatchEventToListeners("AfterDockSideChanged" /* AfterDockSideChanged */, eventData);
        if (this.savedFocus) {
            this.savedFocus.focus();
            this.savedFocus = null;
        }
    }
    toggleDockSide() {
        if (this.lastDockStateSetting.get() === this.currentDockStateSetting.get()) {
            const index = states.indexOf(this.currentDockStateSetting.get()) || 0;
            this.lastDockStateSetting.set(states[(index + 1) % states.length]);
        }
        this.setDockSide(this.lastDockStateSetting.get());
    }
}
const states = ["right" /* RIGHT */, "bottom" /* BOTTOM */, "left" /* LEFT */, "undocked" /* UNDOCKED */];
let toggleDockActionDelegateInstance;
export class ToggleDockActionDelegate {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!toggleDockActionDelegateInstance || forceNew) {
            toggleDockActionDelegateInstance = new ToggleDockActionDelegate();
        }
        return toggleDockActionDelegateInstance;
    }
    handleAction(_context, _actionId) {
        DockController.instance().toggleDockSide();
        return true;
    }
}
let closeButtonProviderInstance;
export class CloseButtonProvider {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!closeButtonProviderInstance || forceNew) {
            closeButtonProviderInstance = new CloseButtonProvider();
        }
        return closeButtonProviderInstance;
    }
    item() {
        return DockController.instance().closeButton;
    }
}
//# sourceMappingURL=DockController.js.map