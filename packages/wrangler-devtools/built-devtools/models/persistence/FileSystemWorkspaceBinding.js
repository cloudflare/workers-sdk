/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
import * as Platform from '../../core/platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { Events } from './IsolatedFileSystemManager.js';
export class FileSystemWorkspaceBinding {
    isolatedFileSystemManager;
    workspace;
    eventListeners;
    boundFileSystems;
    constructor(isolatedFileSystemManager, workspace) {
        this.isolatedFileSystemManager = isolatedFileSystemManager;
        this.workspace = workspace;
        this.eventListeners = [
            this.isolatedFileSystemManager.addEventListener(Events.FileSystemAdded, this.onFileSystemAdded, this),
            this.isolatedFileSystemManager.addEventListener(Events.FileSystemRemoved, this.onFileSystemRemoved, this),
            this.isolatedFileSystemManager.addEventListener(Events.FileSystemFilesChanged, this.fileSystemFilesChanged, this),
        ];
        this.boundFileSystems = new Map();
        void this.isolatedFileSystemManager.waitForFileSystems().then(this.onFileSystemsLoaded.bind(this));
    }
    static projectId(fileSystemPath) {
        return fileSystemPath;
    }
    static relativePath(uiSourceCode) {
        const baseURL = uiSourceCode.project().fileSystemBaseURL;
        return Common.ParsedURL.ParsedURL.split(Common.ParsedURL.ParsedURL.sliceUrlToEncodedPathString(uiSourceCode.url(), baseURL.length), '/');
    }
    static tooltipForUISourceCode(uiSourceCode) {
        const fileSystem = uiSourceCode.project().fileSystemInternal;
        return fileSystem.tooltipForURL(uiSourceCode.url());
    }
    static fileSystemType(project) {
        const fileSystem = project.fileSystemInternal;
        return fileSystem.type();
    }
    static fileSystemSupportsAutomapping(project) {
        const fileSystem = project.fileSystemInternal;
        return fileSystem.supportsAutomapping();
    }
    static completeURL(project, relativePath) {
        const fsProject = project;
        return Common.ParsedURL.ParsedURL.concatenate(fsProject.fileSystemBaseURL, relativePath);
    }
    static fileSystemPath(projectId) {
        return projectId;
    }
    fileSystemManager() {
        return this.isolatedFileSystemManager;
    }
    onFileSystemsLoaded(fileSystems) {
        for (const fileSystem of fileSystems) {
            this.addFileSystem(fileSystem);
        }
    }
    onFileSystemAdded(event) {
        const fileSystem = event.data;
        this.addFileSystem(fileSystem);
    }
    addFileSystem(fileSystem) {
        const boundFileSystem = new FileSystem(this, fileSystem, this.workspace);
        this.boundFileSystems.set(fileSystem.path(), boundFileSystem);
    }
    onFileSystemRemoved(event) {
        const fileSystem = event.data;
        const boundFileSystem = this.boundFileSystems.get(fileSystem.path());
        if (boundFileSystem) {
            boundFileSystem.dispose();
        }
        this.boundFileSystems.delete(fileSystem.path());
    }
    fileSystemFilesChanged(event) {
        const paths = event.data;
        for (const fileSystemPath of paths.changed.keysArray()) {
            const fileSystem = this.boundFileSystems.get(fileSystemPath);
            if (!fileSystem) {
                continue;
            }
            paths.changed.get(fileSystemPath).forEach(path => fileSystem.fileChanged(path));
        }
        for (const fileSystemPath of paths.added.keysArray()) {
            const fileSystem = this.boundFileSystems.get(fileSystemPath);
            if (!fileSystem) {
                continue;
            }
            paths.added.get(fileSystemPath).forEach(path => fileSystem.fileChanged(path));
        }
        for (const fileSystemPath of paths.removed.keysArray()) {
            const fileSystem = this.boundFileSystems.get(fileSystemPath);
            if (!fileSystem) {
                continue;
            }
            paths.removed.get(fileSystemPath).forEach(path => fileSystem.removeUISourceCode(path));
        }
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.eventListeners);
        for (const fileSystem of this.boundFileSystems.values()) {
            fileSystem.dispose();
            this.boundFileSystems.delete(fileSystem.fileSystemInternal.path());
        }
    }
}
export class FileSystem extends Workspace.Workspace.ProjectStore {
    fileSystemInternal;
    fileSystemBaseURL;
    fileSystemParentURL;
    fileSystemWorkspaceBinding;
    fileSystemPathInternal;
    creatingFilesGuard;
    constructor(fileSystemWorkspaceBinding, isolatedFileSystem, workspace) {
        const fileSystemPath = isolatedFileSystem.path();
        const id = FileSystemWorkspaceBinding.projectId(fileSystemPath);
        console.assert(!workspace.project(id));
        const displayName = fileSystemPath.substr(fileSystemPath.lastIndexOf('/') + 1);
        super(workspace, id, Workspace.Workspace.projectTypes.FileSystem, displayName);
        this.fileSystemInternal = isolatedFileSystem;
        this.fileSystemBaseURL = Common.ParsedURL.ParsedURL.concatenate(this.fileSystemInternal.path(), '/');
        this.fileSystemParentURL =
            Common.ParsedURL.ParsedURL.substr(this.fileSystemBaseURL, 0, fileSystemPath.lastIndexOf('/') + 1);
        this.fileSystemWorkspaceBinding = fileSystemWorkspaceBinding;
        this.fileSystemPathInternal = fileSystemPath;
        this.creatingFilesGuard = new Set();
        workspace.addProject(this);
        this.populate();
    }
    fileSystemPath() {
        return this.fileSystemPathInternal;
    }
    fileSystem() {
        return this.fileSystemInternal;
    }
    mimeType(uiSourceCode) {
        return this.fileSystemInternal.mimeFromPath(uiSourceCode.url());
    }
    initialGitFolders() {
        return this.fileSystemInternal.initialGitFolders().map(folder => Common.ParsedURL.ParsedURL.concatenate(this.fileSystemPathInternal, '/', folder));
    }
    filePathForUISourceCode(uiSourceCode) {
        return Common.ParsedURL.ParsedURL.sliceUrlToEncodedPathString(uiSourceCode.url(), this.fileSystemPathInternal.length);
    }
    isServiceProject() {
        return false;
    }
    requestMetadata(uiSourceCode) {
        const metadata = sourceCodeToMetadataMap.get(uiSourceCode);
        if (metadata) {
            return metadata;
        }
        const relativePath = this.filePathForUISourceCode(uiSourceCode);
        const promise = this.fileSystemInternal.getMetadata(relativePath).then(onMetadata);
        sourceCodeToMetadataMap.set(uiSourceCode, promise);
        return promise;
        function onMetadata(metadata) {
            if (!metadata) {
                return null;
            }
            return new Workspace.UISourceCode.UISourceCodeMetadata(metadata.modificationTime, metadata.size);
        }
    }
    requestFileBlob(uiSourceCode) {
        return this.fileSystemInternal.requestFileBlob(this.filePathForUISourceCode(uiSourceCode));
    }
    requestFileContent(uiSourceCode) {
        const filePath = this.filePathForUISourceCode(uiSourceCode);
        return this.fileSystemInternal.requestFileContent(filePath);
    }
    canSetFileContent() {
        return true;
    }
    async setFileContent(uiSourceCode, newContent, isBase64) {
        const filePath = this.filePathForUISourceCode(uiSourceCode);
        await this.fileSystemInternal.setFileContent(filePath, newContent, isBase64);
    }
    fullDisplayName(uiSourceCode) {
        const baseURL = uiSourceCode.project().fileSystemParentURL;
        return uiSourceCode.url().substring(baseURL.length);
    }
    canRename() {
        return true;
    }
    rename(uiSourceCode, newName, callback) {
        if (newName === uiSourceCode.name()) {
            callback(true, uiSourceCode.name(), uiSourceCode.url(), uiSourceCode.contentType());
            return;
        }
        let filePath = this.filePathForUISourceCode(uiSourceCode);
        this.fileSystemInternal.renameFile(filePath, newName, innerCallback.bind(this));
        function innerCallback(success, newName) {
            if (!success || !newName) {
                callback(false, newName);
                return;
            }
            console.assert(Boolean(newName));
            const slash = filePath.lastIndexOf('/');
            const parentPath = Common.ParsedURL.ParsedURL.substr(filePath, 0, slash);
            filePath = Common.ParsedURL.ParsedURL.encodedFromParentPathAndName(parentPath, newName);
            filePath = Common.ParsedURL.ParsedURL.substr(filePath, 1);
            const newURL = Common.ParsedURL.ParsedURL.concatenate(this.fileSystemBaseURL, filePath);
            const newContentType = this.fileSystemInternal.contentType(newName);
            this.renameUISourceCode(uiSourceCode, newName);
            callback(true, newName, newURL, newContentType);
        }
    }
    async searchInFileContent(uiSourceCode, query, caseSensitive, isRegex) {
        const filePath = this.filePathForUISourceCode(uiSourceCode);
        const { content } = await this.fileSystemInternal.requestFileContent(filePath);
        if (content) {
            return TextUtils.TextUtils.performSearchInContent(content, query, caseSensitive, isRegex);
        }
        return [];
    }
    async findFilesMatchingSearchRequest(searchConfig, filesMatchingFileQuery, progress) {
        let result = filesMatchingFileQuery;
        const queriesToRun = searchConfig.queries().slice();
        if (!queriesToRun.length) {
            queriesToRun.push('');
        }
        progress.setTotalWork(queriesToRun.length);
        for (const query of queriesToRun) {
            const files = await this.fileSystemInternal.searchInPath(searchConfig.isRegex() ? '' : query, progress);
            files.sort(Platform.StringUtilities.naturalOrderComparator);
            result = Platform.ArrayUtilities.intersectOrdered(result, files, Platform.StringUtilities.naturalOrderComparator);
            progress.incrementWorked(1);
        }
        progress.done();
        return result;
    }
    indexContent(progress) {
        this.fileSystemInternal.indexContent(progress);
    }
    populate() {
        const chunkSize = 1000;
        const filePaths = this.fileSystemInternal.initialFilePaths();
        reportFileChunk.call(this, 0);
        function reportFileChunk(from) {
            const to = Math.min(from + chunkSize, filePaths.length);
            for (let i = from; i < to; ++i) {
                this.addFile(filePaths[i]);
            }
            if (to < filePaths.length) {
                window.setTimeout(reportFileChunk.bind(this, to), 100);
            }
        }
    }
    excludeFolder(url) {
        let relativeFolder = Common.ParsedURL.ParsedURL.sliceUrlToEncodedPathString(url, this.fileSystemBaseURL.length);
        if (!relativeFolder.startsWith('/')) {
            relativeFolder = Common.ParsedURL.ParsedURL.prepend('/', relativeFolder);
        }
        if (!relativeFolder.endsWith('/')) {
            relativeFolder = Common.ParsedURL.ParsedURL.concatenate(relativeFolder, '/');
        }
        this.fileSystemInternal.addExcludedFolder(relativeFolder);
        const uiSourceCodes = this.uiSourceCodes().slice();
        for (let i = 0; i < uiSourceCodes.length; ++i) {
            const uiSourceCode = uiSourceCodes[i];
            if (uiSourceCode.url().startsWith(url)) {
                this.removeUISourceCode(uiSourceCode.url());
            }
        }
    }
    canExcludeFolder(path) {
        return this.fileSystemInternal.canExcludeFolder(path);
    }
    canCreateFile() {
        return true;
    }
    async createFile(path, name, content, isBase64) {
        const guardFileName = this.fileSystemPathInternal + path + (!path.endsWith('/') ? '/' : '') + name;
        this.creatingFilesGuard.add(guardFileName);
        const filePath = await this.fileSystemInternal.createFile(path, name);
        if (!filePath) {
            return null;
        }
        const uiSourceCode = this.addFile(filePath);
        uiSourceCode.setContent(content, Boolean(isBase64));
        this.creatingFilesGuard.delete(guardFileName);
        return uiSourceCode;
    }
    deleteFile(uiSourceCode) {
        const relativePath = this.filePathForUISourceCode(uiSourceCode);
        void this.fileSystemInternal.deleteFile(relativePath).then(success => {
            if (success) {
                this.removeUISourceCode(uiSourceCode.url());
            }
        });
    }
    remove() {
        this.fileSystemWorkspaceBinding.isolatedFileSystemManager.removeFileSystem(this.fileSystemInternal);
    }
    addFile(filePath) {
        const contentType = this.fileSystemInternal.contentType(filePath);
        const uiSourceCode = this.createUISourceCode(Common.ParsedURL.ParsedURL.concatenate(this.fileSystemBaseURL, filePath), contentType);
        this.addUISourceCode(uiSourceCode);
        return uiSourceCode;
    }
    fileChanged(path) {
        // Ignore files that are being created but do not have content yet.
        if (this.creatingFilesGuard.has(path)) {
            return;
        }
        const uiSourceCode = this.uiSourceCodeForURL(path);
        if (!uiSourceCode) {
            const contentType = this.fileSystemInternal.contentType(path);
            this.addUISourceCode(this.createUISourceCode(path, contentType));
            return;
        }
        sourceCodeToMetadataMap.delete(uiSourceCode);
        void uiSourceCode.checkContentUpdated();
    }
    tooltipForURL(url) {
        return this.fileSystemInternal.tooltipForURL(url);
    }
    dispose() {
        this.removeProject();
    }
}
const sourceCodeToMetadataMap = new WeakMap();
//# sourceMappingURL=FileSystemWorkspaceBinding.js.map