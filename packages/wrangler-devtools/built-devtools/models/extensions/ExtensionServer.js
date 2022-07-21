/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
/* eslint-disable @typescript-eslint/naming-convention */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Logs from '../../models/logs/logs.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ThemeSupport from '../../ui/legacy/theme_support/theme_support.js';
import * as Bindings from '../bindings/bindings.js';
import * as HAR from '../har/har.js';
import * as Workspace from '../workspace/workspace.js';
import { ExtensionButton, ExtensionPanel, ExtensionSidebarPane } from './ExtensionPanel.js';
import { ExtensionTraceProvider } from './ExtensionTraceProvider.js';
import { LanguageExtensionEndpoint } from './LanguageExtensionEndpoint.js';
import { RecorderExtensionEndpoint } from './RecorderExtensionEndpoint.js';
import { RecorderPluginManager } from './RecorderPluginManager.js';
const extensionOrigins = new WeakMap();
const kAllowedOrigins = [
    'chrome://newtab',
    'chrome://new-tab-page',
].map(url => (new URL(url)).origin);
let extensionServerInstance;
export class ExtensionServer extends Common.ObjectWrapper.ObjectWrapper {
    clientObjects;
    handlers;
    subscribers;
    subscriptionStartHandlers;
    subscriptionStopHandlers;
    extraHeaders;
    requests;
    requestIds;
    lastRequestId;
    registeredExtensions;
    status;
    sidebarPanesInternal;
    traceProvidersInternal;
    traceSessions;
    extensionsEnabled;
    inspectedTabId;
    extensionAPITestHook;
    themeChangeHandlers = new Map();
    constructor() {
        super();
        this.clientObjects = new Map();
        this.handlers = new Map();
        this.subscribers = new Map();
        this.subscriptionStartHandlers = new Map();
        this.subscriptionStopHandlers = new Map();
        this.extraHeaders = new Map();
        this.requests = new Map();
        this.requestIds = new Map();
        this.lastRequestId = 0;
        this.registeredExtensions = new Map();
        this.status = new ExtensionStatus();
        this.sidebarPanesInternal = [];
        this.traceProvidersInternal = [];
        this.traceSessions = new Map();
        // TODO(caseq): properly unload extensions when we disable them.
        this.extensionsEnabled = true;
        this.registerHandler("addRequestHeaders" /* AddRequestHeaders */, this.onAddRequestHeaders.bind(this));
        this.registerHandler("addTraceProvider" /* AddTraceProvider */, this.onAddTraceProvider.bind(this));
        this.registerHandler("applyStyleSheet" /* ApplyStyleSheet */, this.onApplyStyleSheet.bind(this));
        this.registerHandler("completeTra.eSession" /* CompleteTraceSession */, this.onCompleteTraceSession.bind(this));
        this.registerHandler("createPanel" /* CreatePanel */, this.onCreatePanel.bind(this));
        this.registerHandler("createSidebarPane" /* CreateSidebarPane */, this.onCreateSidebarPane.bind(this));
        this.registerHandler("createToolbarButton" /* CreateToolbarButton */, this.onCreateToolbarButton.bind(this));
        this.registerHandler("evaluateOnInspectedPage" /* EvaluateOnInspectedPage */, this.onEvaluateOnInspectedPage.bind(this));
        this.registerHandler("_forwardKeyboardEvent" /* ForwardKeyboardEvent */, this.onForwardKeyboardEvent.bind(this));
        this.registerHandler("getHAR" /* GetHAR */, this.onGetHAR.bind(this));
        this.registerHandler("getPageResources" /* GetPageResources */, this.onGetPageResources.bind(this));
        this.registerHandler("getRequestContent" /* GetRequestContent */, this.onGetRequestContent.bind(this));
        this.registerHandler("getResourceContent" /* GetResourceContent */, this.onGetResourceContent.bind(this));
        this.registerHandler("Reload" /* Reload */, this.onReload.bind(this));
        this.registerHandler("setOpenResourceHandler" /* SetOpenResourceHandler */, this.onSetOpenResourceHandler.bind(this));
        this.registerHandler("setThemeChangeHandler" /* SetThemeChangeHandler */, this.onSetThemeChangeHandler.bind(this));
        this.registerHandler("setResourceContent" /* SetResourceContent */, this.onSetResourceContent.bind(this));
        this.registerHandler("setSidebarHeight" /* SetSidebarHeight */, this.onSetSidebarHeight.bind(this));
        this.registerHandler("setSidebarContent" /* SetSidebarContent */, this.onSetSidebarContent.bind(this));
        this.registerHandler("setSidebarPage" /* SetSidebarPage */, this.onSetSidebarPage.bind(this));
        this.registerHandler("showPanel" /* ShowPanel */, this.onShowPanel.bind(this));
        this.registerHandler("subscribe" /* Subscribe */, this.onSubscribe.bind(this));
        this.registerHandler("openResource" /* OpenResource */, this.onOpenResource.bind(this));
        this.registerHandler("unsubscribe" /* Unsubscribe */, this.onUnsubscribe.bind(this));
        this.registerHandler("updateButton" /* UpdateButton */, this.onUpdateButton.bind(this));
        this.registerHandler("registerLanguageExtensionPlugin" /* RegisterLanguageExtensionPlugin */, this.registerLanguageExtensionEndpoint.bind(this));
        this.registerHandler("getWasmLinearMemory" /* GetWasmLinearMemory */, this.onGetWasmLinearMemory.bind(this));
        this.registerHandler("getWasmGlobal" /* GetWasmGlobal */, this.onGetWasmGlobal.bind(this));
        this.registerHandler("getWasmLocal" /* GetWasmLocal */, this.onGetWasmLocal.bind(this));
        this.registerHandler("getWasmOp" /* GetWasmOp */, this.onGetWasmOp.bind(this));
        this.registerHandler("registerRecorderExtensionPlugin" /* RegisterRecorderExtensionPlugin */, this.registerRecorderExtensionEndpoint.bind(this));
        window.addEventListener('message', this.onWindowMessage.bind(this), false); // Only for main window.
        const existingTabId = window.DevToolsAPI && window.DevToolsAPI.getInspectedTabId && window.DevToolsAPI.getInspectedTabId();
        if (existingTabId) {
            this.setInspectedTabId({ data: existingTabId });
        }
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.SetInspectedTabId, this.setInspectedTabId, this);
        this.initExtensions();
        ThemeSupport.ThemeSupport.instance().addEventListener(ThemeSupport.ThemeChangeEvent.eventName, () => {
            const themeName = ThemeSupport.ThemeSupport.instance().themeName();
            for (const port of this.themeChangeHandlers.values()) {
                port.postMessage({ command: "host-theme-change" /* ThemeChange */, themeName });
            }
        });
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!extensionServerInstance || forceNew) {
            extensionServerInstance = new ExtensionServer();
        }
        return extensionServerInstance;
    }
    initializeExtensions() {
        // Defer initialization until DevTools is fully loaded.
        if (this.inspectedTabId !== null) {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.setAddExtensionCallback(this.addExtension.bind(this));
        }
    }
    hasExtensions() {
        return Boolean(this.registeredExtensions.size);
    }
    notifySearchAction(panelId, action, searchString) {
        this.postNotification("panel-search-" /* PanelSearch */ + panelId, action, searchString);
    }
    notifyViewShown(identifier, frameIndex) {
        this.postNotification("view-shown-" /* ViewShown */ + identifier, frameIndex);
    }
    notifyViewHidden(identifier) {
        this.postNotification("view-hidden," /* ViewHidden */ + identifier);
    }
    notifyButtonClicked(identifier) {
        this.postNotification("button-clicked-" /* ButtonClicked */ + identifier);
    }
    registerLanguageExtensionEndpoint(message, _shared_port) {
        if (message.command !== "registerLanguageExtensionPlugin" /* RegisterLanguageExtensionPlugin */) {
            return this.status.E_BADARG('command', `expected ${"registerLanguageExtensionPlugin" /* RegisterLanguageExtensionPlugin */}`);
        }
        const { pluginManager } = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance();
        if (!pluginManager) {
            return this.status.E_FAILED('WebAssembly DWARF support needs to be enabled to use this extension');
        }
        const { pluginName, port, supportedScriptTypes: { language, symbol_types } } = message;
        const symbol_types_array = (Array.isArray(symbol_types) && symbol_types.every(e => typeof e === 'string') ? symbol_types : []);
        const endpoint = new LanguageExtensionEndpoint(pluginName, { language, symbol_types: symbol_types_array }, port);
        pluginManager.addPlugin(endpoint);
        return this.status.OK();
    }
    async loadWasmValue(expression, stopId) {
        const { pluginManager } = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance();
        if (!pluginManager) {
            return this.status.E_FAILED('WebAssembly DWARF support needs to be enabled to use this extension');
        }
        const callFrame = pluginManager.callFrameForStopId(stopId);
        if (!callFrame) {
            return this.status.E_BADARG('stopId', 'Unknown stop id');
        }
        const result = await callFrame.debuggerModel.agent.invoke_evaluateOnCallFrame({
            callFrameId: callFrame.id,
            expression,
            silent: true,
            returnByValue: true,
            throwOnSideEffect: true,
        });
        if (!result.exceptionDetails && !result.getError()) {
            return result.result.value;
        }
        return this.status.E_FAILED('Failed');
    }
    async onGetWasmLinearMemory(message) {
        if (message.command !== "getWasmLinearMemory" /* GetWasmLinearMemory */) {
            return this.status.E_BADARG('command', `expected ${"getWasmLinearMemory" /* GetWasmLinearMemory */}`);
        }
        return await this.loadWasmValue(`[].slice.call(new Uint8Array(memories[0].buffer, ${Number(message.offset)}, ${Number(message.length)}))`, message.stopId);
    }
    async onGetWasmGlobal(message) {
        if (message.command !== "getWasmGlobal" /* GetWasmGlobal */) {
            return this.status.E_BADARG('command', `expected ${"getWasmGlobal" /* GetWasmGlobal */}`);
        }
        return this.loadWasmValue(`globals[${Number(message.global)}]`, message.stopId);
    }
    async onGetWasmLocal(message) {
        if (message.command !== "getWasmLocal" /* GetWasmLocal */) {
            return this.status.E_BADARG('command', `expected ${"getWasmLocal" /* GetWasmLocal */}`);
        }
        return this.loadWasmValue(`locals[${Number(message.local)}]`, message.stopId);
    }
    async onGetWasmOp(message) {
        if (message.command !== "getWasmOp" /* GetWasmOp */) {
            return this.status.E_BADARG('command', `expected ${"getWasmOp" /* GetWasmOp */}`);
        }
        return this.loadWasmValue(`stack[${Number(message.op)}]`, message.stopId);
    }
    registerRecorderExtensionEndpoint(message, _shared_port) {
        if (message.command !== "registerRecorderExtensionPlugin" /* RegisterRecorderExtensionPlugin */) {
            return this.status.E_BADARG('command', `expected ${"registerRecorderExtensionPlugin" /* RegisterRecorderExtensionPlugin */}`);
        }
        const { pluginName, mediaType, port } = message;
        RecorderPluginManager.instance().addPlugin(new RecorderExtensionEndpoint(pluginName, mediaType, port));
        return this.status.OK();
    }
    inspectedURLChanged(event) {
        if (!this.canInspectURL(event.data.inspectedURL())) {
            this.disableExtensions();
            return;
        }
        if (event.data !== SDK.TargetManager.TargetManager.instance().mainTarget()) {
            return;
        }
        this.requests = new Map();
        const url = event.data.inspectedURL();
        this.postNotification("inspected-url-changed" /* InspectedURLChanged */, url);
    }
    startTraceRecording(providerId, sessionId, session) {
        this.traceSessions.set(sessionId, session);
        this.postNotification('trace-recording-started-' + providerId, sessionId);
    }
    stopTraceRecording(providerId) {
        this.postNotification('trace-recording-stopped-' + providerId);
    }
    hasSubscribers(type) {
        return this.subscribers.has(type);
    }
    postNotification(type, ..._vararg) {
        if (!this.extensionsEnabled) {
            return;
        }
        const subscribers = this.subscribers.get(type);
        if (!subscribers) {
            return;
        }
        const message = { command: 'notify-' + type, arguments: Array.prototype.slice.call(arguments, 1) };
        for (const subscriber of subscribers) {
            subscriber.postMessage(message);
        }
    }
    onSubscribe(message, port) {
        if (message.command !== "subscribe" /* Subscribe */) {
            return this.status.E_BADARG('command', `expected ${"subscribe" /* Subscribe */}`);
        }
        const subscribers = this.subscribers.get(message.type);
        if (subscribers) {
            subscribers.add(port);
        }
        else {
            this.subscribers.set(message.type, new Set([port]));
            const handler = this.subscriptionStartHandlers.get(message.type);
            if (handler) {
                handler();
            }
        }
        return undefined;
    }
    onUnsubscribe(message, port) {
        if (message.command !== "unsubscribe" /* Unsubscribe */) {
            return this.status.E_BADARG('command', `expected ${"unsubscribe" /* Unsubscribe */}`);
        }
        const subscribers = this.subscribers.get(message.type);
        if (!subscribers) {
            return;
        }
        subscribers.delete(port);
        if (!subscribers.size) {
            this.subscribers.delete(message.type);
            const handler = this.subscriptionStopHandlers.get(message.type);
            if (handler) {
                handler();
            }
        }
        return undefined;
    }
    onAddRequestHeaders(message) {
        if (message.command !== "addRequestHeaders" /* AddRequestHeaders */) {
            return this.status.E_BADARG('command', `expected ${"addRequestHeaders" /* AddRequestHeaders */}`);
        }
        const id = message.extensionId;
        if (typeof id !== 'string') {
            return this.status.E_BADARGTYPE('extensionId', typeof id, 'string');
        }
        let extensionHeaders = this.extraHeaders.get(id);
        if (!extensionHeaders) {
            extensionHeaders = new Map();
            this.extraHeaders.set(id, extensionHeaders);
        }
        for (const name in message.headers) {
            extensionHeaders.set(name, message.headers[name]);
        }
        const allHeaders = {};
        for (const headers of this.extraHeaders.values()) {
            for (const [name, value] of headers) {
                if (name !== '__proto__' && typeof value === 'string') {
                    allHeaders[name] = value;
                }
            }
        }
        SDK.NetworkManager.MultitargetNetworkManager.instance().setExtraHTTPHeaders(allHeaders);
        return undefined;
    }
    onApplyStyleSheet(message) {
        if (message.command !== "applyStyleSheet" /* ApplyStyleSheet */) {
            return this.status.E_BADARG('command', `expected ${"applyStyleSheet" /* ApplyStyleSheet */}`);
        }
        if (!Root.Runtime.experiments.isEnabled('applyCustomStylesheet')) {
            return;
        }
        const styleSheet = document.createElement('style');
        styleSheet.textContent = message.styleSheet;
        document.head.appendChild(styleSheet);
        ThemeSupport.ThemeSupport.instance().addCustomStylesheet(message.styleSheet);
        // Add to all the shadow roots that have already been created
        for (let node = document.body; node; node = node.traverseNextNode(document.body)) {
            if (node instanceof ShadowRoot) {
                ThemeSupport.ThemeSupport.instance().injectCustomStyleSheets(node);
            }
        }
        return undefined;
    }
    getExtensionOrigin(port) {
        const origin = extensionOrigins.get(port);
        if (!origin) {
            throw new Error('Received a message from an unregistered extension');
        }
        return origin;
    }
    onCreatePanel(message, port) {
        if (message.command !== "createPanel" /* CreatePanel */) {
            return this.status.E_BADARG('command', `expected ${"createPanel" /* CreatePanel */}`);
        }
        const id = message.id;
        // The ids are generated on the client API side and must be unique, so the check below
        // shouldn't be hit unless someone is bypassing the API.
        if (this.clientObjects.has(id) || UI.InspectorView.InspectorView.instance().hasPanel(id)) {
            return this.status.E_EXISTS(id);
        }
        const page = this.expandResourcePath(this.getExtensionOrigin(port), message.page);
        let persistentId = this.getExtensionOrigin(port) + message.title;
        persistentId = persistentId.replace(/\s/g, '');
        const panelView = new ExtensionServerPanelView(persistentId, i18n.i18n.lockedString(message.title), new ExtensionPanel(this, persistentId, id, page));
        this.clientObjects.set(id, panelView);
        UI.InspectorView.InspectorView.instance().addPanel(panelView);
        return this.status.OK();
    }
    onShowPanel(message) {
        if (message.command !== "showPanel" /* ShowPanel */) {
            return this.status.E_BADARG('command', `expected ${"showPanel" /* ShowPanel */}`);
        }
        let panelViewId = message.id;
        const panelView = this.clientObjects.get(message.id);
        if (panelView && panelView instanceof ExtensionServerPanelView) {
            panelViewId = panelView.viewId();
        }
        void UI.InspectorView.InspectorView.instance().showPanel(panelViewId);
        return undefined;
    }
    onCreateToolbarButton(message, port) {
        if (message.command !== "createToolbarButton" /* CreateToolbarButton */) {
            return this.status.E_BADARG('command', `expected ${"createToolbarButton" /* CreateToolbarButton */}`);
        }
        const panelView = this.clientObjects.get(message.panel);
        if (!panelView || !(panelView instanceof ExtensionServerPanelView)) {
            return this.status.E_NOTFOUND(message.panel);
        }
        const button = new ExtensionButton(this, message.id, this.expandResourcePath(this.getExtensionOrigin(port), message.icon), message.tooltip, message.disabled);
        this.clientObjects.set(message.id, button);
        void panelView.widget().then(appendButton);
        function appendButton(panel) {
            panel.addToolbarItem(button.toolbarButton());
        }
        return this.status.OK();
    }
    onUpdateButton(message, port) {
        if (message.command !== "updateButton" /* UpdateButton */) {
            return this.status.E_BADARG('command', `expected ${"updateButton" /* UpdateButton */}`);
        }
        const button = this.clientObjects.get(message.id);
        if (!button || !(button instanceof ExtensionButton)) {
            return this.status.E_NOTFOUND(message.id);
        }
        button.update(message.icon && this.expandResourcePath(this.getExtensionOrigin(port), message.icon), message.tooltip, message.disabled);
        return this.status.OK();
    }
    onCompleteTraceSession(message) {
        if (message.command !== "completeTra.eSession" /* CompleteTraceSession */) {
            return this.status.E_BADARG('command', `expected ${"completeTra.eSession" /* CompleteTraceSession */}`);
        }
        const session = this.traceSessions.get(message.id);
        if (!session) {
            return this.status.E_NOTFOUND(message.id);
        }
        this.traceSessions.delete(message.id);
        session.complete(message.url, message.timeOffset);
        return undefined;
    }
    onCreateSidebarPane(message) {
        if (message.command !== "createSidebarPane" /* CreateSidebarPane */) {
            return this.status.E_BADARG('command', `expected ${"createSidebarPane" /* CreateSidebarPane */}`);
        }
        const id = message.id;
        const sidebar = new ExtensionSidebarPane(this, message.panel, i18n.i18n.lockedString(message.title), id);
        this.sidebarPanesInternal.push(sidebar);
        this.clientObjects.set(id, sidebar);
        this.dispatchEventToListeners(Events.SidebarPaneAdded, sidebar);
        return this.status.OK();
    }
    sidebarPanes() {
        return this.sidebarPanesInternal;
    }
    onSetSidebarHeight(message) {
        if (message.command !== "setSidebarHeight" /* SetSidebarHeight */) {
            return this.status.E_BADARG('command', `expected ${"setSidebarHeight" /* SetSidebarHeight */}`);
        }
        const sidebar = this.clientObjects.get(message.id);
        if (!sidebar || !(sidebar instanceof ExtensionSidebarPane)) {
            return this.status.E_NOTFOUND(message.id);
        }
        sidebar.setHeight(message.height);
        return this.status.OK();
    }
    onSetSidebarContent(message, port) {
        if (message.command !== "setSidebarContent" /* SetSidebarContent */) {
            return this.status.E_BADARG('command', `expected ${"setSidebarContent" /* SetSidebarContent */}`);
        }
        const { requestId, id, rootTitle, expression, evaluateOptions, evaluateOnPage } = message;
        const sidebar = this.clientObjects.get(id);
        if (!sidebar || !(sidebar instanceof ExtensionSidebarPane)) {
            return this.status.E_NOTFOUND(message.id);
        }
        function callback(error) {
            const result = error ? this.status.E_FAILED(error) : this.status.OK();
            this.dispatchCallback(requestId, port, result);
        }
        if (evaluateOnPage) {
            sidebar.setExpression(expression, rootTitle, evaluateOptions, this.getExtensionOrigin(port), callback.bind(this));
            return undefined;
        }
        sidebar.setObject(message.expression, message.rootTitle, callback.bind(this));
        return undefined;
    }
    onSetSidebarPage(message, port) {
        if (message.command !== "setSidebarPage" /* SetSidebarPage */) {
            return this.status.E_BADARG('command', `expected ${"setSidebarPage" /* SetSidebarPage */}`);
        }
        const sidebar = this.clientObjects.get(message.id);
        if (!sidebar || !(sidebar instanceof ExtensionSidebarPane)) {
            return this.status.E_NOTFOUND(message.id);
        }
        sidebar.setPage(this.expandResourcePath(this.getExtensionOrigin(port), message.page));
        return undefined;
    }
    onOpenResource(message) {
        if (message.command !== "openResource" /* OpenResource */) {
            return this.status.E_BADARG('command', `expected ${"openResource" /* OpenResource */}`);
        }
        const uiSourceCode = Workspace.Workspace.WorkspaceImpl.instance().uiSourceCodeForURL(message.url);
        if (uiSourceCode) {
            void Common.Revealer.reveal(uiSourceCode.uiLocation(message.lineNumber, message.columnNumber));
            return this.status.OK();
        }
        const resource = Bindings.ResourceUtils.resourceForURL(message.url);
        if (resource) {
            void Common.Revealer.reveal(resource);
            return this.status.OK();
        }
        const request = Logs.NetworkLog.NetworkLog.instance().requestForURL(message.url);
        if (request) {
            void Common.Revealer.reveal(request);
            return this.status.OK();
        }
        return this.status.E_NOTFOUND(message.url);
    }
    onSetOpenResourceHandler(message, port) {
        if (message.command !== "setOpenResourceHandler" /* SetOpenResourceHandler */) {
            return this.status.E_BADARG('command', `expected ${"setOpenResourceHandler" /* SetOpenResourceHandler */}`);
        }
        const extension = this.registeredExtensions.get(this.getExtensionOrigin(port));
        if (!extension) {
            throw new Error('Received a message from an unregistered extension');
        }
        const { name } = extension;
        if (message.handlerPresent) {
            Components.Linkifier.Linkifier.registerLinkHandler(name, this.handleOpenURL.bind(this, port));
        }
        else {
            Components.Linkifier.Linkifier.unregisterLinkHandler(name);
        }
        return undefined;
    }
    onSetThemeChangeHandler(message, port) {
        if (message.command !== "setThemeChangeHandler" /* SetThemeChangeHandler */) {
            return this.status.E_BADARG('command', `expected ${"setThemeChangeHandler" /* SetThemeChangeHandler */}`);
        }
        const extensionOrigin = this.getExtensionOrigin(port);
        const extension = this.registeredExtensions.get(extensionOrigin);
        if (!extension) {
            throw new Error('Received a message from an unregistered extension');
        }
        if (message.handlerPresent) {
            this.themeChangeHandlers.set(extensionOrigin, port);
        }
        else {
            this.themeChangeHandlers.delete(extensionOrigin);
        }
        return undefined;
    }
    handleOpenURL(port, contentProvider, lineNumber) {
        port.postMessage({ command: 'open-resource', resource: this.makeResource(contentProvider), lineNumber: lineNumber + 1 });
    }
    onReload(message) {
        if (message.command !== "Reload" /* Reload */) {
            return this.status.E_BADARG('command', `expected ${"Reload" /* Reload */}`);
        }
        const options = (message.options || {});
        SDK.NetworkManager.MultitargetNetworkManager.instance().setUserAgentOverride(typeof options.userAgent === 'string' ? options.userAgent : '', null);
        let injectedScript;
        if (options.injectedScript) {
            injectedScript = '(function(){' + options.injectedScript + '})()';
        }
        SDK.ResourceTreeModel.ResourceTreeModel.reloadAllPages(Boolean(options.ignoreCache), injectedScript);
        return this.status.OK();
    }
    onEvaluateOnInspectedPage(message, port) {
        if (message.command !== "evaluateOnInspectedPage" /* EvaluateOnInspectedPage */) {
            return this.status.E_BADARG('command', `expected ${"evaluateOnInspectedPage" /* EvaluateOnInspectedPage */}`);
        }
        const { requestId, expression, evaluateOptions } = message;
        function callback(error, object, wasThrown) {
            let result;
            if (error || !object) {
                result = this.status.E_PROTOCOLERROR(error?.toString());
            }
            else if (wasThrown) {
                result = { isException: true, value: object.description };
            }
            else {
                result = { value: object.value };
            }
            this.dispatchCallback(requestId, port, result);
        }
        return this.evaluate(expression, true, true, evaluateOptions, this.getExtensionOrigin(port), callback.bind(this));
    }
    async onGetHAR(message) {
        if (message.command !== "getHAR" /* GetHAR */) {
            return this.status.E_BADARG('command', `expected ${"getHAR" /* GetHAR */}`);
        }
        const requests = Logs.NetworkLog.NetworkLog.instance().requests();
        const harLog = await HAR.Log.Log.build(requests);
        for (let i = 0; i < harLog.entries.length; ++i) {
            // @ts-ignore
            harLog.entries[i]._requestId = this.requestId(requests[i]);
        }
        return harLog;
    }
    makeResource(contentProvider) {
        return { url: contentProvider.contentURL(), type: contentProvider.contentType().name() };
    }
    onGetPageResources() {
        const resources = new Map();
        function pushResourceData(contentProvider) {
            if (!resources.has(contentProvider.contentURL())) {
                resources.set(contentProvider.contentURL(), this.makeResource(contentProvider));
            }
            return false;
        }
        let uiSourceCodes = Workspace.Workspace.WorkspaceImpl.instance().uiSourceCodesForProjectType(Workspace.Workspace.projectTypes.Network);
        uiSourceCodes = uiSourceCodes.concat(Workspace.Workspace.WorkspaceImpl.instance().uiSourceCodesForProjectType(Workspace.Workspace.projectTypes.ContentScripts));
        uiSourceCodes.forEach(pushResourceData.bind(this));
        for (const resourceTreeModel of SDK.TargetManager.TargetManager.instance().models(SDK.ResourceTreeModel.ResourceTreeModel)) {
            resourceTreeModel.forAllResources(pushResourceData.bind(this));
        }
        return [...resources.values()];
    }
    async getResourceContent(contentProvider, message, port) {
        const { content } = await contentProvider.requestContent();
        const encoded = await contentProvider.contentEncoded();
        this.dispatchCallback(message.requestId, port, { encoding: encoded ? 'base64' : '', content: content });
    }
    onGetRequestContent(message, port) {
        if (message.command !== "getRequestContent" /* GetRequestContent */) {
            return this.status.E_BADARG('command', `expected ${"getRequestContent" /* GetRequestContent */}`);
        }
        const request = this.requestById(message.id);
        if (!request) {
            return this.status.E_NOTFOUND(message.id);
        }
        void this.getResourceContent(request, message, port);
        return undefined;
    }
    onGetResourceContent(message, port) {
        if (message.command !== "getResourceContent" /* GetResourceContent */) {
            return this.status.E_BADARG('command', `expected ${"getResourceContent" /* GetResourceContent */}`);
        }
        const url = message.url;
        const contentProvider = Workspace.Workspace.WorkspaceImpl.instance().uiSourceCodeForURL(url) ||
            Bindings.ResourceUtils.resourceForURL(url);
        if (!contentProvider) {
            return this.status.E_NOTFOUND(url);
        }
        void this.getResourceContent(contentProvider, message, port);
        return undefined;
    }
    onSetResourceContent(message, port) {
        if (message.command !== "setResourceContent" /* SetResourceContent */) {
            return this.status.E_BADARG('command', `expected ${"setResourceContent" /* SetResourceContent */}`);
        }
        const { url, requestId, content, commit } = message;
        function callbackWrapper(error) {
            const response = error ? this.status.E_FAILED(error) : this.status.OK();
            this.dispatchCallback(requestId, port, response);
        }
        const uiSourceCode = Workspace.Workspace.WorkspaceImpl.instance().uiSourceCodeForURL(url);
        if (!uiSourceCode || !uiSourceCode.contentType().isDocumentOrScriptOrStyleSheet()) {
            const resource = SDK.ResourceTreeModel.ResourceTreeModel.resourceForURL(url);
            if (!resource) {
                return this.status.E_NOTFOUND(url);
            }
            return this.status.E_NOTSUPPORTED('Resource is not editable');
        }
        uiSourceCode.setWorkingCopy(content);
        if (commit) {
            uiSourceCode.commitWorkingCopy();
        }
        callbackWrapper.call(this, null);
        return undefined;
    }
    requestId(request) {
        const requestId = this.requestIds.get(request);
        if (requestId === undefined) {
            const newId = ++this.lastRequestId;
            this.requestIds.set(request, newId);
            this.requests.set(newId, request);
            return newId;
        }
        return requestId;
    }
    requestById(id) {
        return this.requests.get(id);
    }
    onAddTraceProvider(message, port) {
        if (message.command !== "addTraceProvider" /* AddTraceProvider */) {
            return this.status.E_BADARG('command', `expected ${"addTraceProvider" /* AddTraceProvider */}`);
        }
        const provider = new ExtensionTraceProvider(this.getExtensionOrigin(port), message.id, message.categoryName, message.categoryTooltip);
        this.clientObjects.set(message.id, provider);
        this.traceProvidersInternal.push(provider);
        this.dispatchEventToListeners(Events.TraceProviderAdded, provider);
        return undefined;
    }
    traceProviders() {
        return this.traceProvidersInternal;
    }
    onForwardKeyboardEvent(message) {
        if (message.command !== "_forwardKeyboardEvent" /* ForwardKeyboardEvent */) {
            return this.status.E_BADARG('command', `expected ${"_forwardKeyboardEvent" /* ForwardKeyboardEvent */}`);
        }
        message.entries.forEach(handleEventEntry);
        function handleEventEntry(entry) {
            // Fool around closure compiler -- it has its own notion of both KeyboardEvent constructor
            // and initKeyboardEvent methods and overriding these in externs.js does not have effect.
            const event = new window.KeyboardEvent(entry.eventType, {
                key: entry.key,
                code: entry.code,
                keyCode: entry.keyCode,
                location: entry.location,
                ctrlKey: entry.ctrlKey,
                altKey: entry.altKey,
                shiftKey: entry.shiftKey,
                metaKey: entry.metaKey,
            });
            // @ts-ignore
            event.__keyCode = keyCodeForEntry(entry);
            document.dispatchEvent(event);
        }
        function keyCodeForEntry(entry) {
            let keyCode = entry.keyCode;
            if (!keyCode) {
                // This is required only for synthetic events (e.g. dispatched in tests).
                if (entry.key === Platform.KeyboardUtilities.ESCAPE_KEY) {
                    keyCode = 27;
                }
            }
            return keyCode || 0;
        }
        return undefined;
    }
    dispatchCallback(requestId, port, result) {
        if (requestId) {
            port.postMessage({ command: 'callback', requestId: requestId, result: result });
        }
    }
    initExtensions() {
        this.registerAutosubscriptionHandler("resource-added" /* ResourceAdded */, Workspace.Workspace.WorkspaceImpl.instance(), Workspace.Workspace.Events.UISourceCodeAdded, this.notifyResourceAdded);
        this.registerAutosubscriptionTargetManagerHandler("network-request-finished" /* NetworkRequestFinished */, SDK.NetworkManager.NetworkManager, SDK.NetworkManager.Events.RequestFinished, this.notifyRequestFinished);
        function onElementsSubscriptionStarted() {
            UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.notifyElementsSelectionChanged, this);
        }
        function onElementsSubscriptionStopped() {
            UI.Context.Context.instance().removeFlavorChangeListener(SDK.DOMModel.DOMNode, this.notifyElementsSelectionChanged, this);
        }
        this.registerSubscriptionHandler("panel-objectSelected-" /* PanelObjectSelected */ + 'elements', onElementsSubscriptionStarted.bind(this), onElementsSubscriptionStopped.bind(this));
        this.registerResourceContentCommittedHandler(this.notifyUISourceCodeContentCommitted);
        SDK.TargetManager.TargetManager.instance().addEventListener(SDK.TargetManager.Events.InspectedURLChanged, this.inspectedURLChanged, this);
    }
    notifyResourceAdded(event) {
        const uiSourceCode = event.data;
        this.postNotification("resource-added" /* ResourceAdded */, this.makeResource(uiSourceCode));
    }
    notifyUISourceCodeContentCommitted(event) {
        const { uiSourceCode, content } = event.data;
        this.postNotification("resource-content-committed" /* ResourceContentCommitted */, this.makeResource(uiSourceCode), content);
    }
    async notifyRequestFinished(event) {
        const request = event.data;
        const entry = await HAR.Log.Entry.build(request);
        this.postNotification("network-request-finished" /* NetworkRequestFinished */, this.requestId(request), entry);
    }
    notifyElementsSelectionChanged() {
        this.postNotification("panel-objectSelected-" /* PanelObjectSelected */ + 'elements');
    }
    sourceSelectionChanged(url, range) {
        this.postNotification("panel-objectSelected-" /* PanelObjectSelected */ + 'sources', {
            startLine: range.startLine,
            startColumn: range.startColumn,
            endLine: range.endLine,
            endColumn: range.endColumn,
            url: url,
        });
    }
    setInspectedTabId(event) {
        const oldId = this.inspectedTabId;
        this.inspectedTabId = event.data;
        if (oldId === null) {
            // Run deferred init
            this.initializeExtensions();
        }
    }
    addExtensionForTest(extensionInfo, origin) {
        const name = extensionInfo.name || `Extension ${origin}`;
        this.registeredExtensions.set(origin, { name });
        return true;
    }
    addExtension(extensionInfo) {
        const startPage = extensionInfo.startPage;
        const inspectedURL = SDK.TargetManager.TargetManager.instance().mainTarget()?.inspectedURL() ?? '';
        if (inspectedURL !== '' && !this.canInspectURL(inspectedURL)) {
            this.disableExtensions();
        }
        if (!this.extensionsEnabled) {
            return;
        }
        try {
            const startPageURL = new URL(startPage);
            const extensionOrigin = startPageURL.origin;
            if (!this.registeredExtensions.get(extensionOrigin)) {
                // See ExtensionAPI.js for details.
                const injectedAPI = self.buildExtensionAPIInjectedScript(extensionInfo, this.inspectedTabId, ThemeSupport.ThemeSupport.instance().themeName(), UI.ShortcutRegistry.ShortcutRegistry.instance().globalShortcutKeys(), ExtensionServer.instance().extensionAPITestHook);
                Host.InspectorFrontendHost.InspectorFrontendHostInstance.setInjectedScriptForOrigin(extensionOrigin, injectedAPI);
                const name = extensionInfo.name || `Extension ${extensionOrigin}`;
                this.registeredExtensions.set(extensionOrigin, { name });
            }
            const iframe = document.createElement('iframe');
            iframe.src = startPage;
            iframe.dataset.devtoolsExtension = extensionInfo.name;
            iframe.style.display = 'none';
            document.body.appendChild(iframe); // Only for main window.
        }
        catch (e) {
            console.error('Failed to initialize extension ' + startPage + ':' + e);
            return false;
        }
        return true;
    }
    registerExtension(origin, port) {
        if (!this.registeredExtensions.has(origin)) {
            if (origin !== window.location.origin) { // Just ignore inspector frames.
                console.error('Ignoring unauthorized client request from ' + origin);
            }
            return;
        }
        extensionOrigins.set(port, origin);
        port.addEventListener('message', this.onmessage.bind(this), false);
        port.start();
    }
    onWindowMessage(event) {
        if (event.data === 'registerExtension') {
            this.registerExtension(event.origin, event.ports[0]);
        }
    }
    async onmessage(event) {
        const message = event.data;
        let result;
        const handler = this.handlers.get(message.command);
        if (!handler) {
            result = this.status.E_NOTSUPPORTED(message.command);
        }
        else if (!this.extensionsEnabled) {
            result = this.status.E_FAILED('Permission denied');
        }
        else {
            result = await handler(message, event.target);
        }
        if (result && message.requestId) {
            this.dispatchCallback(message.requestId, event.target, result);
        }
    }
    registerHandler(command, callback) {
        console.assert(Boolean(command));
        this.handlers.set(command, callback);
    }
    registerSubscriptionHandler(eventTopic, onSubscribeFirst, onUnsubscribeLast) {
        this.subscriptionStartHandlers.set(eventTopic, onSubscribeFirst);
        this.subscriptionStopHandlers.set(eventTopic, onUnsubscribeLast);
    }
    registerAutosubscriptionHandler(eventTopic, eventTarget, frontendEventType, handler) {
        this.registerSubscriptionHandler(eventTopic, () => eventTarget.addEventListener(frontendEventType, handler, this), () => eventTarget.removeEventListener(frontendEventType, handler, this));
    }
    registerAutosubscriptionTargetManagerHandler(eventTopic, modelClass, frontendEventType, handler) {
        this.registerSubscriptionHandler(eventTopic, () => SDK.TargetManager.TargetManager.instance().addModelListener(modelClass, frontendEventType, handler, this), () => SDK.TargetManager.TargetManager.instance().removeModelListener(modelClass, frontendEventType, handler, this));
    }
    registerResourceContentCommittedHandler(handler) {
        function addFirstEventListener() {
            Workspace.Workspace.WorkspaceImpl.instance().addEventListener(Workspace.Workspace.Events.WorkingCopyCommittedByUser, handler, this);
            Workspace.Workspace.WorkspaceImpl.instance().setHasResourceContentTrackingExtensions(true);
        }
        function removeLastEventListener() {
            Workspace.Workspace.WorkspaceImpl.instance().setHasResourceContentTrackingExtensions(false);
            Workspace.Workspace.WorkspaceImpl.instance().removeEventListener(Workspace.Workspace.Events.WorkingCopyCommittedByUser, handler, this);
        }
        this.registerSubscriptionHandler("resource-content-committed" /* ResourceContentCommitted */, addFirstEventListener.bind(this), removeLastEventListener.bind(this));
    }
    expandResourcePath(extensionPath, resourcePath) {
        return extensionPath + '/' + Common.ParsedURL.normalizePath(resourcePath);
    }
    evaluate(expression, exposeCommandLineAPI, returnByValue, options, securityOrigin, callback) {
        let context;
        function resolveURLToFrame(url) {
            let found = null;
            function hasMatchingURL(frame) {
                found = (frame.url === url) ? frame : null;
                return found;
            }
            SDK.ResourceTreeModel.ResourceTreeModel.frames().some(hasMatchingURL);
            return found;
        }
        options = options || {};
        let frame;
        if (options.frameURL) {
            frame = resolveURLToFrame(options.frameURL);
        }
        else {
            const target = SDK.TargetManager.TargetManager.instance().mainTarget();
            const resourceTreeModel = target && target.model(SDK.ResourceTreeModel.ResourceTreeModel);
            frame = resourceTreeModel && resourceTreeModel.mainFrame;
        }
        if (!frame) {
            if (options.frameURL) {
                console.warn('evaluate: there is no frame with URL ' + options.frameURL);
            }
            else {
                console.warn('evaluate: the main frame is not yet available');
            }
            return this.status.E_NOTFOUND(options.frameURL || '<top>');
        }
        // We shouldn't get here if the top frame can't be inspected by an extension, but
        // let's double check for subframes.
        if (!this.canInspectURL(frame.url)) {
            return this.status.E_FAILED('Permission denied');
        }
        let contextSecurityOrigin;
        if (options.useContentScriptContext) {
            contextSecurityOrigin = securityOrigin;
        }
        else if (options.scriptExecutionContext) {
            contextSecurityOrigin = options.scriptExecutionContext;
        }
        const runtimeModel = frame.resourceTreeModel().target().model(SDK.RuntimeModel.RuntimeModel);
        const executionContexts = runtimeModel ? runtimeModel.executionContexts() : [];
        if (contextSecurityOrigin) {
            for (let i = 0; i < executionContexts.length; ++i) {
                const executionContext = executionContexts[i];
                if (executionContext.frameId === frame.id && executionContext.origin === contextSecurityOrigin &&
                    !executionContext.isDefault) {
                    context = executionContext;
                }
            }
            if (!context) {
                console.warn('The JavaScript context ' + contextSecurityOrigin + ' was not found in the frame ' + frame.url);
                return this.status.E_NOTFOUND(contextSecurityOrigin);
            }
        }
        else {
            for (let i = 0; i < executionContexts.length; ++i) {
                const executionContext = executionContexts[i];
                if (executionContext.frameId === frame.id && executionContext.isDefault) {
                    context = executionContext;
                }
            }
            if (!context) {
                return this.status.E_FAILED(frame.url + ' has no execution context');
            }
        }
        if (!this.canInspectURL(context.origin)) {
            return this.status.E_FAILED('Permission denied');
        }
        void context
            .evaluate({
            expression: expression,
            objectGroup: 'extension',
            includeCommandLineAPI: exposeCommandLineAPI,
            silent: true,
            returnByValue: returnByValue,
            generatePreview: false,
        }, 
        /* userGesture */ false, /* awaitPromise */ false)
            .then(onEvaluate);
        function onEvaluate(result) {
            if ('error' in result) {
                callback(result.error, null, false);
                return;
            }
            callback(null, result.object || null, Boolean(result.exceptionDetails));
        }
        return undefined;
    }
    canInspectURL(url) {
        let parsedURL;
        // This is only to work around invalid URLs we're occasionally getting from some tests.
        // TODO(caseq): make sure tests supply valid URLs or we specifically handle invalid ones.
        try {
            parsedURL = new URL(url);
        }
        catch (exception) {
            return false;
        }
        if (kAllowedOrigins.includes(parsedURL.origin)) {
            return true;
        }
        if (parsedURL.protocol === 'chrome:' || parsedURL.protocol === 'devtools:') {
            return false;
        }
        if (parsedURL.protocol.startsWith('http') && parsedURL.hostname === 'chrome.google.com' &&
            parsedURL.pathname.startsWith('/webstore')) {
            return false;
        }
        if ((window.DevToolsAPI && window.DevToolsAPI.getOriginsForbiddenForExtensions &&
            window.DevToolsAPI.getOriginsForbiddenForExtensions() ||
            []).includes(parsedURL.origin)) {
            return false;
        }
        return true;
    }
    disableExtensions() {
        this.extensionsEnabled = false;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["SidebarPaneAdded"] = "SidebarPaneAdded";
    Events["TraceProviderAdded"] = "TraceProviderAdded";
})(Events || (Events = {}));
class ExtensionServerPanelView extends UI.View.SimpleView {
    name;
    panel;
    constructor(name, title, panel) {
        super(title);
        this.name = name;
        this.panel = panel;
    }
    viewId() {
        return this.name;
    }
    widget() {
        return Promise.resolve(this.panel);
    }
}
export class ExtensionStatus {
    OK;
    E_EXISTS;
    E_BADARG;
    E_BADARGTYPE;
    E_NOTFOUND;
    E_NOTSUPPORTED;
    E_PROTOCOLERROR;
    E_FAILED;
    constructor() {
        function makeStatus(code, description, ...details) {
            const status = { code, description, details };
            if (code !== 'OK') {
                status.isError = true;
                console.error('Extension server error: ' + Platform.StringUtilities.sprintf(description, ...details));
            }
            return status;
        }
        this.OK = makeStatus.bind(null, 'OK', 'OK');
        this.E_EXISTS = makeStatus.bind(null, 'E_EXISTS', 'Object already exists: %s');
        this.E_BADARG = makeStatus.bind(null, 'E_BADARG', 'Invalid argument %s: %s');
        this.E_BADARGTYPE = makeStatus.bind(null, 'E_BADARGTYPE', 'Invalid type for argument %s: got %s, expected %s');
        this.E_NOTFOUND = makeStatus.bind(null, 'E_NOTFOUND', 'Object not found: %s');
        this.E_NOTSUPPORTED = makeStatus.bind(null, 'E_NOTSUPPORTED', 'Object does not support requested operation: %s');
        this.E_PROTOCOLERROR = makeStatus.bind(null, 'E_PROTOCOLERROR', 'Inspector protocol error: %s');
        this.E_FAILED = makeStatus.bind(null, 'E_FAILED', 'Operation failed: %s');
    }
}
//# sourceMappingURL=ExtensionServer.js.map