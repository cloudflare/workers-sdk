// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as Persistence from '../../models/persistence/persistence.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as UI from '../../ui/legacy/legacy.js';
import callStackSidebarPaneStyles from './callStackSidebarPane.css.js';
const UIStrings = {
    /**
    *@description Text in Call Stack Sidebar Pane of the Sources panel
    */
    callStack: 'Call Stack',
    /**
    *@description Not paused message element text content in Call Stack Sidebar Pane of the Sources panel
    */
    notPaused: 'Not paused',
    /**
    *@description Text exposed to screen reader when navigating through a ignore-listed call frame in the sources panel
    */
    onIgnoreList: 'on ignore list',
    /**
    *@description Show all link text content in Call Stack Sidebar Pane of the Sources panel
    */
    showIgnorelistedFrames: 'Show ignore-listed frames',
    /**
    *@description Text to show more content
    */
    showMore: 'Show more',
    /**
    *@description A context menu item in the Call Stack Sidebar Pane of the Sources panel
    */
    copyStackTrace: 'Copy stack trace',
    /**
    *@description Text to stop preventing the debugger from stepping into library code
    */
    removeFromIgnoreList: 'Remove from ignore list',
    /**
    *@description Text for scripts that should not be stepped into when debugging
    */
    addScriptToIgnoreList: 'Add script to ignore list',
    /**
    *@description A context menu item in the Call Stack Sidebar Pane of the Sources panel
    */
    removeAllContentScriptsFrom: 'Remove all content scripts from ignore list',
    /**
    *@description A context menu item in the Call Stack Sidebar Pane of the Sources panel
    */
    addAllContentScriptsToIgnoreList: 'Add all content scripts to ignore list',
    /**
    *@description Text in Call Stack Sidebar Pane of the Sources panel when some call frames have warnings
    */
    callFrameWarnings: 'Some call frames have warnings',
    /**
    *@description Error message that is displayed in UI when a file needed for debugging information for a call frame is missing
    *@example {src/myapp.debug.wasm.dwp} PH1
    */
    debugFileNotFound: 'Failed to load debug file "{PH1}".',
    /**
     * @description A contex menu item in the Call Stack Sidebar Pane. "Restart" is a verb and
     * "frame" is a noun. "Frame" refers to an individual item in the call stack, i.e. a call frame.
     * The user opens this context menu by selecting a specific call frame in the call stack sidebar pane.
     */
    restartFrame: 'Restart frame',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/CallStackSidebarPane.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let callstackSidebarPaneInstance;
export class CallStackSidebarPane extends UI.View.SimpleView {
    ignoreListMessageElement;
    notPausedMessageElement;
    callFrameWarningsElement;
    items;
    list;
    showMoreMessageElement;
    showIgnoreListed;
    locationPool;
    updateThrottler;
    maxAsyncStackChainDepth;
    updateItemThrottler;
    scheduledForUpdateItems;
    muteActivateItem;
    constructor() {
        super(i18nString(UIStrings.callStack), true);
        this.ignoreListMessageElement = this.createIgnoreListMessageElement();
        this.contentElement.appendChild(this.ignoreListMessageElement);
        this.notPausedMessageElement = this.contentElement.createChild('div', 'gray-info-message');
        this.notPausedMessageElement.textContent = i18nString(UIStrings.notPaused);
        this.notPausedMessageElement.tabIndex = -1;
        this.callFrameWarningsElement = this.contentElement.createChild('div', 'ignore-listed-message');
        const icon = UI.Icon.Icon.create('smallicon-warning', 'call-frame-warning-icon');
        this.callFrameWarningsElement.appendChild(icon);
        this.callFrameWarningsElement.appendChild(document.createTextNode(i18nString(UIStrings.callFrameWarnings)));
        this.callFrameWarningsElement.tabIndex = -1;
        this.items = new UI.ListModel.ListModel();
        this.list = new UI.ListControl.ListControl(this.items, this, UI.ListControl.ListMode.NonViewport);
        this.contentElement.appendChild(this.list.element);
        this.list.element.addEventListener('contextmenu', this.onContextMenu.bind(this), false);
        self.onInvokeElement(this.list.element, event => {
            const item = this.list.itemForNode(event.target);
            if (item) {
                this.activateItem(item);
                event.consume(true);
            }
        });
        this.showMoreMessageElement = this.createShowMoreMessageElement();
        this.showMoreMessageElement.classList.add('hidden');
        this.contentElement.appendChild(this.showMoreMessageElement);
        this.showIgnoreListed = false;
        this.locationPool = new Bindings.LiveLocation.LiveLocationPool();
        this.updateThrottler = new Common.Throttler.Throttler(100);
        this.maxAsyncStackChainDepth = defaultMaxAsyncStackChainDepth;
        this.update();
        this.updateItemThrottler = new Common.Throttler.Throttler(100);
        this.scheduledForUpdateItems = new Set();
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!callstackSidebarPaneInstance || forceNew) {
            callstackSidebarPaneInstance = new CallStackSidebarPane();
        }
        return callstackSidebarPaneInstance;
    }
    flavorChanged(_object) {
        this.showIgnoreListed = false;
        this.maxAsyncStackChainDepth = defaultMaxAsyncStackChainDepth;
        this.update();
    }
    update() {
        void this.updateThrottler.schedule(() => this.doUpdate());
    }
    async doUpdate() {
        this.locationPool.disposeAll();
        this.callFrameWarningsElement.classList.add('hidden');
        const details = UI.Context.Context.instance().flavor(SDK.DebuggerModel.DebuggerPausedDetails);
        if (!details) {
            this.notPausedMessageElement.classList.remove('hidden');
            this.ignoreListMessageElement.classList.add('hidden');
            this.showMoreMessageElement.classList.add('hidden');
            this.items.replaceAll([]);
            UI.Context.Context.instance().setFlavor(SDK.DebuggerModel.CallFrame, null);
            return;
        }
        this.notPausedMessageElement.classList.add('hidden');
        const itemPromises = [];
        const uniqueWarnings = new Set();
        for (const frame of details.callFrames) {
            const itemPromise = Item.createForDebuggerCallFrame(frame, this.locationPool, this.refreshItem.bind(this)).then(item => {
                itemToCallFrame.set(item, frame);
                return item;
            });
            itemPromises.push(itemPromise);
            if (frame.missingDebugInfoDetails) {
                uniqueWarnings.add(frame.missingDebugInfoDetails.details);
            }
        }
        const items = await Promise.all(itemPromises);
        if (uniqueWarnings.size) {
            this.callFrameWarningsElement.classList.remove('hidden');
            UI.Tooltip.Tooltip.install(this.callFrameWarningsElement, Array.from(uniqueWarnings).join('\n'));
        }
        let debuggerModel = details.debuggerModel;
        let asyncStackTraceId = details.asyncStackTraceId;
        let asyncStackTrace = details.asyncStackTrace;
        let previousStackTrace = details.callFrames;
        for (let { maxAsyncStackChainDepth } = this; maxAsyncStackChainDepth > 0; --maxAsyncStackChainDepth) {
            if (!asyncStackTrace) {
                if (!asyncStackTraceId) {
                    break;
                }
                if (asyncStackTraceId.debuggerId) {
                    const dm = await SDK.DebuggerModel.DebuggerModel.modelForDebuggerId(asyncStackTraceId.debuggerId);
                    if (!dm) {
                        break;
                    }
                    debuggerModel = dm;
                }
                asyncStackTrace = await debuggerModel.fetchAsyncStackTrace(asyncStackTraceId);
                if (!asyncStackTrace) {
                    break;
                }
            }
            const title = UI.UIUtils.asyncStackTraceLabel(asyncStackTrace.description, previousStackTrace);
            items.push(...await Item.createItemsForAsyncStack(title, debuggerModel, asyncStackTrace.callFrames, this.locationPool, this.refreshItem.bind(this)));
            previousStackTrace = asyncStackTrace.callFrames;
            asyncStackTraceId = asyncStackTrace.parentId;
            asyncStackTrace = asyncStackTrace.parent;
        }
        this.showMoreMessageElement.classList.toggle('hidden', !asyncStackTrace);
        this.items.replaceAll(items);
        if (this.maxAsyncStackChainDepth === defaultMaxAsyncStackChainDepth) {
            this.list.selectNextItem(true /* canWrap */, false /* center */);
            const selectedItem = this.list.selectedItem();
            if (selectedItem) {
                this.activateItem(selectedItem);
            }
        }
        this.updatedForTest();
    }
    updatedForTest() {
    }
    refreshItem(item) {
        this.scheduledForUpdateItems.add(item);
        void this.updateItemThrottler.schedule(async () => {
            const items = Array.from(this.scheduledForUpdateItems);
            this.scheduledForUpdateItems.clear();
            this.muteActivateItem = true;
            if (!this.showIgnoreListed && this.items.every(item => item.isIgnoreListed)) {
                this.showIgnoreListed = true;
                for (let i = 0; i < this.items.length; ++i) {
                    this.list.refreshItemByIndex(i);
                }
                this.ignoreListMessageElement.classList.toggle('hidden', true);
            }
            else {
                const itemsSet = new Set(items);
                let hasIgnoreListed = false;
                for (let i = 0; i < this.items.length; ++i) {
                    const item = this.items.at(i);
                    if (itemsSet.has(item)) {
                        this.list.refreshItemByIndex(i);
                    }
                    hasIgnoreListed = hasIgnoreListed || item.isIgnoreListed;
                }
                this.ignoreListMessageElement.classList.toggle('hidden', this.showIgnoreListed || !hasIgnoreListed);
            }
            delete this.muteActivateItem;
        });
    }
    createElementForItem(item) {
        const element = document.createElement('div');
        element.classList.add('call-frame-item');
        const title = element.createChild('div', 'call-frame-item-title');
        const titleElement = title.createChild('div', 'call-frame-title-text');
        titleElement.textContent = item.title;
        if (item.isAsyncHeader) {
            element.classList.add('async-header');
        }
        else {
            UI.Tooltip.Tooltip.install(titleElement, item.title);
            const linkElement = element.createChild('div', 'call-frame-location');
            linkElement.textContent = Platform.StringUtilities.trimMiddle(item.linkText, 30);
            UI.Tooltip.Tooltip.install(linkElement, item.linkText);
            element.classList.toggle('ignore-listed-call-frame', item.isIgnoreListed);
            if (item.isIgnoreListed) {
                UI.ARIAUtils.setDescription(element, i18nString(UIStrings.onIgnoreList));
            }
            if (!itemToCallFrame.has(item)) {
                UI.ARIAUtils.setDisabled(element, true);
            }
        }
        const callframe = itemToCallFrame.get(item);
        const isSelected = callframe === UI.Context.Context.instance().flavor(SDK.DebuggerModel.CallFrame);
        element.classList.toggle('selected', isSelected);
        UI.ARIAUtils.setSelected(element, isSelected);
        element.classList.toggle('hidden', !this.showIgnoreListed && item.isIgnoreListed);
        element.appendChild(UI.Icon.Icon.create('smallicon-thick-right-arrow', 'selected-call-frame-icon'));
        element.tabIndex = item === this.list.selectedItem() ? 0 : -1;
        if (callframe && callframe.missingDebugInfoDetails) {
            const icon = UI.Icon.Icon.create('smallicon-warning', 'call-frame-warning-icon');
            const messages = callframe.missingDebugInfoDetails.resources.map(r => i18nString(UIStrings.debugFileNotFound, { PH1: r }));
            UI.Tooltip.Tooltip.install(icon, [callframe.missingDebugInfoDetails.details, ...messages].join('\n'));
            element.appendChild(icon);
        }
        return element;
    }
    heightForItem(_item) {
        console.assert(false); // Should not be called.
        return 0;
    }
    isItemSelectable(_item) {
        return true;
    }
    selectedItemChanged(_from, _to, fromElement, toElement) {
        if (fromElement) {
            fromElement.tabIndex = -1;
        }
        if (toElement) {
            this.setDefaultFocusedElement(toElement);
            toElement.tabIndex = 0;
            if (this.hasFocus()) {
                toElement.focus();
            }
        }
    }
    updateSelectedItemARIA(_fromElement, _toElement) {
        return true;
    }
    createIgnoreListMessageElement() {
        const element = document.createElement('div');
        element.classList.add('ignore-listed-message');
        element.createChild('span');
        const showAllLink = element.createChild('span', 'link');
        showAllLink.textContent = i18nString(UIStrings.showIgnorelistedFrames);
        UI.ARIAUtils.markAsLink(showAllLink);
        showAllLink.tabIndex = 0;
        const showAll = () => {
            this.showIgnoreListed = true;
            for (const item of this.items) {
                this.refreshItem(item);
            }
            this.ignoreListMessageElement.classList.toggle('hidden', true);
        };
        showAllLink.addEventListener('click', showAll);
        showAllLink.addEventListener('keydown', event => event.key === 'Enter' && showAll());
        return element;
    }
    createShowMoreMessageElement() {
        const element = document.createElement('div');
        element.classList.add('show-more-message');
        element.createChild('span');
        const showAllLink = element.createChild('span', 'link');
        showAllLink.textContent = i18nString(UIStrings.showMore);
        showAllLink.addEventListener('click', () => {
            this.maxAsyncStackChainDepth += defaultMaxAsyncStackChainDepth;
            this.update();
        }, false);
        return element;
    }
    onContextMenu(event) {
        const item = this.list.itemForNode(event.target);
        if (!item) {
            return;
        }
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        const debuggerCallFrame = itemToCallFrame.get(item);
        if (debuggerCallFrame) {
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.restartFrame), () => {
                Host.userMetrics.actionTaken(Host.UserMetrics.Action.StackFrameRestarted);
                void debuggerCallFrame.restart();
            }, !debuggerCallFrame.canBeRestarted);
        }
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.copyStackTrace), this.copyStackTrace.bind(this));
        if (item.uiLocation) {
            this.appendIgnoreListURLContextMenuItems(contextMenu, item.uiLocation.uiSourceCode);
        }
        void contextMenu.show();
    }
    onClick(event) {
        const item = this.list.itemForNode(event.target);
        if (item) {
            this.activateItem(item);
        }
    }
    activateItem(item) {
        const uiLocation = item.uiLocation;
        if (this.muteActivateItem || !uiLocation) {
            return;
        }
        this.list.selectItem(item);
        const debuggerCallFrame = itemToCallFrame.get(item);
        const oldItem = this.activeCallFrameItem();
        if (debuggerCallFrame && oldItem !== item) {
            debuggerCallFrame.debuggerModel.setSelectedCallFrame(debuggerCallFrame);
            UI.Context.Context.instance().setFlavor(SDK.DebuggerModel.CallFrame, debuggerCallFrame);
            if (oldItem) {
                this.refreshItem(oldItem);
            }
            this.refreshItem(item);
        }
        else {
            void Common.Revealer.reveal(uiLocation);
        }
    }
    activeCallFrameItem() {
        const callFrame = UI.Context.Context.instance().flavor(SDK.DebuggerModel.CallFrame);
        if (callFrame) {
            return this.items.find(callFrameItem => itemToCallFrame.get(callFrameItem) === callFrame) || null;
        }
        return null;
    }
    appendIgnoreListURLContextMenuItems(contextMenu, uiSourceCode) {
        const binding = Persistence.Persistence.PersistenceImpl.instance().binding(uiSourceCode);
        if (binding) {
            uiSourceCode = binding.network;
        }
        if (uiSourceCode.project().type() === Workspace.Workspace.projectTypes.FileSystem) {
            return;
        }
        const canIgnoreList = Bindings.IgnoreListManager.IgnoreListManager.instance().canIgnoreListUISourceCode(uiSourceCode);
        const isIgnoreListed = Bindings.IgnoreListManager.IgnoreListManager.instance().isIgnoreListedUISourceCode(uiSourceCode);
        const isContentScript = uiSourceCode.project().type() === Workspace.Workspace.projectTypes.ContentScripts;
        const manager = Bindings.IgnoreListManager.IgnoreListManager.instance();
        if (canIgnoreList) {
            if (isIgnoreListed) {
                contextMenu.defaultSection().appendItem(i18nString(UIStrings.removeFromIgnoreList), manager.unIgnoreListUISourceCode.bind(manager, uiSourceCode));
            }
            else {
                contextMenu.defaultSection().appendItem(i18nString(UIStrings.addScriptToIgnoreList), manager.ignoreListUISourceCode.bind(manager, uiSourceCode));
            }
        }
        if (isContentScript) {
            if (isIgnoreListed) {
                contextMenu.defaultSection().appendItem(i18nString(UIStrings.removeAllContentScriptsFrom), manager.ignoreListContentScripts.bind(manager));
            }
            else {
                contextMenu.defaultSection().appendItem(i18nString(UIStrings.addAllContentScriptsToIgnoreList), manager.unIgnoreListContentScripts.bind(manager));
            }
        }
    }
    selectNextCallFrameOnStack() {
        const oldItem = this.activeCallFrameItem();
        const startIndex = oldItem ? this.items.indexOf(oldItem) + 1 : 0;
        for (let i = startIndex; i < this.items.length; i++) {
            const newItem = this.items.at(i);
            if (itemToCallFrame.has(newItem)) {
                this.activateItem(newItem);
                break;
            }
        }
    }
    selectPreviousCallFrameOnStack() {
        const oldItem = this.activeCallFrameItem();
        const startIndex = oldItem ? this.items.indexOf(oldItem) - 1 : this.items.length - 1;
        for (let i = startIndex; i >= 0; i--) {
            const newItem = this.items.at(i);
            if (itemToCallFrame.has(newItem)) {
                this.activateItem(newItem);
                break;
            }
        }
    }
    copyStackTrace() {
        const text = [];
        for (const item of this.items) {
            let itemText = item.title;
            if (item.uiLocation) {
                itemText += ' (' + item.uiLocation.linkText(true /* skipTrim */) + ')';
            }
            text.push(itemText);
        }
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(text.join('\n'));
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([callStackSidebarPaneStyles]);
    }
}
const itemToCallFrame = new WeakMap();
export const elementSymbol = Symbol('element');
export const defaultMaxAsyncStackChainDepth = 32;
let actionDelegateInstance;
export class ActionDelegate {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!actionDelegateInstance || forceNew) {
            actionDelegateInstance = new ActionDelegate();
        }
        return actionDelegateInstance;
    }
    handleAction(context, actionId) {
        switch (actionId) {
            case 'debugger.next-call-frame':
                CallStackSidebarPane.instance().selectNextCallFrameOnStack();
                return true;
            case 'debugger.previous-call-frame':
                CallStackSidebarPane.instance().selectPreviousCallFrameOnStack();
                return true;
        }
        return false;
    }
}
export class Item {
    isIgnoreListed;
    title;
    linkText;
    uiLocation;
    isAsyncHeader;
    updateDelegate;
    static async createForDebuggerCallFrame(frame, locationPool, updateDelegate) {
        const item = new Item(UI.UIUtils.beautifyFunctionName(frame.functionName), updateDelegate);
        await Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().createCallFrameLiveLocation(frame.location(), item.update.bind(item), locationPool);
        return item;
    }
    static async createItemsForAsyncStack(title, debuggerModel, frames, locationPool, updateDelegate) {
        const headerItemToItemsSet = new WeakMap();
        const asyncHeaderItem = new Item(title, updateDelegate);
        headerItemToItemsSet.set(asyncHeaderItem, new Set());
        asyncHeaderItem.isAsyncHeader = true;
        const asyncFrameItems = [];
        const liveLocationPromises = [];
        for (const frame of frames) {
            const item = new Item(UI.UIUtils.beautifyFunctionName(frame.functionName), update);
            const rawLocation = debuggerModel.createRawLocationByScriptId(frame.scriptId, frame.lineNumber, frame.columnNumber);
            liveLocationPromises.push(Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().createCallFrameLiveLocation(rawLocation, item.update.bind(item), locationPool));
            asyncFrameItems.push(item);
        }
        await Promise.all(liveLocationPromises);
        updateDelegate(asyncHeaderItem);
        return [asyncHeaderItem, ...asyncFrameItems];
        function update(item) {
            updateDelegate(item);
            let shouldUpdate = false;
            const items = headerItemToItemsSet.get(asyncHeaderItem);
            if (items) {
                if (item.isIgnoreListed) {
                    items.delete(item);
                    shouldUpdate = items.size === 0;
                }
                else {
                    shouldUpdate = items.size === 0;
                    items.add(item);
                }
                asyncHeaderItem.isIgnoreListed = items.size === 0;
            }
            if (shouldUpdate) {
                updateDelegate(asyncHeaderItem);
            }
        }
    }
    constructor(title, updateDelegate) {
        this.isIgnoreListed = false;
        this.title = title;
        this.linkText = '';
        this.uiLocation = null;
        this.isAsyncHeader = false;
        this.updateDelegate = updateDelegate;
    }
    async update(liveLocation) {
        const uiLocation = await liveLocation.uiLocation();
        this.isIgnoreListed = await liveLocation.isIgnoreListed();
        this.linkText = uiLocation ? uiLocation.linkText() : '';
        this.uiLocation = uiLocation;
        this.updateDelegate(this);
    }
}
//# sourceMappingURL=CallStackSidebarPane.js.map