// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Diff from '../../third_party/diff/diff.js';
import * as FormatterModule from '../formatter/formatter.js';
import * as Persistence from '../persistence/persistence.js';
import * as Workspace from '../workspace/workspace.js';
export class WorkspaceDiffImpl extends Common.ObjectWrapper.ObjectWrapper {
    uiSourceCodeDiffs;
    loadingUISourceCodes;
    modifiedUISourceCodesInternal;
    constructor(workspace) {
        super();
        this.uiSourceCodeDiffs = new WeakMap();
        this.loadingUISourceCodes = new Map();
        this.modifiedUISourceCodesInternal = new Set();
        workspace.addEventListener(Workspace.Workspace.Events.WorkingCopyChanged, this.uiSourceCodeChanged, this);
        workspace.addEventListener(Workspace.Workspace.Events.WorkingCopyCommitted, this.uiSourceCodeChanged, this);
        workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this.uiSourceCodeAdded, this);
        workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeRemoved, this.uiSourceCodeRemoved, this);
        workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, this.projectRemoved, this);
        workspace.uiSourceCodes().forEach(this.updateModifiedState.bind(this));
    }
    requestDiff(uiSourceCode, diffRequestOptions) {
        return this.uiSourceCodeDiff(uiSourceCode).requestDiff(diffRequestOptions);
    }
    subscribeToDiffChange(uiSourceCode, callback, thisObj) {
        this.uiSourceCodeDiff(uiSourceCode).addEventListener(UISourceCodeDiffEvents.DiffChanged, callback, thisObj);
    }
    unsubscribeFromDiffChange(uiSourceCode, callback, thisObj) {
        this.uiSourceCodeDiff(uiSourceCode).removeEventListener(UISourceCodeDiffEvents.DiffChanged, callback, thisObj);
    }
    modifiedUISourceCodes() {
        return Array.from(this.modifiedUISourceCodesInternal);
    }
    isUISourceCodeModified(uiSourceCode) {
        return this.modifiedUISourceCodesInternal.has(uiSourceCode) || this.loadingUISourceCodes.has(uiSourceCode);
    }
    uiSourceCodeDiff(uiSourceCode) {
        let diff = this.uiSourceCodeDiffs.get(uiSourceCode);
        if (!diff) {
            diff = new UISourceCodeDiff(uiSourceCode);
            this.uiSourceCodeDiffs.set(uiSourceCode, diff);
        }
        return diff;
    }
    uiSourceCodeChanged(event) {
        const uiSourceCode = event.data.uiSourceCode;
        void this.updateModifiedState(uiSourceCode);
    }
    uiSourceCodeAdded(event) {
        const uiSourceCode = event.data;
        void this.updateModifiedState(uiSourceCode);
    }
    uiSourceCodeRemoved(event) {
        const uiSourceCode = event.data;
        this.removeUISourceCode(uiSourceCode);
    }
    projectRemoved(event) {
        const project = event.data;
        for (const uiSourceCode of project.uiSourceCodes()) {
            this.removeUISourceCode(uiSourceCode);
        }
    }
    removeUISourceCode(uiSourceCode) {
        this.loadingUISourceCodes.delete(uiSourceCode);
        const uiSourceCodeDiff = this.uiSourceCodeDiffs.get(uiSourceCode);
        if (uiSourceCodeDiff) {
            uiSourceCodeDiff.dispose = true;
        }
        this.markAsUnmodified(uiSourceCode);
    }
    markAsUnmodified(uiSourceCode) {
        this.uiSourceCodeProcessedForTest();
        if (this.modifiedUISourceCodesInternal.delete(uiSourceCode)) {
            this.dispatchEventToListeners("ModifiedStatusChanged" /* ModifiedStatusChanged */, { uiSourceCode, isModified: false });
        }
    }
    markAsModified(uiSourceCode) {
        this.uiSourceCodeProcessedForTest();
        if (this.modifiedUISourceCodesInternal.has(uiSourceCode)) {
            return;
        }
        this.modifiedUISourceCodesInternal.add(uiSourceCode);
        this.dispatchEventToListeners("ModifiedStatusChanged" /* ModifiedStatusChanged */, { uiSourceCode, isModified: true });
    }
    uiSourceCodeProcessedForTest() {
    }
    async updateModifiedState(uiSourceCode) {
        this.loadingUISourceCodes.delete(uiSourceCode);
        if (uiSourceCode.project().type() !== Workspace.Workspace.projectTypes.Network) {
            this.markAsUnmodified(uiSourceCode);
            return;
        }
        if (uiSourceCode.isDirty()) {
            this.markAsModified(uiSourceCode);
            return;
        }
        if (!uiSourceCode.hasCommits()) {
            this.markAsUnmodified(uiSourceCode);
            return;
        }
        const contentsPromise = Promise.all([
            this.requestOriginalContentForUISourceCode(uiSourceCode),
            uiSourceCode.requestContent().then(deferredContent => deferredContent.content),
        ]);
        this.loadingUISourceCodes.set(uiSourceCode, contentsPromise);
        const contents = await contentsPromise;
        if (this.loadingUISourceCodes.get(uiSourceCode) !== contentsPromise) {
            return;
        }
        this.loadingUISourceCodes.delete(uiSourceCode);
        if (contents[0] !== null && contents[1] !== null && contents[0] !== contents[1]) {
            this.markAsModified(uiSourceCode);
        }
        else {
            this.markAsUnmodified(uiSourceCode);
        }
    }
    requestOriginalContentForUISourceCode(uiSourceCode) {
        return this.uiSourceCodeDiff(uiSourceCode).originalContent();
    }
    revertToOriginal(uiSourceCode) {
        function callback(content) {
            if (typeof content !== 'string') {
                return;
            }
            uiSourceCode.addRevision(content);
        }
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.RevisionApplied);
        return this.requestOriginalContentForUISourceCode(uiSourceCode).then(callback);
    }
}
export class UISourceCodeDiff extends Common.ObjectWrapper.ObjectWrapper {
    uiSourceCode;
    requestDiffPromise;
    pendingChanges;
    dispose;
    constructor(uiSourceCode) {
        super();
        this.uiSourceCode = uiSourceCode;
        uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.uiSourceCodeChanged, this);
        uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.uiSourceCodeChanged, this);
        this.requestDiffPromise = null;
        this.pendingChanges = null;
        this.dispose = false;
    }
    uiSourceCodeChanged() {
        if (this.pendingChanges) {
            clearTimeout(this.pendingChanges);
            this.pendingChanges = null;
        }
        this.requestDiffPromise = null;
        const content = this.uiSourceCode.content();
        const delay = (!content || content.length < 65536) ? 0 : UpdateTimeout;
        this.pendingChanges = window.setTimeout(emitDiffChanged.bind(this), delay);
        function emitDiffChanged() {
            if (this.dispose) {
                return;
            }
            this.dispatchEventToListeners(UISourceCodeDiffEvents.DiffChanged);
            this.pendingChanges = null;
        }
    }
    requestDiff(diffRequestOptions) {
        if (!this.requestDiffPromise) {
            this.requestDiffPromise = this.innerRequestDiff(diffRequestOptions);
        }
        return this.requestDiffPromise;
    }
    async originalContent() {
        const originalNetworkContent = Persistence.NetworkPersistenceManager.NetworkPersistenceManager.instance().originalContentForUISourceCode(this.uiSourceCode);
        if (originalNetworkContent) {
            return originalNetworkContent;
        }
        const content = await this.uiSourceCode.project().requestFileContent(this.uiSourceCode);
        return content.content || ('error' in content && content.error) || '';
    }
    async innerRequestDiff({ shouldFormatDiff }) {
        if (this.dispose) {
            return null;
        }
        let baseline = await this.originalContent();
        if (baseline === null) {
            return null;
        }
        if (baseline.length > 1024 * 1024) {
            return null;
        }
        // ------------ ASYNC ------------
        if (this.dispose) {
            return null;
        }
        let current = this.uiSourceCode.workingCopy();
        if (!current && !this.uiSourceCode.contentLoaded()) {
            current = (await this.uiSourceCode.requestContent()).content;
        }
        if (current.length > 1024 * 1024) {
            return null;
        }
        if (this.dispose) {
            return null;
        }
        if (current === null || baseline === null) {
            return null;
        }
        let formattedCurrentMapping;
        if (shouldFormatDiff) {
            baseline = (await FormatterModule.ScriptFormatter.format(this.uiSourceCode.contentType(), this.uiSourceCode.mimeType(), baseline))
                .formattedContent;
            const formatCurrentResult = await FormatterModule.ScriptFormatter.format(this.uiSourceCode.contentType(), this.uiSourceCode.mimeType(), current);
            current = formatCurrentResult.formattedContent;
            formattedCurrentMapping = formatCurrentResult.formattedMapping;
        }
        const reNewline = /\r\n?|\n/;
        const diff = Diff.Diff.DiffWrapper.lineDiff(baseline.split(reNewline), current.split(reNewline));
        return {
            diff,
            formattedCurrentMapping,
        };
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var UISourceCodeDiffEvents;
(function (UISourceCodeDiffEvents) {
    UISourceCodeDiffEvents["DiffChanged"] = "DiffChanged";
})(UISourceCodeDiffEvents || (UISourceCodeDiffEvents = {}));
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
let _instance = null;
export function workspaceDiff() {
    if (!_instance) {
        _instance = new WorkspaceDiffImpl(Workspace.Workspace.WorkspaceImpl.instance());
    }
    return _instance;
}
export class DiffUILocation {
    uiSourceCode;
    constructor(uiSourceCode) {
        this.uiSourceCode = uiSourceCode;
    }
}
export const UpdateTimeout = 200;
//# sourceMappingURL=WorkspaceDiff.js.map