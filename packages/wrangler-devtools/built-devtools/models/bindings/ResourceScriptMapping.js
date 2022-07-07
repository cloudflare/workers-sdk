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
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import { BreakpointManager } from './BreakpointManager.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
import { metadataForURL } from './ResourceUtils.js';
const UIStrings = {
    /**
    *@description Error text displayed in the console when editing a live script fails. LiveEdit is
    *the name of the feature for editing code that is already running.
    *@example {warning} PH1
    */
    liveEditFailed: '`LiveEdit` failed: {PH1}',
    /**
    *@description Error text displayed in the console when compiling a live-edited script fails. LiveEdit is
    *the name of the feature for editing code that is already running.
    *@example {connection lost} PH1
    */
    liveEditCompileFailed: '`LiveEdit` compile failed: {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('models/bindings/ResourceScriptMapping.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ResourceScriptMapping {
    debuggerModel;
    #workspace;
    debuggerWorkspaceBinding;
    #uiSourceCodeToScriptFile;
    #projects;
    #scriptToUISourceCode;
    #eventListeners;
    constructor(debuggerModel, workspace, debuggerWorkspaceBinding) {
        this.debuggerModel = debuggerModel;
        this.#workspace = workspace;
        this.debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.#uiSourceCodeToScriptFile = new Map();
        this.#projects = new Map();
        this.#scriptToUISourceCode = new Map();
        const runtimeModel = debuggerModel.runtimeModel();
        this.#eventListeners = [
            this.debuggerModel.addEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, event => this.addScript(event.data), this),
            this.debuggerModel.addEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this.globalObjectCleared, this),
            runtimeModel.addEventListener(SDK.RuntimeModel.Events.ExecutionContextDestroyed, this.executionContextDestroyed, this),
            runtimeModel.target().targetManager().addEventListener(SDK.TargetManager.Events.InspectedURLChanged, this.inspectedURLChanged, this),
        ];
    }
    static resolveRelativeSourceURL(script, url) {
        let target = script.debuggerModel.target();
        while (target && target.type() !== SDK.Target.Type.Frame) {
            target = target.parentTarget();
        }
        const baseURL = target?.inspectedURL() ?? Platform.DevToolsPath.EmptyUrlString;
        url = Common.ParsedURL.ParsedURL.completeURL(baseURL, url) ?? url;
        return url;
    }
    project(script) {
        const prefix = script.isContentScript() ? 'js:extensions:' : 'js::';
        const projectId = prefix + this.debuggerModel.target().id() + ':' + script.frameId;
        let project = this.#projects.get(projectId);
        if (!project) {
            const projectType = script.isContentScript() ? Workspace.Workspace.projectTypes.ContentScripts :
                Workspace.Workspace.projectTypes.Network;
            project = new ContentProviderBasedProject(this.#workspace, projectId, projectType, '' /* displayName */, false /* isServiceProject */);
            NetworkProject.setTargetForProject(project, this.debuggerModel.target());
            this.#projects.set(projectId, project);
        }
        return project;
    }
    rawLocationToUILocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const uiSourceCode = this.#scriptToUISourceCode.get(script);
        if (!uiSourceCode) {
            return null;
        }
        const scriptFile = this.#uiSourceCodeToScriptFile.get(uiSourceCode);
        if (!scriptFile) {
            return null;
        }
        if ((scriptFile.hasDivergedFromVM() && !scriptFile.isMergingToVM()) || scriptFile.isDivergingFromVM()) {
            return null;
        }
        if (!scriptFile.hasScripts([script])) {
            return null;
        }
        const { lineNumber, columnNumber = 0 } = rawLocation;
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const scriptFile = this.#uiSourceCodeToScriptFile.get(uiSourceCode);
        if (!scriptFile) {
            return [];
        }
        const { script } = scriptFile;
        if (!script) {
            return [];
        }
        return [this.debuggerModel.createRawLocation(script, lineNumber, columnNumber)];
    }
    inspectedURLChanged(event) {
        for (let target = this.debuggerModel.target(); target !== event.data; target = target.parentTarget()) {
            if (target === null) {
                return;
            }
        }
        // Just remove and readd all scripts to ensure their URLs are reflected correctly.
        for (const script of Array.from(this.#scriptToUISourceCode.keys())) {
            this.removeScript(script);
            this.addScript(script);
        }
    }
    addScript(script) {
        // Ignore live edit scripts here.
        if (script.isLiveEdit()) {
            return;
        }
        let url = script.sourceURL;
        if (!url) {
            return;
        }
        if (script.hasSourceURL) {
            // Try to resolve `//# sourceURL=` annotations relative to
            // the base URL, according to the sourcemap specification.
            url = ResourceScriptMapping.resolveRelativeSourceURL(script, url);
        }
        else {
            // Ignore inline <script>s without `//# sourceURL` annotation here.
            if (script.isInlineScript()) {
                return;
            }
            // Filter out embedder injected content scripts.
            if (script.isContentScript()) {
                const parsedURL = new Common.ParsedURL.ParsedURL(url);
                if (!parsedURL.isValid) {
                    return;
                }
            }
        }
        // Remove previous UISourceCode, if any
        const project = this.project(script);
        const oldUISourceCode = project.uiSourceCodeForURL(url);
        if (oldUISourceCode) {
            const oldScriptFile = this.#uiSourceCodeToScriptFile.get(oldUISourceCode);
            if (oldScriptFile && oldScriptFile.script) {
                this.removeScript(oldScriptFile.script);
            }
        }
        // Create UISourceCode.
        const originalContentProvider = script.originalContentProvider();
        const uiSourceCode = project.createUISourceCode(url, originalContentProvider.contentType());
        NetworkProject.setInitialFrameAttribution(uiSourceCode, script.frameId);
        const metadata = metadataForURL(this.debuggerModel.target(), script.frameId, url);
        // Bind UISourceCode to scripts.
        const scriptFile = new ResourceScriptFile(this, uiSourceCode, [script]);
        this.#uiSourceCodeToScriptFile.set(uiSourceCode, scriptFile);
        this.#scriptToUISourceCode.set(script, uiSourceCode);
        const mimeType = script.isWasm() ? 'application/wasm' : 'text/javascript';
        project.addUISourceCodeWithProvider(uiSourceCode, originalContentProvider, metadata, mimeType);
        void this.debuggerWorkspaceBinding.updateLocations(script);
    }
    scriptFile(uiSourceCode) {
        return this.#uiSourceCodeToScriptFile.get(uiSourceCode) || null;
    }
    removeScript(script) {
        const uiSourceCode = this.#scriptToUISourceCode.get(script);
        if (!uiSourceCode) {
            return;
        }
        const scriptFile = this.#uiSourceCodeToScriptFile.get(uiSourceCode);
        if (scriptFile) {
            scriptFile.dispose();
        }
        this.#uiSourceCodeToScriptFile.delete(uiSourceCode);
        this.#scriptToUISourceCode.delete(script);
        const project = uiSourceCode.project();
        project.removeFile(uiSourceCode.url());
        void this.debuggerWorkspaceBinding.updateLocations(script);
    }
    executionContextDestroyed(event) {
        const executionContext = event.data;
        for (const script of this.debuggerModel.scriptsForExecutionContext(executionContext)) {
            this.removeScript(script);
        }
    }
    globalObjectCleared() {
        for (const script of this.#scriptToUISourceCode.keys()) {
            this.removeScript(script);
        }
    }
    resetForTest() {
        this.globalObjectCleared();
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.globalObjectCleared();
        for (const project of this.#projects.values()) {
            project.removeProject();
        }
        this.#projects.clear();
    }
}
export class ResourceScriptFile extends Common.ObjectWrapper.ObjectWrapper {
    #resourceScriptMapping;
    #uiSourceCodeInternal;
    scriptInternal;
    #scriptSource;
    #isDivergingFromVMInternal;
    #hasDivergedFromVMInternal;
    #isMergingToVMInternal;
    constructor(resourceScriptMapping, uiSourceCode, scripts) {
        super();
        console.assert(scripts.length > 0);
        this.#resourceScriptMapping = resourceScriptMapping;
        this.#uiSourceCodeInternal = uiSourceCode;
        if (this.#uiSourceCodeInternal.contentType().isScript()) {
            this.scriptInternal = scripts[scripts.length - 1];
        }
        this.#uiSourceCodeInternal.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.workingCopyChanged, this);
        this.#uiSourceCodeInternal.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.workingCopyCommitted, this);
    }
    hasScripts(scripts) {
        return Boolean(this.scriptInternal) && this.scriptInternal === scripts[0];
    }
    isDiverged() {
        if (this.#uiSourceCodeInternal.isDirty()) {
            return true;
        }
        if (!this.scriptInternal) {
            return false;
        }
        if (typeof this.#scriptSource === 'undefined' || this.#scriptSource === null) {
            return false;
        }
        const workingCopy = this.#uiSourceCodeInternal.workingCopy();
        if (!workingCopy) {
            return false;
        }
        // Match ignoring sourceURL.
        if (!workingCopy.startsWith(this.#scriptSource.trimEnd())) {
            return true;
        }
        const suffix = this.#uiSourceCodeInternal.workingCopy().substr(this.#scriptSource.length);
        return Boolean(suffix.length) && !suffix.match(SDK.Script.sourceURLRegex);
    }
    workingCopyChanged() {
        void this.update();
    }
    workingCopyCommitted() {
        if (this.#uiSourceCodeInternal.project().canSetFileContent()) {
            return;
        }
        if (!this.scriptInternal) {
            return;
        }
        const breakpoints = BreakpointManager.instance()
            .breakpointLocationsForUISourceCode(this.#uiSourceCodeInternal)
            .map(breakpointLocation => breakpointLocation.breakpoint);
        const source = this.#uiSourceCodeInternal.workingCopy();
        void this.scriptInternal.editSource(source).then(({ status, exceptionDetails }) => {
            void this.scriptSourceWasSet(source, breakpoints, status, exceptionDetails);
        });
    }
    async scriptSourceWasSet(source, breakpoints, status, exceptionDetails) {
        if (status === "Ok" /* Ok */) {
            this.#scriptSource = source;
        }
        await this.update();
        if (status === "Ok" /* Ok */) {
            // Live edit can cause #breakpoints to be in the wrong position, or to be lost altogether.
            // If any #breakpoints were in the pre-live edit script, they need to be re-added.
            await Promise.all(breakpoints.map(breakpoint => breakpoint.refreshInDebugger()));
            return;
        }
        if (!exceptionDetails) {
            // TODO(crbug.com/1334484): Instead of to the console, report these errors in an "info bar" at the bottom
            //                          of the text editor, similar to e.g. source mapping errors.
            Common.Console.Console.instance().addMessage(i18nString(UIStrings.liveEditFailed, { PH1: getErrorText(status) }), Common.Console.MessageLevel.Warning);
            return;
        }
        const messageText = i18nString(UIStrings.liveEditCompileFailed, { PH1: exceptionDetails.text });
        this.#uiSourceCodeInternal.addLineMessage(Workspace.UISourceCode.Message.Level.Error, messageText, exceptionDetails.lineNumber, exceptionDetails.columnNumber);
        function getErrorText(status) {
            switch (status) {
                case "BlockedByActiveFunction" /* BlockedByActiveFunction */:
                    return 'Functions that are on the stack (currently being executed) can not be edited';
                case "BlockedByActiveGenerator" /* BlockedByActiveGenerator */:
                    return 'Async functions/generators that are active can not be edited';
                case "CompileError" /* CompileError */:
                case "Ok" /* Ok */:
                    throw new Error('Compile errors and Ok status must not be reported on the console');
            }
        }
    }
    async update() {
        if (this.isDiverged() && !this.#hasDivergedFromVMInternal) {
            await this.divergeFromVM();
        }
        else if (!this.isDiverged() && this.#hasDivergedFromVMInternal) {
            await this.mergeToVM();
        }
    }
    async divergeFromVM() {
        if (this.scriptInternal) {
            this.#isDivergingFromVMInternal = true;
            await this.#resourceScriptMapping.debuggerWorkspaceBinding.updateLocations(this.scriptInternal);
            this.#isDivergingFromVMInternal = undefined;
            this.#hasDivergedFromVMInternal = true;
            this.dispatchEventToListeners("DidDivergeFromVM" /* DidDivergeFromVM */);
        }
    }
    async mergeToVM() {
        if (this.scriptInternal) {
            this.#hasDivergedFromVMInternal = undefined;
            this.#isMergingToVMInternal = true;
            await this.#resourceScriptMapping.debuggerWorkspaceBinding.updateLocations(this.scriptInternal);
            this.#isMergingToVMInternal = undefined;
            this.dispatchEventToListeners("DidMergeToVM" /* DidMergeToVM */);
        }
    }
    hasDivergedFromVM() {
        return Boolean(this.#hasDivergedFromVMInternal);
    }
    isDivergingFromVM() {
        return Boolean(this.#isDivergingFromVMInternal);
    }
    isMergingToVM() {
        return Boolean(this.#isMergingToVMInternal);
    }
    checkMapping() {
        if (!this.scriptInternal || typeof this.#scriptSource !== 'undefined') {
            this.mappingCheckedForTest();
            return;
        }
        void this.scriptInternal.requestContent().then(deferredContent => {
            this.#scriptSource = deferredContent.content;
            void this.update().then(() => this.mappingCheckedForTest());
        });
    }
    mappingCheckedForTest() {
    }
    dispose() {
        this.#uiSourceCodeInternal.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.workingCopyChanged, this);
        this.#uiSourceCodeInternal.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.workingCopyCommitted, this);
    }
    addSourceMapURL(sourceMapURL) {
        if (!this.scriptInternal) {
            return;
        }
        this.scriptInternal.debuggerModel.setSourceMapURL(this.scriptInternal, sourceMapURL);
    }
    hasSourceMapURL() {
        return this.scriptInternal !== undefined && Boolean(this.scriptInternal.sourceMapURL);
    }
    async missingSymbolFiles() {
        if (!this.scriptInternal) {
            return null;
        }
        const { pluginManager } = this.#resourceScriptMapping.debuggerWorkspaceBinding;
        if (!pluginManager) {
            return null;
        }
        const sources = await pluginManager.getSourcesForScript(this.scriptInternal);
        return sources && 'missingSymbolFiles' in sources ? sources.missingSymbolFiles : null;
    }
    get script() {
        return this.scriptInternal || null;
    }
    get uiSourceCode() {
        return this.#uiSourceCodeInternal;
    }
}
//# sourceMappingURL=ResourceScriptMapping.js.map