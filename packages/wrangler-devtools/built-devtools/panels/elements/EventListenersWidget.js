// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as EventListeners from '../event_listeners/event_listeners.js';
const UIStrings = {
    /**
    *@description Title of show framework listeners setting in event listeners widget of the elements panel
    */
    frameworkListeners: '`Framework` listeners',
    /**
    *@description Text to refresh the page
    */
    refresh: 'Refresh',
    /**
    *@description Tooltip text that appears on the setting when hovering over it in Event Listeners Widget of the Elements panel
    */
    showListenersOnTheAncestors: 'Show listeners on the ancestors',
    /**
    *@description Alternative title text of a setting in Event Listeners Widget of the Elements panel
    */
    ancestors: 'Ancestors',
    /**
    *@description Title of dispatch filter in event listeners widget of the elements panel
    */
    eventListenersCategory: 'Event listeners category',
    /**
    *@description Text for everything
    */
    all: 'All',
    /**
    *@description Text in Event Listeners Widget of the Elements panel
    */
    passive: 'Passive',
    /**
    *@description Text in Event Listeners Widget of the Elements panel
    */
    blocking: 'Blocking',
    /**
    *@description Tooltip text that appears on the setting when hovering over it in Event Listeners Widget of the Elements panel
    */
    resolveEventListenersBoundWith: 'Resolve event listeners bound with framework',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/EventListenersWidget.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let eventListenersWidgetInstance;
export class EventListenersWidget extends UI.ThrottledWidget.ThrottledWidget {
    toolbarItemsInternal;
    showForAncestorsSetting;
    dispatchFilterBySetting;
    showFrameworkListenersSetting;
    eventListenersView;
    lastRequestedNode;
    constructor() {
        super();
        this.toolbarItemsInternal = [];
        this.showForAncestorsSetting = Common.Settings.Settings.instance().moduleSetting('showEventListenersForAncestors');
        this.showForAncestorsSetting.addChangeListener(this.update.bind(this));
        this.dispatchFilterBySetting =
            Common.Settings.Settings.instance().createSetting('eventListenerDispatchFilterType', DispatchFilterBy.All);
        this.dispatchFilterBySetting.addChangeListener(this.update.bind(this));
        this.showFrameworkListenersSetting =
            Common.Settings.Settings.instance().createSetting('showFrameowkrListeners', true);
        this.showFrameworkListenersSetting.setTitle(i18nString(UIStrings.frameworkListeners));
        this.showFrameworkListenersSetting.addChangeListener(this.showFrameworkListenersChanged.bind(this));
        this.eventListenersView = new EventListeners.EventListenersView.EventListenersView(this.update.bind(this));
        this.eventListenersView.show(this.element);
        const refreshButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.refresh), 'largeicon-refresh');
        refreshButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.update.bind(this));
        this.toolbarItemsInternal.push(refreshButton);
        this.toolbarItemsInternal.push(new UI.Toolbar.ToolbarSettingCheckbox(this.showForAncestorsSetting, i18nString(UIStrings.showListenersOnTheAncestors), i18nString(UIStrings.ancestors)));
        const dispatchFilter = new UI.Toolbar.ToolbarComboBox(this.onDispatchFilterTypeChanged.bind(this), i18nString(UIStrings.eventListenersCategory));
        function addDispatchFilterOption(name, value) {
            const option = dispatchFilter.createOption(name, value);
            if (value === this.dispatchFilterBySetting.get()) {
                dispatchFilter.select(option);
            }
        }
        addDispatchFilterOption.call(this, i18nString(UIStrings.all), DispatchFilterBy.All);
        addDispatchFilterOption.call(this, i18nString(UIStrings.passive), DispatchFilterBy.Passive);
        addDispatchFilterOption.call(this, i18nString(UIStrings.blocking), DispatchFilterBy.Blocking);
        dispatchFilter.setMaxWidth(200);
        this.toolbarItemsInternal.push(dispatchFilter);
        this.toolbarItemsInternal.push(new UI.Toolbar.ToolbarSettingCheckbox(this.showFrameworkListenersSetting, i18nString(UIStrings.resolveEventListenersBoundWith)));
        UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.update, this);
        this.update();
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!eventListenersWidgetInstance || forceNew) {
            eventListenersWidgetInstance = new EventListenersWidget();
        }
        return eventListenersWidgetInstance;
    }
    doUpdate() {
        if (this.lastRequestedNode) {
            this.lastRequestedNode.domModel().runtimeModel().releaseObjectGroup(objectGroupName);
            delete this.lastRequestedNode;
        }
        const node = UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode);
        if (!node) {
            this.eventListenersView.reset();
            this.eventListenersView.addEmptyHolderIfNeeded();
            return Promise.resolve();
        }
        this.lastRequestedNode = node;
        const selectedNodeOnly = !this.showForAncestorsSetting.get();
        const promises = [];
        promises.push(node.resolveToObject(objectGroupName));
        if (!selectedNodeOnly) {
            let currentNode = node.parentNode;
            while (currentNode) {
                promises.push(currentNode.resolveToObject(objectGroupName));
                currentNode = currentNode.parentNode;
            }
            promises.push(this.windowObjectInNodeContext(node));
        }
        return Promise.all(promises)
            .then(this.eventListenersView.addObjects.bind(this.eventListenersView))
            .then(this.showFrameworkListenersChanged.bind(this));
    }
    toolbarItems() {
        return this.toolbarItemsInternal;
    }
    onDispatchFilterTypeChanged(event) {
        const filter = event.target;
        this.dispatchFilterBySetting.set(filter.value);
    }
    showFrameworkListenersChanged() {
        const dispatchFilter = this.dispatchFilterBySetting.get();
        const showPassive = dispatchFilter === DispatchFilterBy.All || dispatchFilter === DispatchFilterBy.Passive;
        const showBlocking = dispatchFilter === DispatchFilterBy.All || dispatchFilter === DispatchFilterBy.Blocking;
        this.eventListenersView.showFrameworkListeners(this.showFrameworkListenersSetting.get(), showPassive, showBlocking);
    }
    windowObjectInNodeContext(node) {
        const executionContexts = node.domModel().runtimeModel().executionContexts();
        let context = executionContexts[0];
        if (node.frameId()) {
            for (let i = 0; i < executionContexts.length; ++i) {
                const executionContext = executionContexts[i];
                if (executionContext.frameId === node.frameId() && executionContext.isDefault) {
                    context = executionContext;
                }
            }
        }
        return context
            .evaluate({
            expression: 'self',
            objectGroup: objectGroupName,
            includeCommandLineAPI: false,
            silent: true,
            returnByValue: false,
            generatePreview: false,
            throwOnSideEffect: undefined,
            timeout: undefined,
            disableBreaks: undefined,
            replMode: undefined,
            allowUnsafeEvalBlockedByCSP: undefined,
        }, 
        /* userGesture */ false, 
        /* awaitPromise */ false)
            .then(result => {
            if ('object' in result) {
                return result.object;
            }
            return null;
        });
    }
    eventListenersArrivedForTest() {
    }
}
export const DispatchFilterBy = {
    All: 'All',
    Blocking: 'Blocking',
    Passive: 'Passive',
};
const objectGroupName = 'event-listeners-panel';
//# sourceMappingURL=EventListenersWidget.js.map