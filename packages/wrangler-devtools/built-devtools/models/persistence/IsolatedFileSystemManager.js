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
import { IsolatedFileSystem } from './IsolatedFileSystem.js';
const UIStrings = {
    /**
    *@description Text in Isolated File System Manager of the Workspace settings in Settings
    *@example {folder does not exist} PH1
    */
    unableToAddFilesystemS: 'Unable to add filesystem: {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('models/persistence/IsolatedFileSystemManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let isolatedFileSystemManagerInstance;
export class IsolatedFileSystemManager extends Common.ObjectWrapper.ObjectWrapper {
    fileSystemsInternal;
    callbacks;
    progresses;
    workspaceFolderExcludePatternSettingInternal;
    fileSystemRequestResolve;
    fileSystemsLoadedPromise;
    constructor() {
        super();
        this.fileSystemsInternal = new Map();
        this.callbacks = new Map();
        this.progresses = new Map();
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.FileSystemRemoved, this.onFileSystemRemoved, this);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.FileSystemAdded, event => {
            this.onFileSystemAdded(event);
        }, this);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved, this.onFileSystemFilesChanged, this);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.IndexingTotalWorkCalculated, this.onIndexingTotalWorkCalculated, this);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.IndexingWorked, this.onIndexingWorked, this);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.IndexingDone, this.onIndexingDone, this);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.SearchCompleted, this.onSearchCompleted, this);
        // Initialize exclude pattern settings
        const defaultCommonExcludedFolders = [
            '/node_modules/',
            '/bower_components/',
            '/\\.devtools',
            '/\\.git/',
            '/\\.sass-cache/',
            '/\\.hg/',
            '/\\.idea/',
            '/\\.svn/',
            '/\\.cache/',
            '/\\.project/',
        ];
        const defaultWinExcludedFolders = ['/Thumbs.db$', '/ehthumbs.db$', '/Desktop.ini$', '/\\$RECYCLE.BIN/'];
        const defaultMacExcludedFolders = [
            '/\\.DS_Store$',
            '/\\.Trashes$',
            '/\\.Spotlight-V100$',
            '/\\.AppleDouble$',
            '/\\.LSOverride$',
            '/Icon$',
            '/\\._.*$',
        ];
        const defaultLinuxExcludedFolders = ['/.*~$'];
        let defaultExcludedFolders = defaultCommonExcludedFolders;
        if (Host.Platform.isWin()) {
            defaultExcludedFolders = defaultExcludedFolders.concat(defaultWinExcludedFolders);
        }
        else if (Host.Platform.isMac()) {
            defaultExcludedFolders = defaultExcludedFolders.concat(defaultMacExcludedFolders);
        }
        else {
            defaultExcludedFolders = defaultExcludedFolders.concat(defaultLinuxExcludedFolders);
        }
        const defaultExcludedFoldersPattern = defaultExcludedFolders.join('|');
        this.workspaceFolderExcludePatternSettingInternal = Common.Settings.Settings.instance().createRegExpSetting('workspaceFolderExcludePattern', defaultExcludedFoldersPattern, Host.Platform.isWin() ? 'i' : '');
        this.fileSystemRequestResolve = null;
        this.fileSystemsLoadedPromise = this.requestFileSystems();
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!isolatedFileSystemManagerInstance || forceNew) {
            isolatedFileSystemManagerInstance = new IsolatedFileSystemManager();
        }
        return isolatedFileSystemManagerInstance;
    }
    requestFileSystems() {
        let fulfill;
        const promise = new Promise(f => {
            fulfill = f;
        });
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.FileSystemsLoaded, onFileSystemsLoaded, this);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.requestFileSystems();
        return promise;
        function onFileSystemsLoaded(event) {
            const fileSystems = event.data;
            const promises = [];
            for (let i = 0; i < fileSystems.length; ++i) {
                promises.push(this.innerAddFileSystem(fileSystems[i], false));
            }
            void Promise.all(promises).then(onFileSystemsAdded);
        }
        function onFileSystemsAdded(fileSystems) {
            fulfill(fileSystems.filter(fs => Boolean(fs)));
        }
    }
    addFileSystem(type) {
        return new Promise(resolve => {
            this.fileSystemRequestResolve = resolve;
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.addFileSystem(type || '');
        });
    }
    removeFileSystem(fileSystem) {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.removeFileSystem(fileSystem.embedderPath());
    }
    waitForFileSystems() {
        return this.fileSystemsLoadedPromise;
    }
    innerAddFileSystem(fileSystem, dispatchEvent) {
        const embedderPath = fileSystem.fileSystemPath;
        const fileSystemURL = Common.ParsedURL.ParsedURL.rawPathToUrlString(fileSystem.fileSystemPath);
        const promise = IsolatedFileSystem.create(this, fileSystemURL, embedderPath, fileSystem.type, fileSystem.fileSystemName, fileSystem.rootURL);
        return promise.then(storeFileSystem.bind(this));
        function storeFileSystem(fileSystem) {
            if (!fileSystem) {
                return null;
            }
            this.fileSystemsInternal.set(fileSystemURL, fileSystem);
            if (dispatchEvent) {
                this.dispatchEventToListeners(Events.FileSystemAdded, fileSystem);
            }
            return fileSystem;
        }
    }
    addPlatformFileSystem(fileSystemURL, fileSystem) {
        this.fileSystemsInternal.set(fileSystemURL, fileSystem);
        this.dispatchEventToListeners(Events.FileSystemAdded, fileSystem);
    }
    onFileSystemAdded(event) {
        const { errorMessage, fileSystem } = event.data;
        if (errorMessage) {
            if (errorMessage !== '<selection cancelled>') {
                Common.Console.Console.instance().error(i18nString(UIStrings.unableToAddFilesystemS, { PH1: errorMessage }));
            }
            if (!this.fileSystemRequestResolve) {
                return;
            }
            this.fileSystemRequestResolve.call(null, null);
            this.fileSystemRequestResolve = null;
        }
        else if (fileSystem) {
            void this.innerAddFileSystem(fileSystem, true).then(fileSystem => {
                if (this.fileSystemRequestResolve) {
                    this.fileSystemRequestResolve.call(null, fileSystem);
                    this.fileSystemRequestResolve = null;
                }
            });
        }
    }
    onFileSystemRemoved(event) {
        const embedderPath = event.data;
        const fileSystemPath = Common.ParsedURL.ParsedURL.rawPathToUrlString(embedderPath);
        const isolatedFileSystem = this.fileSystemsInternal.get(fileSystemPath);
        if (!isolatedFileSystem) {
            return;
        }
        this.fileSystemsInternal.delete(fileSystemPath);
        isolatedFileSystem.fileSystemRemoved();
        this.dispatchEventToListeners(Events.FileSystemRemoved, isolatedFileSystem);
    }
    onFileSystemFilesChanged(event) {
        const urlPaths = {
            changed: groupFilePathsIntoFileSystemPaths.call(this, event.data.changed),
            added: groupFilePathsIntoFileSystemPaths.call(this, event.data.added),
            removed: groupFilePathsIntoFileSystemPaths.call(this, event.data.removed),
        };
        this.dispatchEventToListeners(Events.FileSystemFilesChanged, urlPaths);
        function groupFilePathsIntoFileSystemPaths(embedderPaths) {
            const paths = new Platform.MapUtilities.Multimap();
            for (const embedderPath of embedderPaths) {
                const filePath = Common.ParsedURL.ParsedURL.rawPathToUrlString(embedderPath);
                for (const fileSystemPath of this.fileSystemsInternal.keys()) {
                    const fileSystem = this.fileSystemsInternal.get(fileSystemPath);
                    if (fileSystem &&
                        fileSystem.isFileExcluded(Common.ParsedURL.ParsedURL.rawPathToEncodedPathString(embedderPath))) {
                        continue;
                    }
                    const pathPrefix = fileSystemPath.endsWith('/') ? fileSystemPath : fileSystemPath + '/';
                    if (!filePath.startsWith(pathPrefix)) {
                        continue;
                    }
                    paths.set(fileSystemPath, filePath);
                }
            }
            return paths;
        }
    }
    fileSystems() {
        return [...this.fileSystemsInternal.values()];
    }
    fileSystem(fileSystemPath) {
        return this.fileSystemsInternal.get(fileSystemPath) || null;
    }
    workspaceFolderExcludePatternSetting() {
        return this.workspaceFolderExcludePatternSettingInternal;
    }
    registerCallback(callback) {
        const requestId = ++lastRequestId;
        this.callbacks.set(requestId, callback);
        return requestId;
    }
    registerProgress(progress) {
        const requestId = ++lastRequestId;
        this.progresses.set(requestId, progress);
        return requestId;
    }
    onIndexingTotalWorkCalculated(event) {
        const { requestId, totalWork } = event.data;
        const progress = this.progresses.get(requestId);
        if (!progress) {
            return;
        }
        progress.setTotalWork(totalWork);
    }
    onIndexingWorked(event) {
        const { requestId, worked } = event.data;
        const progress = this.progresses.get(requestId);
        if (!progress) {
            return;
        }
        progress.incrementWorked(worked);
        if (progress.isCanceled()) {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.stopIndexing(requestId);
            this.onIndexingDone(event);
        }
    }
    onIndexingDone(event) {
        const { requestId } = event.data;
        const progress = this.progresses.get(requestId);
        if (!progress) {
            return;
        }
        progress.done();
        this.progresses.delete(requestId);
    }
    onSearchCompleted(event) {
        const { requestId, files } = event.data;
        const callback = this.callbacks.get(requestId);
        if (!callback) {
            return;
        }
        callback.call(null, files);
        this.callbacks.delete(requestId);
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["FileSystemAdded"] = "FileSystemAdded";
    Events["FileSystemRemoved"] = "FileSystemRemoved";
    Events["FileSystemFilesChanged"] = "FileSystemFilesChanged";
    Events["ExcludedFolderAdded"] = "ExcludedFolderAdded";
    Events["ExcludedFolderRemoved"] = "ExcludedFolderRemoved";
})(Events || (Events = {}));
let lastRequestId = 0;
//# sourceMappingURL=IsolatedFileSystemManager.js.map