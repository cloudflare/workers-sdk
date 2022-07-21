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
import { UISourceCode } from './UISourceCode.js';
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum, @typescript-eslint/naming-convention
export var projectTypes;
(function (projectTypes) {
    projectTypes["Debugger"] = "debugger";
    projectTypes["Formatter"] = "formatter";
    projectTypes["Network"] = "network";
    projectTypes["FileSystem"] = "filesystem";
    projectTypes["ContentScripts"] = "contentscripts";
    projectTypes["Service"] = "service";
})(projectTypes || (projectTypes = {}));
export class ProjectStore {
    workspaceInternal;
    idInternal;
    typeInternal;
    displayNameInternal;
    uiSourceCodesMap;
    uiSourceCodesList;
    constructor(workspace, id, type, displayName) {
        this.workspaceInternal = workspace;
        this.idInternal = id;
        this.typeInternal = type;
        this.displayNameInternal = displayName;
        this.uiSourceCodesMap = new Map();
        this.uiSourceCodesList = [];
    }
    id() {
        return this.idInternal;
    }
    type() {
        return this.typeInternal;
    }
    displayName() {
        return this.displayNameInternal;
    }
    workspace() {
        return this.workspaceInternal;
    }
    createUISourceCode(url, contentType) {
        return new UISourceCode(this, url, contentType);
    }
    addUISourceCode(uiSourceCode) {
        const url = uiSourceCode.url();
        if (this.uiSourceCodeForURL(url)) {
            return false;
        }
        this.uiSourceCodesMap.set(url, { uiSourceCode: uiSourceCode, index: this.uiSourceCodesList.length });
        this.uiSourceCodesList.push(uiSourceCode);
        this.workspaceInternal.dispatchEventToListeners(Events.UISourceCodeAdded, uiSourceCode);
        return true;
    }
    removeUISourceCode(url) {
        const uiSourceCode = this.uiSourceCodeForURL(url);
        if (!uiSourceCode) {
            return;
        }
        const entry = this.uiSourceCodesMap.get(url);
        if (!entry) {
            return;
        }
        const movedUISourceCode = this.uiSourceCodesList[this.uiSourceCodesList.length - 1];
        this.uiSourceCodesList[entry.index] = movedUISourceCode;
        const movedEntry = this.uiSourceCodesMap.get(movedUISourceCode.url());
        if (movedEntry) {
            movedEntry.index = entry.index;
        }
        this.uiSourceCodesList.splice(this.uiSourceCodesList.length - 1, 1);
        this.uiSourceCodesMap.delete(url);
        this.workspaceInternal.dispatchEventToListeners(Events.UISourceCodeRemoved, entry.uiSourceCode);
    }
    removeProject() {
        this.workspaceInternal.removeProject(this);
        this.uiSourceCodesMap = new Map();
        this.uiSourceCodesList = [];
    }
    uiSourceCodeForURL(url) {
        const entry = this.uiSourceCodesMap.get(url);
        return entry ? entry.uiSourceCode : null;
    }
    uiSourceCodes() {
        return this.uiSourceCodesList;
    }
    renameUISourceCode(uiSourceCode, newName) {
        const oldPath = uiSourceCode.url();
        const newPath = uiSourceCode.parentURL() ?
            Common.ParsedURL.ParsedURL.urlFromParentUrlAndName(uiSourceCode.parentURL(), newName) :
            Common.ParsedURL.ParsedURL.preEncodeSpecialCharactersInPath(newName);
        const value = this.uiSourceCodesMap.get(oldPath);
        this.uiSourceCodesMap.set(newPath, value);
        this.uiSourceCodesMap.delete(oldPath);
    }
    // No-op implementation for a handfull of interface methods.
    rename(_uiSourceCode, _newName, _callback) {
    }
    excludeFolder(_path) {
    }
    deleteFile(_uiSourceCode) {
    }
    remove() {
    }
    indexContent(_progress) {
    }
}
let workspaceInstance;
export class WorkspaceImpl extends Common.ObjectWrapper.ObjectWrapper {
    projectsInternal;
    hasResourceContentTrackingExtensionsInternal;
    constructor() {
        super();
        this.projectsInternal = new Map();
        this.hasResourceContentTrackingExtensionsInternal = false;
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!workspaceInstance || forceNew) {
            workspaceInstance = new WorkspaceImpl();
        }
        return workspaceInstance;
    }
    static removeInstance() {
        workspaceInstance = undefined;
    }
    uiSourceCode(projectId, url) {
        const project = this.projectsInternal.get(projectId);
        return project ? project.uiSourceCodeForURL(url) : null;
    }
    // This method explicitly awaits the UISourceCode if not yet
    // available.
    uiSourceCodeForURLPromise(url, type) {
        const uiSourceCode = this.uiSourceCodeForURL(url, type);
        if (uiSourceCode) {
            return Promise.resolve(uiSourceCode);
        }
        return new Promise(resolve => {
            const descriptor = this.addEventListener(Events.UISourceCodeAdded, event => {
                const uiSourceCode = event.data;
                if (uiSourceCode.url() === url) {
                    if (!type || type === uiSourceCode.project().type()) {
                        this.removeEventListener(Events.UISourceCodeAdded, descriptor.listener);
                        resolve(uiSourceCode);
                    }
                }
            });
        });
    }
    uiSourceCodeForURL(url, type) {
        for (const project of this.projectsInternal.values()) {
            // For snippets, we may get two different UISourceCodes for the same url (one belonging to
            // the file system project, one belonging to the network project). Allow selecting the UISourceCode
            // for a specific project type.
            if (!type || project.type() === type) {
                const uiSourceCode = project.uiSourceCodeForURL(url);
                if (uiSourceCode) {
                    return uiSourceCode;
                }
            }
        }
        return null;
    }
    uiSourceCodesForProjectType(type) {
        const result = [];
        for (const project of this.projectsInternal.values()) {
            if (project.type() === type) {
                result.push(...project.uiSourceCodes());
            }
        }
        return result;
    }
    addProject(project) {
        console.assert(!this.projectsInternal.has(project.id()), `A project with id ${project.id()} already exists!`);
        this.projectsInternal.set(project.id(), project);
        this.dispatchEventToListeners(Events.ProjectAdded, project);
    }
    removeProject(project) {
        this.projectsInternal.delete(project.id());
        this.dispatchEventToListeners(Events.ProjectRemoved, project);
    }
    project(projectId) {
        return this.projectsInternal.get(projectId) || null;
    }
    projects() {
        return [...this.projectsInternal.values()];
    }
    projectsForType(type) {
        function filterByType(project) {
            return project.type() === type;
        }
        return this.projects().filter(filterByType);
    }
    uiSourceCodes() {
        const result = [];
        for (const project of this.projectsInternal.values()) {
            result.push(...project.uiSourceCodes());
        }
        return result;
    }
    setHasResourceContentTrackingExtensions(hasExtensions) {
        this.hasResourceContentTrackingExtensionsInternal = hasExtensions;
    }
    hasResourceContentTrackingExtensions() {
        return this.hasResourceContentTrackingExtensionsInternal;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["UISourceCodeAdded"] = "UISourceCodeAdded";
    Events["UISourceCodeRemoved"] = "UISourceCodeRemoved";
    Events["UISourceCodeRenamed"] = "UISourceCodeRenamed";
    Events["WorkingCopyChanged"] = "WorkingCopyChanged";
    Events["WorkingCopyCommitted"] = "WorkingCopyCommitted";
    Events["WorkingCopyCommittedByUser"] = "WorkingCopyCommittedByUser";
    Events["ProjectAdded"] = "ProjectAdded";
    Events["ProjectRemoved"] = "ProjectRemoved";
})(Events || (Events = {}));
//# sourceMappingURL=WorkspaceImpl.js.map