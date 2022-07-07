/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { EventDescriptors, Events } from './InspectorFrontendHostAPI.js';
import { streamWrite as resourceLoaderStreamWrite } from './ResourceLoader.js';
const UIStrings = {
    /**
    *@description Document title in Inspector Frontend Host of the DevTools window
    *@example {example.com} PH1
    */
    devtoolsS: 'DevTools - {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('core/host/InspectorFrontendHost.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const MAX_RECORDED_HISTOGRAMS_SIZE = 100;
const OVERRIDES_FILE_SYSTEM_PATH = '/overrides';
export class InspectorFrontendHostStub {
    #urlsBeingSaved;
    events;
    #fileSystem = null;
    recordedEnumeratedHistograms = [];
    recordedPerformanceHistograms = [];
    constructor() {
        function stopEventPropagation(event) {
            // Let browser handle Ctrl+/Ctrl- shortcuts in hosted mode.
            const zoomModifier = this.platform() === 'mac' ? event.metaKey : event.ctrlKey;
            if (zoomModifier && (event.key === '+' || event.key === '-')) {
                event.stopPropagation();
            }
        }
        document.addEventListener('keydown', event => {
            stopEventPropagation.call(this, event);
        }, true);
        this.#urlsBeingSaved = new Map();
    }
    platform() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Windows NT')) {
            return 'windows';
        }
        if (userAgent.includes('Mac OS X')) {
            return 'mac';
        }
        return 'linux';
    }
    loadCompleted() {
    }
    bringToFront() {
    }
    closeWindow() {
    }
    setIsDocked(isDocked, callback) {
        window.setTimeout(callback, 0);
    }
    showSurvey(trigger, callback) {
        window.setTimeout(() => callback({ surveyShown: false }), 0);
    }
    canShowSurvey(trigger, callback) {
        window.setTimeout(() => callback({ canShowSurvey: false }), 0);
    }
    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     */
    setInspectedPageBounds(bounds) {
    }
    inspectElementCompleted() {
    }
    setInjectedScriptForOrigin(origin, script) {
    }
    inspectedURLChanged(url) {
        document.title = i18nString(UIStrings.devtoolsS, { PH1: url.replace(/^https?:\/\//, '') });
    }
    copyText(text) {
        if (text === undefined || text === null) {
            return;
        }
        void navigator.clipboard.writeText(text);
    }
    openInNewTab(url) {
        window.open(url, '_blank');
    }
    showItemInFolder(fileSystemPath) {
        Common.Console.Console.instance().error('Show item in folder is not enabled in hosted mode. Please inspect using chrome://inspect');
    }
    save(url, content, forceSaveAs) {
        let buffer = this.#urlsBeingSaved.get(url);
        if (!buffer) {
            buffer = [];
            this.#urlsBeingSaved.set(url, buffer);
        }
        buffer.push(content);
        this.events.dispatchEventToListeners(Events.SavedURL, { url, fileSystemPath: url });
    }
    append(url, content) {
        const buffer = this.#urlsBeingSaved.get(url);
        if (buffer) {
            buffer.push(content);
            this.events.dispatchEventToListeners(Events.AppendedToURL, url);
        }
    }
    close(url) {
        const buffer = this.#urlsBeingSaved.get(url) || [];
        this.#urlsBeingSaved.delete(url);
        let fileName = '';
        if (url) {
            try {
                const trimmed = Platform.StringUtilities.trimURL(url);
                fileName = Platform.StringUtilities.removeURLFragment(trimmed);
            }
            catch (error) {
                // If url is not a valid URL, it is probably a filename.
                fileName = url;
            }
        }
        const link = document.createElement('a');
        link.download = fileName;
        const blob = new Blob([buffer.join('')], { type: 'text/plain' });
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.click();
        URL.revokeObjectURL(blobUrl);
    }
    sendMessageToBackend(message) {
    }
    recordEnumeratedHistogram(actionName, actionCode, bucketSize) {
        if (this.recordedEnumeratedHistograms.length >= MAX_RECORDED_HISTOGRAMS_SIZE) {
            this.recordedEnumeratedHistograms.shift();
        }
        this.recordedEnumeratedHistograms.push({ actionName, actionCode });
    }
    recordPerformanceHistogram(histogramName, duration) {
        if (this.recordedPerformanceHistograms.length >= MAX_RECORDED_HISTOGRAMS_SIZE) {
            this.recordedPerformanceHistograms.shift();
        }
        this.recordedPerformanceHistograms.push({ histogramName, duration });
    }
    recordUserMetricsAction(umaName) {
    }
    requestFileSystems() {
        this.events.dispatchEventToListeners(Events.FileSystemsLoaded, []);
    }
    addFileSystem(type) {
        const onFileSystem = (fs) => {
            this.#fileSystem = fs;
            const fileSystem = {
                fileSystemName: 'sandboxedRequestedFileSystem',
                fileSystemPath: OVERRIDES_FILE_SYSTEM_PATH,
                rootURL: 'filesystem:devtools://devtools/isolated/',
                type: 'overrides',
            };
            this.events.dispatchEventToListeners(Events.FileSystemAdded, { fileSystem });
        };
        window.webkitRequestFileSystem(window.TEMPORARY, 1024 * 1024, onFileSystem);
    }
    removeFileSystem(fileSystemPath) {
        const removalCallback = (entries) => {
            entries.forEach(entry => {
                if (entry.isDirectory) {
                    entry.removeRecursively(() => { });
                }
                else if (entry.isFile) {
                    entry.remove(() => { });
                }
            });
        };
        if (this.#fileSystem) {
            this.#fileSystem.root.createReader().readEntries(removalCallback);
        }
        this.#fileSystem = null;
        this.events.dispatchEventToListeners(Events.FileSystemRemoved, OVERRIDES_FILE_SYSTEM_PATH);
    }
    isolatedFileSystem(fileSystemId, registeredName) {
        return this.#fileSystem;
    }
    loadNetworkResource(url, headers, streamId, callback) {
        fetch(url)
            .then(result => result.text())
            .then(function (text) {
            resourceLoaderStreamWrite(streamId, text);
            callback({
                statusCode: 200,
                headers: undefined,
                messageOverride: undefined,
                netError: undefined,
                netErrorName: undefined,
                urlValid: undefined,
            });
        })
            .catch(function () {
            callback({
                statusCode: 404,
                headers: undefined,
                messageOverride: undefined,
                netError: undefined,
                netErrorName: undefined,
                urlValid: undefined,
            });
        });
    }
    registerPreference(name, options) {
    }
    getPreferences(callback) {
        const prefs = {};
        for (const name in window.localStorage) {
            prefs[name] = window.localStorage[name];
        }
        callback(prefs);
    }
    getPreference(name, callback) {
        callback(window.localStorage[name]);
    }
    setPreference(name, value) {
        window.localStorage[name] = value;
    }
    removePreference(name) {
        delete window.localStorage[name];
    }
    clearPreferences() {
        window.localStorage.clear();
    }
    getSyncInformation(callback) {
        callback({
            isSyncActive: false,
            arePreferencesSynced: false,
        });
    }
    upgradeDraggedFileSystemPermissions(fileSystem) {
    }
    indexPath(requestId, fileSystemPath, excludedFolders) {
    }
    stopIndexing(requestId) {
    }
    searchInPath(requestId, fileSystemPath, query) {
    }
    zoomFactor() {
        return 1;
    }
    zoomIn() {
    }
    zoomOut() {
    }
    resetZoom() {
    }
    setWhitelistedShortcuts(shortcuts) {
    }
    setEyeDropperActive(active) {
    }
    showCertificateViewer(certChain) {
    }
    reattach(callback) {
    }
    readyForTest() {
    }
    connectionReady() {
    }
    setOpenNewWindowForPopups(value) {
    }
    setDevicesDiscoveryConfig(config) {
    }
    setDevicesUpdatesEnabled(enabled) {
    }
    performActionOnRemotePage(pageId, action) {
    }
    openRemotePage(browserId, url) {
    }
    openNodeFrontend() {
    }
    showContextMenuAtPoint(x, y, items, document) {
        throw 'Soft context menu should be used';
    }
    isHostedMode() {
        return true;
    }
    setAddExtensionCallback(callback) {
        // Extensions are not supported in hosted mode.
    }
    async initialTargetId() {
        return null;
    }
}
// @ts-ignore Global injected by devtools-compatibility.js
// eslint-disable-next-line @typescript-eslint/naming-convention
export let InspectorFrontendHostInstance = window.InspectorFrontendHost;
class InspectorFrontendAPIImpl {
    constructor() {
        for (const descriptor of EventDescriptors) {
            // @ts-ignore Dispatcher magic
            this[descriptor[1]] = this.dispatch.bind(this, descriptor[0], descriptor[2], descriptor[3]);
        }
    }
    dispatch(name, signature, runOnceLoaded, ...params) {
        // Single argument methods get dispatched with the param.
        if (signature.length < 2) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                InspectorFrontendHostInstance.events.dispatchEventToListeners(name, params[0]);
            }
            catch (error) {
                console.error(error + ' ' + error.stack);
            }
            return;
        }
        const data = {};
        for (let i = 0; i < signature.length; ++i) {
            data[signature[i]] = params[i];
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            InspectorFrontendHostInstance.events.dispatchEventToListeners(name, data);
        }
        catch (error) {
            console.error(error + ' ' + error.stack);
        }
    }
    streamWrite(id, chunk) {
        resourceLoaderStreamWrite(id, chunk);
    }
}
(function () {
    function initializeInspectorFrontendHost() {
        let proto;
        if (!InspectorFrontendHostInstance) {
            // Instantiate stub for web-hosted mode if necessary.
            // @ts-ignore Global injected by devtools-compatibility.js
            window.InspectorFrontendHost = InspectorFrontendHostInstance = new InspectorFrontendHostStub();
        }
        else {
            // Otherwise add stubs for missing methods that are declared in the interface.
            proto = InspectorFrontendHostStub.prototype;
            for (const name of Object.getOwnPropertyNames(proto)) {
                // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
                // @ts-expect-error
                const stub = proto[name];
                // @ts-ignore Global injected by devtools-compatibility.js
                if (typeof stub !== 'function' || InspectorFrontendHostInstance[name]) {
                    continue;
                }
                console.error(`Incompatible embedder: method Host.InspectorFrontendHost.${name} is missing. Using stub instead.`);
                // @ts-ignore Global injected by devtools-compatibility.js
                InspectorFrontendHostInstance[name] = stub;
            }
        }
        // Attach the events object.
        InspectorFrontendHostInstance.events = new Common.ObjectWrapper.ObjectWrapper();
    }
    // FIXME: This file is included into both apps, since the devtools_app needs the InspectorFrontendHostAPI only,
    // so the host instance should not be initialized there.
    initializeInspectorFrontendHost();
    // @ts-ignore Global injected by devtools-compatibility.js
    window.InspectorFrontendAPI = new InspectorFrontendAPIImpl();
})();
export function isUnderTest(prefs) {
    // Integration tests rely on test queryParam.
    if (Root.Runtime.Runtime.queryParam('test')) {
        return true;
    }
    // Browser tests rely on prefs.
    if (prefs) {
        return prefs['isUnderTest'] === 'true';
    }
    return Common.Settings.Settings.hasInstance() &&
        Common.Settings.Settings.instance().createSetting('isUnderTest', false).get();
}
//# sourceMappingURL=InspectorFrontendHost.js.map