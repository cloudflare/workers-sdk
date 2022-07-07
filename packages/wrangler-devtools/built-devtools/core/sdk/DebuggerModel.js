// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
 *     * Neither the #name of Google Inc. nor the names of its
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
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { ScopeRef } from './RemoteObject.js';
import { Events as ResourceTreeModelEvents, ResourceTreeModel } from './ResourceTreeModel.js';
import { RuntimeModel } from './RuntimeModel.js';
import { Script } from './Script.js';
import { Capability, Type } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { SourceMapManager } from './SourceMapManager.js';
const UIStrings = {
    /**
    *@description Title of a section in the debugger showing local JavaScript variables.
    */
    local: 'Local',
    /**
    *@description Text that refers to closure as a programming term
    */
    closure: 'Closure',
    /**
    *@description Noun that represents a section or block of code in the Debugger Model. Shown in the Sources tab, while paused on a breakpoint.
    */
    block: 'Block',
    /**
    *@description Label for a group of JavaScript files
    */
    script: 'Script',
    /**
    *@description Title of a section in the debugger showing JavaScript variables from the a 'with'
    *block. Block here means section of code, 'with' refers to a JavaScript programming concept and
    *is a fixed term.
    */
    withBlock: '`With` block',
    /**
    *@description Title of a section in the debugger showing JavaScript variables from the a 'catch'
    *block. Block here means section of code, 'catch' refers to a JavaScript programming concept and
    *is a fixed term.
    */
    catchBlock: '`Catch` block',
    /**
    *@description Title of a section in the debugger showing JavaScript variables from the global scope.
    */
    global: 'Global',
    /**
    *@description Text for a JavaScript module, the programming concept
    */
    module: 'Module',
    /**
    *@description Text describing the expression scope in WebAssembly
    */
    expression: 'Expression',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/DebuggerModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export function sortAndMergeRanges(locationRanges) {
    if (locationRanges.length === 0) {
        return [];
    }
    locationRanges.sort(LocationRange.comparator);
    let prev = locationRanges[0];
    const merged = [];
    for (let i = 1; i < locationRanges.length; ++i) {
        const current = locationRanges[i];
        if (prev.overlap(current)) {
            const largerEnd = prev.end.compareTo(current.end) > 0 ? prev.end : current.end;
            prev = new LocationRange(prev.scriptId, prev.start, largerEnd);
        }
        else {
            merged.push(prev);
            prev = current;
        }
    }
    merged.push(prev);
    return merged;
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var StepMode;
(function (StepMode) {
    StepMode["StepInto"] = "StepInto";
    StepMode["StepOut"] = "StepOut";
    StepMode["StepOver"] = "StepOver";
})(StepMode || (StepMode = {}));
export class DebuggerModel extends SDKModel {
    agent;
    runtimeModelInternal;
    #sourceMapManagerInternal;
    #sourceMapIdToScript;
    #debuggerPausedDetailsInternal;
    #scriptsInternal;
    #scriptsBySourceURL;
    #discardableScripts;
    continueToLocationCallback;
    #selectedCallFrameInternal;
    #debuggerEnabledInternal;
    #debuggerId;
    #skipAllPausesTimeout;
    #beforePausedCallback;
    #computeAutoStepRangesCallback;
    #expandCallFramesCallback;
    evaluateOnCallFrameCallback;
    #synchronizeBreakpointsCallback;
    // We need to be able to register listeners for individual breakpoints. As such, we dispatch
    // on breakpoint ids, which are not statically known. The event #payload will always be a `Location`.
    #breakpointResolvedEventTarget = new Common.ObjectWrapper.ObjectWrapper();
    #autoStepOver;
    #isPausingInternal;
    constructor(target) {
        super(target);
        target.registerDebuggerDispatcher(new DebuggerDispatcher(this));
        this.agent = target.debuggerAgent();
        this.runtimeModelInternal = target.model(RuntimeModel);
        this.#sourceMapManagerInternal = new SourceMapManager(target);
        this.#sourceMapIdToScript = new Map();
        this.#debuggerPausedDetailsInternal = null;
        this.#scriptsInternal = new Map();
        this.#scriptsBySourceURL = new Map();
        this.#discardableScripts = [];
        this.continueToLocationCallback = null;
        this.#selectedCallFrameInternal = null;
        this.#debuggerEnabledInternal = false;
        this.#debuggerId = null;
        this.#skipAllPausesTimeout = 0;
        this.#beforePausedCallback = null;
        this.#computeAutoStepRangesCallback = null;
        this.#expandCallFramesCallback = null;
        this.evaluateOnCallFrameCallback = null;
        this.#synchronizeBreakpointsCallback = null;
        this.#autoStepOver = false;
        this.#isPausingInternal = false;
        Common.Settings.Settings.instance()
            .moduleSetting('pauseOnExceptionEnabled')
            .addChangeListener(this.pauseOnExceptionStateChanged, this);
        Common.Settings.Settings.instance()
            .moduleSetting('pauseOnCaughtException')
            .addChangeListener(this.pauseOnExceptionStateChanged, this);
        Common.Settings.Settings.instance()
            .moduleSetting('disableAsyncStackTraces')
            .addChangeListener(this.asyncStackTracesStateChanged, this);
        Common.Settings.Settings.instance()
            .moduleSetting('breakpointsActive')
            .addChangeListener(this.breakpointsActiveChanged, this);
        if (!target.suspended()) {
            void this.enableDebugger();
        }
        this.#sourceMapManagerInternal.setEnabled(Common.Settings.Settings.instance().moduleSetting('jsSourceMapsEnabled').get());
        Common.Settings.Settings.instance()
            .moduleSetting('jsSourceMapsEnabled')
            .addChangeListener(event => this.#sourceMapManagerInternal.setEnabled(event.data));
        const resourceTreeModel = target.model(ResourceTreeModel);
        if (resourceTreeModel) {
            resourceTreeModel.addEventListener(ResourceTreeModelEvents.FrameNavigated, this.onFrameNavigated, this);
        }
    }
    static sourceMapId(executionContextId, sourceURL, sourceMapURL) {
        if (!sourceMapURL) {
            return null;
        }
        return executionContextId + ':' + sourceURL + ':' + sourceMapURL;
    }
    sourceMapManager() {
        return this.#sourceMapManagerInternal;
    }
    runtimeModel() {
        return this.runtimeModelInternal;
    }
    debuggerEnabled() {
        return Boolean(this.#debuggerEnabledInternal);
    }
    debuggerId() {
        return this.#debuggerId;
    }
    async enableDebugger() {
        if (this.#debuggerEnabledInternal) {
            return;
        }
        this.#debuggerEnabledInternal = true;
        // Set a limit for the total size of collected script sources retained by debugger.
        // 10MB for remote frontends, 100MB for others.
        const isRemoteFrontend = Root.Runtime.Runtime.queryParam('remoteFrontend') || Root.Runtime.Runtime.queryParam('ws');
        const maxScriptsCacheSize = isRemoteFrontend ? 10e6 : 100e6;
        const enablePromise = this.agent.invoke_enable({ maxScriptsCacheSize });
        let instrumentationPromise;
        if (Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.INSTRUMENTATION_BREAKPOINTS)) {
            instrumentationPromise = this.agent.invoke_setInstrumentationBreakpoint({
                instrumentation: "beforeScriptExecution" /* BeforeScriptExecution */,
            });
        }
        this.pauseOnExceptionStateChanged();
        void this.asyncStackTracesStateChanged();
        if (!Common.Settings.Settings.instance().moduleSetting('breakpointsActive').get()) {
            this.breakpointsActiveChanged();
        }
        this.dispatchEventToListeners(Events.DebuggerWasEnabled, this);
        const [enableResult] = await Promise.all([enablePromise, instrumentationPromise]);
        this.registerDebugger(enableResult);
    }
    async syncDebuggerId() {
        const isRemoteFrontend = Root.Runtime.Runtime.queryParam('remoteFrontend') || Root.Runtime.Runtime.queryParam('ws');
        const maxScriptsCacheSize = isRemoteFrontend ? 10e6 : 100e6;
        const enablePromise = this.agent.invoke_enable({ maxScriptsCacheSize });
        void enablePromise.then(this.registerDebugger.bind(this));
        return enablePromise;
    }
    onFrameNavigated() {
        if (DebuggerModel.shouldResyncDebuggerId) {
            return;
        }
        DebuggerModel.shouldResyncDebuggerId = true;
    }
    registerDebugger(response) {
        if (response.getError()) {
            return;
        }
        const { debuggerId } = response;
        _debuggerIdToModel.set(debuggerId, this);
        this.#debuggerId = debuggerId;
        this.dispatchEventToListeners(Events.DebuggerIsReadyToPause, this);
    }
    isReadyToPause() {
        return Boolean(this.#debuggerId);
    }
    static async modelForDebuggerId(debuggerId) {
        if (DebuggerModel.shouldResyncDebuggerId) {
            await DebuggerModel.resyncDebuggerIdForModels();
            DebuggerModel.shouldResyncDebuggerId = false;
        }
        return _debuggerIdToModel.get(debuggerId) || null;
    }
    static async resyncDebuggerIdForModels() {
        const dbgModels = _debuggerIdToModel.values();
        for (const dbgModel of dbgModels) {
            if (dbgModel.debuggerEnabled()) {
                await dbgModel.syncDebuggerId();
            }
        }
    }
    async disableDebugger() {
        if (!this.#debuggerEnabledInternal) {
            return;
        }
        this.#debuggerEnabledInternal = false;
        await this.asyncStackTracesStateChanged();
        await this.agent.invoke_disable();
        this.#isPausingInternal = false;
        this.globalObjectCleared();
        this.dispatchEventToListeners(Events.DebuggerWasDisabled, this);
        if (typeof this.#debuggerId === 'string') {
            _debuggerIdToModel.delete(this.#debuggerId);
        }
        this.#debuggerId = null;
    }
    skipAllPauses(skip) {
        if (this.#skipAllPausesTimeout) {
            clearTimeout(this.#skipAllPausesTimeout);
            this.#skipAllPausesTimeout = 0;
        }
        void this.agent.invoke_setSkipAllPauses({ skip });
    }
    skipAllPausesUntilReloadOrTimeout(timeout) {
        if (this.#skipAllPausesTimeout) {
            clearTimeout(this.#skipAllPausesTimeout);
        }
        void this.agent.invoke_setSkipAllPauses({ skip: true });
        // If reload happens before the timeout, the flag will be already unset and the timeout callback won't change anything.
        this.#skipAllPausesTimeout = window.setTimeout(this.skipAllPauses.bind(this, false), timeout);
    }
    pauseOnExceptionStateChanged() {
        let state;
        if (!Common.Settings.Settings.instance().moduleSetting('pauseOnExceptionEnabled').get()) {
            state = "none" /* None */;
        }
        else if (Common.Settings.Settings.instance().moduleSetting('pauseOnCaughtException').get()) {
            state = "all" /* All */;
        }
        else {
            state = "uncaught" /* Uncaught */;
        }
        void this.agent.invoke_setPauseOnExceptions({ state });
    }
    asyncStackTracesStateChanged() {
        const maxAsyncStackChainDepth = 32;
        const enabled = !Common.Settings.Settings.instance().moduleSetting('disableAsyncStackTraces').get() &&
            this.#debuggerEnabledInternal;
        const maxDepth = enabled ? maxAsyncStackChainDepth : 0;
        return this.agent.invoke_setAsyncCallStackDepth({ maxDepth });
    }
    breakpointsActiveChanged() {
        void this.agent.invoke_setBreakpointsActive({ active: Common.Settings.Settings.instance().moduleSetting('breakpointsActive').get() });
    }
    setComputeAutoStepRangesCallback(callback) {
        this.#computeAutoStepRangesCallback = callback;
    }
    async computeAutoStepSkipList(mode) {
        let ranges = [];
        if (this.#computeAutoStepRangesCallback && this.#debuggerPausedDetailsInternal) {
            const [callFrame] = this.#debuggerPausedDetailsInternal.callFrames;
            ranges = await this.#computeAutoStepRangesCallback.call(null, mode, callFrame);
        }
        const skipList = ranges.map(location => new LocationRange(location.start.scriptId, new ScriptPosition(location.start.lineNumber, location.start.columnNumber), new ScriptPosition(location.end.lineNumber, location.end.columnNumber)));
        return sortAndMergeRanges(skipList).map(x => x.payload());
    }
    async stepInto() {
        const skipList = await this.computeAutoStepSkipList(StepMode.StepInto);
        void this.agent.invoke_stepInto({ breakOnAsyncCall: false, skipList });
    }
    async stepOver() {
        // Mark that in case of auto-stepping, we should be doing
        // step-over instead of step-in.
        this.#autoStepOver = true;
        const skipList = await this.computeAutoStepSkipList(StepMode.StepOver);
        void this.agent.invoke_stepOver({ skipList });
    }
    async stepOut() {
        const skipList = await this.computeAutoStepSkipList(StepMode.StepOut);
        if (skipList.length !== 0) {
            void this.agent.invoke_stepOver({ skipList });
        }
        else {
            void this.agent.invoke_stepOut();
        }
    }
    scheduleStepIntoAsync() {
        void this.computeAutoStepSkipList(StepMode.StepInto).then(skipList => {
            void this.agent.invoke_stepInto({ breakOnAsyncCall: true, skipList });
        });
    }
    resume() {
        void this.agent.invoke_resume({ terminateOnResume: false });
        this.#isPausingInternal = false;
    }
    pause() {
        this.#isPausingInternal = true;
        this.skipAllPauses(false);
        void this.agent.invoke_pause();
    }
    async setBreakpointByURL(url, lineNumber, columnNumber, condition) {
        // Convert file url to node-js path.
        let urlRegex;
        if (this.target().type() === Type.Node && url.startsWith('file://')) {
            const platformPath = Common.ParsedURL.ParsedURL.urlToRawPathString(url, Host.Platform.isWin());
            urlRegex =
                `${Platform.StringUtilities.escapeForRegExp(platformPath)}|${Platform.StringUtilities.escapeForRegExp(url)}`;
            if (Host.Platform.isWin() && platformPath.match(/^.:\\/)) {
                // Match upper or lower case drive letter
                urlRegex = `[${platformPath[0].toUpperCase()}${platformPath[0].toLowerCase()}]` + urlRegex.substr(1);
            }
        }
        // Adjust column if needed.
        let minColumnNumber = 0;
        const scripts = this.#scriptsBySourceURL.get(url) || [];
        for (let i = 0, l = scripts.length; i < l; ++i) {
            const script = scripts[i];
            if (lineNumber === script.lineOffset) {
                minColumnNumber = minColumnNumber ? Math.min(minColumnNumber, script.columnOffset) : script.columnOffset;
            }
        }
        columnNumber = Math.max(columnNumber || 0, minColumnNumber);
        const response = await this.agent.invoke_setBreakpointByUrl({
            lineNumber: lineNumber,
            url: urlRegex ? undefined : url,
            urlRegex: urlRegex,
            columnNumber: columnNumber,
            condition: condition,
        });
        if (response.getError()) {
            return { locations: [], breakpointId: null };
        }
        let locations = [];
        if (response.locations) {
            locations = response.locations.map(payload => Location.fromPayload(this, payload));
        }
        return { locations, breakpointId: response.breakpointId };
    }
    async setBreakpointInAnonymousScript(scriptId, scriptHash, lineNumber, columnNumber, condition) {
        const response = await this.agent.invoke_setBreakpointByUrl({ lineNumber: lineNumber, scriptHash: scriptHash, columnNumber: columnNumber, condition: condition });
        const error = response.getError();
        if (error) {
            // Old V8 backend doesn't support scriptHash argument.
            if (error !== 'Either url or urlRegex must be specified.') {
                return { locations: [], breakpointId: null };
            }
            return this.setBreakpointBySourceId(scriptId, lineNumber, columnNumber, condition);
        }
        let locations = [];
        if (response.locations) {
            locations = response.locations.map(payload => Location.fromPayload(this, payload));
        }
        return { locations, breakpointId: response.breakpointId };
    }
    async setBreakpointBySourceId(scriptId, lineNumber, columnNumber, condition) {
        // This method is required for backward compatibility with V8 before 6.3.275.
        const response = await this.agent.invoke_setBreakpoint({ location: { scriptId: scriptId, lineNumber: lineNumber, columnNumber: columnNumber }, condition: condition });
        if (response.getError()) {
            return { breakpointId: null, locations: [] };
        }
        let actualLocation = [];
        if (response.actualLocation) {
            actualLocation = [Location.fromPayload(this, response.actualLocation)];
        }
        return { locations: actualLocation, breakpointId: response.breakpointId };
    }
    async removeBreakpoint(breakpointId) {
        const response = await this.agent.invoke_removeBreakpoint({ breakpointId });
        if (response.getError()) {
            console.error('Failed to remove breakpoint: ' + response.getError());
        }
    }
    async getPossibleBreakpoints(startLocation, endLocation, restrictToFunction) {
        const response = await this.agent.invoke_getPossibleBreakpoints({
            start: startLocation.payload(),
            end: endLocation ? endLocation.payload() : undefined,
            restrictToFunction: restrictToFunction,
        });
        if (response.getError() || !response.locations) {
            return [];
        }
        return response.locations.map(location => BreakLocation.fromPayload(this, location));
    }
    async fetchAsyncStackTrace(stackId) {
        const response = await this.agent.invoke_getStackTrace({ stackTraceId: stackId });
        return response.getError() ? null : response.stackTrace;
    }
    breakpointResolved(breakpointId, location) {
        this.#breakpointResolvedEventTarget.dispatchEventToListeners(breakpointId, Location.fromPayload(this, location));
    }
    globalObjectCleared() {
        this.setDebuggerPausedDetails(null);
        this.reset();
        // TODO(dgozman): move clients to ExecutionContextDestroyed/ScriptCollected events.
        this.dispatchEventToListeners(Events.GlobalObjectCleared, this);
    }
    reset() {
        for (const scriptWithSourceMap of this.#sourceMapIdToScript.values()) {
            this.#sourceMapManagerInternal.detachSourceMap(scriptWithSourceMap);
        }
        this.#sourceMapIdToScript.clear();
        this.#scriptsInternal.clear();
        this.#scriptsBySourceURL.clear();
        this.#discardableScripts = [];
        this.#autoStepOver = false;
    }
    scripts() {
        return Array.from(this.#scriptsInternal.values());
    }
    scriptForId(scriptId) {
        return this.#scriptsInternal.get(scriptId) || null;
    }
    /**
     * Returns all `Script` objects with the same provided `sourceURL`. The
     * resulting array is sorted by time with the newest `Script` in the front.
     */
    scriptsForSourceURL(sourceURL) {
        if (!sourceURL) {
            return [];
        }
        return this.#scriptsBySourceURL.get(sourceURL) || [];
    }
    scriptsForExecutionContext(executionContext) {
        const result = [];
        for (const script of this.#scriptsInternal.values()) {
            if (script.executionContextId === executionContext.id) {
                result.push(script);
            }
        }
        return result;
    }
    get callFrames() {
        return this.#debuggerPausedDetailsInternal ? this.#debuggerPausedDetailsInternal.callFrames : null;
    }
    debuggerPausedDetails() {
        return this.#debuggerPausedDetailsInternal;
    }
    setDebuggerPausedDetails(debuggerPausedDetails) {
        if (debuggerPausedDetails) {
            this.#isPausingInternal = false;
            this.#debuggerPausedDetailsInternal = debuggerPausedDetails;
            if (this.#beforePausedCallback) {
                if (!this.#beforePausedCallback.call(null, debuggerPausedDetails)) {
                    return false;
                }
            }
            // If we resolved a location in auto-stepping callback, reset the
            // step-over marker.
            this.#autoStepOver = false;
            this.dispatchEventToListeners(Events.DebuggerPaused, this);
            this.setSelectedCallFrame(debuggerPausedDetails.callFrames[0]);
        }
        else {
            this.#isPausingInternal = false;
            this.#debuggerPausedDetailsInternal = null;
            this.setSelectedCallFrame(null);
        }
        return true;
    }
    setBeforePausedCallback(callback) {
        this.#beforePausedCallback = callback;
    }
    setExpandCallFramesCallback(callback) {
        this.#expandCallFramesCallback = callback;
    }
    setEvaluateOnCallFrameCallback(callback) {
        this.evaluateOnCallFrameCallback = callback;
    }
    setSynchronizeBreakpointsCallback(callback) {
        this.#synchronizeBreakpointsCallback = callback;
    }
    async pausedScript(callFrames, reason, auxData, breakpointIds, asyncStackTrace, asyncStackTraceId) {
        if (reason === "instrumentation" /* Instrumentation */) {
            const script = this.scriptForId(callFrames[0].location.scriptId);
            if (this.#synchronizeBreakpointsCallback && script) {
                await this.#synchronizeBreakpointsCallback(script);
            }
            this.resume();
            return;
        }
        const pausedDetails = new DebuggerPausedDetails(this, callFrames, reason, auxData, breakpointIds, asyncStackTrace, asyncStackTraceId);
        if (this.#expandCallFramesCallback) {
            pausedDetails.callFrames = await this.#expandCallFramesCallback.call(null, pausedDetails.callFrames);
        }
        if (this.continueToLocationCallback) {
            const callback = this.continueToLocationCallback;
            this.continueToLocationCallback = null;
            if (callback(pausedDetails)) {
                return;
            }
        }
        if (!this.setDebuggerPausedDetails(pausedDetails)) {
            if (this.#autoStepOver) {
                void this.stepOver();
            }
            else {
                void this.stepInto();
            }
        }
        else {
            Common.EventTarget.fireEvent('DevTools.DebuggerPaused');
        }
    }
    resumedScript() {
        this.setDebuggerPausedDetails(null);
        this.dispatchEventToListeners(Events.DebuggerResumed, this);
    }
    parsedScriptSource(scriptId, sourceURL, startLine, startColumn, endLine, endColumn, 
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    executionContextId, hash, executionContextAuxData, isLiveEdit, sourceMapURL, hasSourceURLComment, hasSyntaxError, length, isModule, originStackTrace, codeOffset, scriptLanguage, debugSymbols, embedderName) {
        const knownScript = this.#scriptsInternal.get(scriptId);
        if (knownScript) {
            return knownScript;
        }
        let isContentScript = false;
        if (executionContextAuxData && ('isDefault' in executionContextAuxData)) {
            isContentScript = !executionContextAuxData['isDefault'];
        }
        const script = new Script(this, scriptId, sourceURL, startLine, startColumn, endLine, endColumn, executionContextId, hash, isContentScript, isLiveEdit, sourceMapURL, hasSourceURLComment, length, isModule, originStackTrace, codeOffset, scriptLanguage, debugSymbols, embedderName);
        this.registerScript(script);
        this.dispatchEventToListeners(Events.ParsedScriptSource, script);
        const sourceMapId = DebuggerModel.sourceMapId(script.executionContextId, script.sourceURL, script.sourceMapURL);
        if (sourceMapId && !hasSyntaxError) {
            // Consecutive script evaluations in the same execution context with the same #sourceURL
            // and sourceMappingURL should result in source map reloading.
            const previousScript = this.#sourceMapIdToScript.get(sourceMapId);
            if (previousScript) {
                this.#sourceMapManagerInternal.detachSourceMap(previousScript);
            }
            this.#sourceMapIdToScript.set(sourceMapId, script);
            this.#sourceMapManagerInternal.attachSourceMap(script, script.sourceURL, script.sourceMapURL);
        }
        const isDiscardable = hasSyntaxError && script.isAnonymousScript();
        if (isDiscardable) {
            this.#discardableScripts.push(script);
            this.collectDiscardedScripts();
        }
        return script;
    }
    setSourceMapURL(script, newSourceMapURL) {
        let sourceMapId = DebuggerModel.sourceMapId(script.executionContextId, script.sourceURL, script.sourceMapURL);
        if (sourceMapId && this.#sourceMapIdToScript.get(sourceMapId) === script) {
            this.#sourceMapIdToScript.delete(sourceMapId);
        }
        this.#sourceMapManagerInternal.detachSourceMap(script);
        script.sourceMapURL = newSourceMapURL;
        sourceMapId = DebuggerModel.sourceMapId(script.executionContextId, script.sourceURL, script.sourceMapURL);
        if (!sourceMapId) {
            return;
        }
        this.#sourceMapIdToScript.set(sourceMapId, script);
        this.#sourceMapManagerInternal.attachSourceMap(script, script.sourceURL, script.sourceMapURL);
    }
    executionContextDestroyed(executionContext) {
        const sourceMapIds = Array.from(this.#sourceMapIdToScript.keys());
        for (const sourceMapId of sourceMapIds) {
            const script = this.#sourceMapIdToScript.get(sourceMapId);
            if (script && script.executionContextId === executionContext.id) {
                this.#sourceMapIdToScript.delete(sourceMapId);
                this.#sourceMapManagerInternal.detachSourceMap(script);
            }
        }
    }
    registerScript(script) {
        this.#scriptsInternal.set(script.scriptId, script);
        if (script.isAnonymousScript()) {
            return;
        }
        let scripts = this.#scriptsBySourceURL.get(script.sourceURL);
        if (!scripts) {
            scripts = [];
            this.#scriptsBySourceURL.set(script.sourceURL, scripts);
        }
        // Newer scripts with the same URL should be preferred so we put them in
        // the front. Consuming code usually will iterate over the array and pick
        // the first script that works.
        scripts.unshift(script);
    }
    unregisterScript(script) {
        console.assert(script.isAnonymousScript());
        this.#scriptsInternal.delete(script.scriptId);
    }
    collectDiscardedScripts() {
        if (this.#discardableScripts.length < 1000) {
            return;
        }
        const scriptsToDiscard = this.#discardableScripts.splice(0, 100);
        for (const script of scriptsToDiscard) {
            this.unregisterScript(script);
            this.dispatchEventToListeners(Events.DiscardedAnonymousScriptSource, script);
        }
    }
    createRawLocation(script, lineNumber, columnNumber, inlineFrameIndex) {
        return this.createRawLocationByScriptId(script.scriptId, lineNumber, columnNumber, inlineFrameIndex);
    }
    createRawLocationByURL(sourceURL, lineNumber, columnNumber, inlineFrameIndex) {
        for (const script of this.#scriptsBySourceURL.get(sourceURL) || []) {
            if (script.lineOffset > lineNumber ||
                (script.lineOffset === lineNumber && columnNumber !== undefined && script.columnOffset > columnNumber)) {
                continue;
            }
            if (script.endLine < lineNumber ||
                (script.endLine === lineNumber && columnNumber !== undefined && script.endColumn <= columnNumber)) {
                continue;
            }
            return new Location(this, script.scriptId, lineNumber, columnNumber, inlineFrameIndex);
        }
        return null;
    }
    createRawLocationByScriptId(scriptId, lineNumber, columnNumber, inlineFrameIndex) {
        return new Location(this, scriptId, lineNumber, columnNumber, inlineFrameIndex);
    }
    createRawLocationsByStackTrace(stackTrace) {
        const rawLocations = [];
        for (let current = stackTrace; current; current = current.parent) {
            for (const { scriptId, lineNumber, columnNumber } of current.callFrames) {
                rawLocations.push(this.createRawLocationByScriptId(scriptId, lineNumber, columnNumber));
            }
        }
        return rawLocations;
    }
    isPaused() {
        return Boolean(this.debuggerPausedDetails());
    }
    isPausing() {
        return this.#isPausingInternal;
    }
    setSelectedCallFrame(callFrame) {
        if (this.#selectedCallFrameInternal === callFrame) {
            return;
        }
        this.#selectedCallFrameInternal = callFrame;
        this.dispatchEventToListeners(Events.CallFrameSelected, this);
    }
    selectedCallFrame() {
        return this.#selectedCallFrameInternal;
    }
    async evaluateOnSelectedCallFrame(options) {
        const callFrame = this.selectedCallFrame();
        if (!callFrame) {
            throw new Error('No call frame selected');
        }
        return callFrame.evaluate(options);
    }
    functionDetailsPromise(remoteObject) {
        return remoteObject.getAllProperties(false /* accessorPropertiesOnly */, false /* generatePreview */)
            .then(buildDetails.bind(this));
        function buildDetails(response) {
            if (!response) {
                return null;
            }
            let location = null;
            if (response.internalProperties) {
                for (const prop of response.internalProperties) {
                    if (prop.name === '[[FunctionLocation]]') {
                        location = prop.value;
                    }
                }
            }
            let functionName = null;
            if (response.properties) {
                for (const prop of response.properties) {
                    if (prop.name === 'name' && prop.value && prop.value.type === 'string') {
                        functionName = prop.value;
                    }
                }
            }
            let debuggerLocation = null;
            if (location) {
                debuggerLocation = this.createRawLocationByScriptId(location.value.scriptId, location.value.lineNumber, location.value.columnNumber);
            }
            return { location: debuggerLocation, functionName: functionName ? functionName.value : '' };
        }
    }
    async setVariableValue(scopeNumber, variableName, newValue, callFrameId) {
        const response = await this.agent.invoke_setVariableValue({ scopeNumber, variableName, newValue, callFrameId });
        const error = response.getError();
        if (error) {
            console.error(error);
        }
        return error;
    }
    addBreakpointListener(breakpointId, listener, thisObject) {
        this.#breakpointResolvedEventTarget.addEventListener(breakpointId, listener, thisObject);
    }
    removeBreakpointListener(breakpointId, listener, thisObject) {
        this.#breakpointResolvedEventTarget.removeEventListener(breakpointId, listener, thisObject);
    }
    async setBlackboxPatterns(patterns) {
        const response = await this.agent.invoke_setBlackboxPatterns({ patterns });
        const error = response.getError();
        if (error) {
            console.error(error);
        }
        return !error;
    }
    dispose() {
        this.#sourceMapManagerInternal.dispose();
        if (this.#debuggerId) {
            _debuggerIdToModel.delete(this.#debuggerId);
        }
        Common.Settings.Settings.instance()
            .moduleSetting('pauseOnExceptionEnabled')
            .removeChangeListener(this.pauseOnExceptionStateChanged, this);
        Common.Settings.Settings.instance()
            .moduleSetting('pauseOnCaughtException')
            .removeChangeListener(this.pauseOnExceptionStateChanged, this);
        Common.Settings.Settings.instance()
            .moduleSetting('disableAsyncStackTraces')
            .removeChangeListener(this.asyncStackTracesStateChanged, this);
    }
    async suspendModel() {
        await this.disableDebugger();
    }
    async resumeModel() {
        await this.enableDebugger();
    }
    static shouldResyncDebuggerId = false;
    getContinueToLocationCallback() {
        return this.continueToLocationCallback;
    }
    getEvaluateOnCallFrameCallback() {
        return this.evaluateOnCallFrameCallback;
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
export const _debuggerIdToModel = new Map();
/**
 * Keep these in sync with WebCore::V8Debugger
 */
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var PauseOnExceptionsState;
(function (PauseOnExceptionsState) {
    PauseOnExceptionsState["DontPauseOnExceptions"] = "none";
    PauseOnExceptionsState["PauseOnAllExceptions"] = "all";
    PauseOnExceptionsState["PauseOnUncaughtExceptions"] = "uncaught";
})(PauseOnExceptionsState || (PauseOnExceptionsState = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["DebuggerWasEnabled"] = "DebuggerWasEnabled";
    Events["DebuggerWasDisabled"] = "DebuggerWasDisabled";
    Events["DebuggerPaused"] = "DebuggerPaused";
    Events["DebuggerResumed"] = "DebuggerResumed";
    Events["ParsedScriptSource"] = "ParsedScriptSource";
    Events["DiscardedAnonymousScriptSource"] = "DiscardedAnonymousScriptSource";
    Events["GlobalObjectCleared"] = "GlobalObjectCleared";
    Events["CallFrameSelected"] = "CallFrameSelected";
    Events["DebuggerIsReadyToPause"] = "DebuggerIsReadyToPause";
})(Events || (Events = {}));
class DebuggerDispatcher {
    #debuggerModel;
    constructor(debuggerModel) {
        this.#debuggerModel = debuggerModel;
    }
    paused({ callFrames, reason, data, hitBreakpoints, asyncStackTrace, asyncStackTraceId }) {
        if (!this.#debuggerModel.debuggerEnabled()) {
            return;
        }
        void this.#debuggerModel.pausedScript(callFrames, reason, data, hitBreakpoints || [], asyncStackTrace, asyncStackTraceId);
    }
    resumed() {
        if (!this.#debuggerModel.debuggerEnabled()) {
            return;
        }
        this.#debuggerModel.resumedScript();
    }
    scriptParsed({ scriptId, url, startLine, startColumn, endLine, endColumn, executionContextId, hash, executionContextAuxData, isLiveEdit, sourceMapURL, hasSourceURL, length, isModule, stackTrace, codeOffset, scriptLanguage, debugSymbols, embedderName, }) {
        if (!this.#debuggerModel.debuggerEnabled()) {
            return;
        }
        this.#debuggerModel.parsedScriptSource(scriptId, url, startLine, startColumn, endLine, endColumn, executionContextId, hash, executionContextAuxData, Boolean(isLiveEdit), sourceMapURL, Boolean(hasSourceURL), false, length || 0, isModule || null, stackTrace || null, codeOffset || null, scriptLanguage || null, debugSymbols || null, embedderName || null);
    }
    scriptFailedToParse({ scriptId, url, startLine, startColumn, endLine, endColumn, executionContextId, hash, executionContextAuxData, sourceMapURL, hasSourceURL, length, isModule, stackTrace, codeOffset, scriptLanguage, embedderName, }) {
        if (!this.#debuggerModel.debuggerEnabled()) {
            return;
        }
        this.#debuggerModel.parsedScriptSource(scriptId, url, startLine, startColumn, endLine, endColumn, executionContextId, hash, executionContextAuxData, false, sourceMapURL, Boolean(hasSourceURL), true, length || 0, isModule || null, stackTrace || null, codeOffset || null, scriptLanguage || null, null, embedderName || null);
    }
    breakpointResolved({ breakpointId, location }) {
        if (!this.#debuggerModel.debuggerEnabled()) {
            return;
        }
        this.#debuggerModel.breakpointResolved(breakpointId, location);
    }
}
export class Location {
    debuggerModel;
    scriptId;
    lineNumber;
    columnNumber;
    inlineFrameIndex;
    constructor(debuggerModel, scriptId, lineNumber, columnNumber, inlineFrameIndex) {
        this.debuggerModel = debuggerModel;
        this.scriptId = scriptId;
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber || 0;
        this.inlineFrameIndex = inlineFrameIndex || 0;
    }
    static fromPayload(debuggerModel, payload, inlineFrameIndex) {
        return new Location(debuggerModel, payload.scriptId, payload.lineNumber, payload.columnNumber, inlineFrameIndex);
    }
    payload() {
        return { scriptId: this.scriptId, lineNumber: this.lineNumber, columnNumber: this.columnNumber };
    }
    script() {
        return this.debuggerModel.scriptForId(this.scriptId);
    }
    continueToLocation(pausedCallback) {
        if (pausedCallback) {
            this.debuggerModel.continueToLocationCallback = this.paused.bind(this, pausedCallback);
        }
        void this.debuggerModel.agent.invoke_continueToLocation({
            location: this.payload(),
            targetCallFrames: "current" /* Current */,
        });
    }
    paused(pausedCallback, debuggerPausedDetails) {
        const location = debuggerPausedDetails.callFrames[0].location();
        if (location.scriptId === this.scriptId && location.lineNumber === this.lineNumber &&
            location.columnNumber === this.columnNumber) {
            pausedCallback();
            return true;
        }
        return false;
    }
    id() {
        return this.debuggerModel.target().id() + ':' + this.scriptId + ':' + this.lineNumber + ':' + this.columnNumber;
    }
}
export class ScriptPosition {
    lineNumber;
    columnNumber;
    constructor(lineNumber, columnNumber) {
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber;
    }
    payload() {
        return { lineNumber: this.lineNumber, columnNumber: this.columnNumber };
    }
    compareTo(other) {
        if (this.lineNumber !== other.lineNumber) {
            return this.lineNumber - other.lineNumber;
        }
        return this.columnNumber - other.columnNumber;
    }
}
export class LocationRange {
    scriptId;
    start;
    end;
    constructor(scriptId, start, end) {
        this.scriptId = scriptId;
        this.start = start;
        this.end = end;
    }
    payload() {
        return { scriptId: this.scriptId, start: this.start.payload(), end: this.end.payload() };
    }
    static comparator(location1, location2) {
        return location1.compareTo(location2);
    }
    compareTo(other) {
        if (this.scriptId !== other.scriptId) {
            return this.scriptId > other.scriptId ? 1 : -1;
        }
        const startCmp = this.start.compareTo(other.start);
        if (startCmp) {
            return startCmp;
        }
        return this.end.compareTo(other.end);
    }
    overlap(other) {
        if (this.scriptId !== other.scriptId) {
            return false;
        }
        const startCmp = this.start.compareTo(other.start);
        if (startCmp < 0) {
            return this.end.compareTo(other.start) >= 0;
        }
        if (startCmp > 0) {
            return this.start.compareTo(other.end) <= 0;
        }
        return true;
    }
}
export class BreakLocation extends Location {
    type;
    constructor(debuggerModel, scriptId, lineNumber, columnNumber, type) {
        super(debuggerModel, scriptId, lineNumber, columnNumber);
        if (type) {
            this.type = type;
        }
    }
    static fromPayload(debuggerModel, payload) {
        return new BreakLocation(debuggerModel, payload.scriptId, payload.lineNumber, payload.columnNumber, payload.type);
    }
}
export class CallFrame {
    debuggerModel;
    #scriptInternal;
    payload;
    #locationInternal;
    #scopeChainInternal;
    #localScopeInternal;
    #inlineFrameIndexInternal;
    #functionNameInternal;
    #functionLocationInternal;
    #returnValueInternal;
    #missingDebugInfoDetails = null;
    canBeRestarted;
    constructor(debuggerModel, script, payload, inlineFrameIndex, functionName) {
        this.debuggerModel = debuggerModel;
        this.#scriptInternal = script;
        this.payload = payload;
        this.#locationInternal = Location.fromPayload(debuggerModel, payload.location, inlineFrameIndex);
        this.#scopeChainInternal = [];
        this.#localScopeInternal = null;
        this.#inlineFrameIndexInternal = inlineFrameIndex || 0;
        this.#functionNameInternal = functionName || payload.functionName;
        this.canBeRestarted = Boolean(payload.canBeRestarted);
        for (let i = 0; i < payload.scopeChain.length; ++i) {
            const scope = new Scope(this, i);
            this.#scopeChainInternal.push(scope);
            if (scope.type() === "local" /* Local */) {
                this.#localScopeInternal = scope;
            }
        }
        if (payload.functionLocation) {
            this.#functionLocationInternal = Location.fromPayload(debuggerModel, payload.functionLocation);
        }
        this.#returnValueInternal =
            payload.returnValue ? this.debuggerModel.runtimeModel().createRemoteObject(payload.returnValue) : null;
    }
    static fromPayloadArray(debuggerModel, callFrames) {
        const result = [];
        for (let i = 0; i < callFrames.length; ++i) {
            const callFrame = callFrames[i];
            const script = debuggerModel.scriptForId(callFrame.location.scriptId);
            if (script) {
                result.push(new CallFrame(debuggerModel, script, callFrame));
            }
        }
        return result;
    }
    createVirtualCallFrame(inlineFrameIndex, name) {
        return new CallFrame(this.debuggerModel, this.#scriptInternal, this.payload, inlineFrameIndex, name);
    }
    setMissingDebugInfoDetails(details) {
        this.#missingDebugInfoDetails = details;
    }
    get missingDebugInfoDetails() {
        return this.#missingDebugInfoDetails;
    }
    get script() {
        return this.#scriptInternal;
    }
    get id() {
        return this.payload.callFrameId;
    }
    get inlineFrameIndex() {
        return this.#inlineFrameIndexInternal;
    }
    scopeChain() {
        return this.#scopeChainInternal;
    }
    localScope() {
        return this.#localScopeInternal;
    }
    thisObject() {
        return this.payload.this ? this.debuggerModel.runtimeModel().createRemoteObject(this.payload.this) : null;
    }
    returnValue() {
        return this.#returnValueInternal;
    }
    async setReturnValue(expression) {
        if (!this.#returnValueInternal) {
            return null;
        }
        const evaluateResponse = await this.debuggerModel.agent.invoke_evaluateOnCallFrame({ callFrameId: this.id, expression: expression, silent: true, objectGroup: 'backtrace' });
        if (evaluateResponse.getError() || evaluateResponse.exceptionDetails) {
            return null;
        }
        const response = await this.debuggerModel.agent.invoke_setReturnValue({ newValue: evaluateResponse.result });
        if (response.getError()) {
            return null;
        }
        this.#returnValueInternal = this.debuggerModel.runtimeModel().createRemoteObject(evaluateResponse.result);
        return this.#returnValueInternal;
    }
    get functionName() {
        return this.#functionNameInternal;
    }
    location() {
        return this.#locationInternal;
    }
    functionLocation() {
        return this.#functionLocationInternal || null;
    }
    async evaluate(options) {
        const debuggerModel = this.debuggerModel;
        const runtimeModel = debuggerModel.runtimeModel();
        // Assume backends either support both throwOnSideEffect and timeout options or neither.
        const needsTerminationOptions = Boolean(options.throwOnSideEffect) || options.timeout !== undefined;
        if (needsTerminationOptions &&
            (runtimeModel.hasSideEffectSupport() === false ||
                (runtimeModel.hasSideEffectSupport() === null && !await runtimeModel.checkSideEffectSupport()))) {
            return { error: 'Side-effect checks not supported by backend.' };
        }
        const evaluateOnCallFrameCallback = debuggerModel.getEvaluateOnCallFrameCallback();
        if (evaluateOnCallFrameCallback) {
            const result = await evaluateOnCallFrameCallback(this, options);
            if (result) {
                return result;
            }
        }
        const response = await this.debuggerModel.agent.invoke_evaluateOnCallFrame({
            callFrameId: this.id,
            expression: options.expression,
            objectGroup: options.objectGroup,
            includeCommandLineAPI: options.includeCommandLineAPI,
            silent: options.silent,
            returnByValue: options.returnByValue,
            generatePreview: options.generatePreview,
            throwOnSideEffect: options.throwOnSideEffect,
            timeout: options.timeout,
        });
        const error = response.getError();
        if (error) {
            console.error(error);
            return { error: error };
        }
        return { object: runtimeModel.createRemoteObject(response.result), exceptionDetails: response.exceptionDetails };
    }
    async restart() {
        console.assert(this.canBeRestarted, 'This frame can not be restarted.');
        // Note that even if `canBeRestarted` is true, the restart frame call can still fail.
        // The user can evaluate arbitrary code between pausing and restarting the frame that
        // could mess with the call stack.
        await this.debuggerModel.agent.invoke_restartFrame({ callFrameId: this.id, mode: "StepInto" /* StepInto */ });
    }
    getPayload() {
        return this.payload;
    }
}
export class Scope {
    #callFrameInternal;
    #payload;
    #typeInternal;
    #nameInternal;
    #ordinal;
    #startLocationInternal;
    #endLocationInternal;
    #objectInternal;
    constructor(callFrame, ordinal) {
        this.#callFrameInternal = callFrame;
        this.#payload = callFrame.getPayload().scopeChain[ordinal];
        this.#typeInternal = this.#payload.type;
        this.#nameInternal = this.#payload.name;
        this.#ordinal = ordinal;
        this.#startLocationInternal =
            this.#payload.startLocation ? Location.fromPayload(callFrame.debuggerModel, this.#payload.startLocation) : null;
        this.#endLocationInternal =
            this.#payload.endLocation ? Location.fromPayload(callFrame.debuggerModel, this.#payload.endLocation) : null;
        this.#objectInternal = null;
    }
    callFrame() {
        return this.#callFrameInternal;
    }
    type() {
        return this.#typeInternal;
    }
    typeName() {
        switch (this.#typeInternal) {
            case "local" /* Local */:
                return i18nString(UIStrings.local);
            case "closure" /* Closure */:
                return i18nString(UIStrings.closure);
            case "catch" /* Catch */:
                return i18nString(UIStrings.catchBlock);
            case "eval" /* Eval */:
                return i18n.i18n.lockedString('Eval');
            case "block" /* Block */:
                return i18nString(UIStrings.block);
            case "script" /* Script */:
                return i18nString(UIStrings.script);
            case "with" /* With */:
                return i18nString(UIStrings.withBlock);
            case "global" /* Global */:
                return i18nString(UIStrings.global);
            case "module" /* Module */:
                return i18nString(UIStrings.module);
            case "wasm-expression-stack" /* WasmExpressionStack */:
                return i18nString(UIStrings.expression);
        }
        return '';
    }
    name() {
        return this.#nameInternal;
    }
    startLocation() {
        return this.#startLocationInternal;
    }
    endLocation() {
        return this.#endLocationInternal;
    }
    object() {
        if (this.#objectInternal) {
            return this.#objectInternal;
        }
        const runtimeModel = this.#callFrameInternal.debuggerModel.runtimeModel();
        const declarativeScope = this.#typeInternal !== "with" /* With */ &&
            this.#typeInternal !== "global" /* Global */;
        if (declarativeScope) {
            this.#objectInternal = runtimeModel.createScopeRemoteObject(this.#payload.object, new ScopeRef(this.#ordinal, this.#callFrameInternal.id));
        }
        else {
            this.#objectInternal = runtimeModel.createRemoteObject(this.#payload.object);
        }
        return this.#objectInternal;
    }
    description() {
        const declarativeScope = this.#typeInternal !== "with" /* With */ &&
            this.#typeInternal !== "global" /* Global */;
        return declarativeScope ? '' : (this.#payload.object.description || '');
    }
    icon() {
        return undefined;
    }
}
export class DebuggerPausedDetails {
    debuggerModel;
    callFrames;
    reason;
    auxData;
    breakpointIds;
    asyncStackTrace;
    asyncStackTraceId;
    constructor(debuggerModel, callFrames, reason, auxData, breakpointIds, asyncStackTrace, asyncStackTraceId) {
        this.debuggerModel = debuggerModel;
        this.callFrames = CallFrame.fromPayloadArray(debuggerModel, callFrames);
        this.reason = reason;
        this.auxData = auxData;
        this.breakpointIds = breakpointIds;
        if (asyncStackTrace) {
            this.asyncStackTrace = this.cleanRedundantFrames(asyncStackTrace);
        }
        this.asyncStackTraceId = asyncStackTraceId;
    }
    exception() {
        if (this.reason !== "exception" /* Exception */ &&
            this.reason !== "promiseRejection" /* PromiseRejection */) {
            return null;
        }
        return this.debuggerModel.runtimeModel().createRemoteObject(this.auxData);
    }
    cleanRedundantFrames(asyncStackTrace) {
        let stack = asyncStackTrace;
        let previous = null;
        while (stack) {
            // TODO(crbug.com/1254259): Remove this post-processing step once the V8
            // inspector back-end change propagated to Node LTS.
            if (stack.description === 'async function' && stack.callFrames.length) {
                stack.callFrames.shift();
            }
            if (previous && !stack.callFrames.length) {
                previous.parent = stack.parent;
            }
            else {
                previous = stack;
            }
            stack = stack.parent;
        }
        return asyncStackTrace;
    }
}
SDKModel.register(DebuggerModel, { capabilities: Capability.JS, autostart: true });
//# sourceMappingURL=DebuggerModel.js.map