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
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
const uiSourceCodeToScriptsMap = new WeakMap();
const scriptToUISourceCodeMap = new WeakMap();
export class DefaultScriptMapping {
    #debuggerModel;
    #debuggerWorkspaceBinding;
    #project;
    #eventListeners;
    #uiSourceCodeToScriptsMap;
    constructor(debuggerModel, workspace, debuggerWorkspaceBinding) {
        this.#debuggerModel = debuggerModel;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.#project = new ContentProviderBasedProject(workspace, 'debugger:' + debuggerModel.target().id(), Workspace.Workspace.projectTypes.Debugger, '', true /* isServiceProject */);
        this.#eventListeners = [
            debuggerModel.addEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this.debuggerReset, this),
            debuggerModel.addEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, this.parsedScriptSource, this),
            debuggerModel.addEventListener(SDK.DebuggerModel.Events.DiscardedAnonymousScriptSource, this.discardedScriptSource, this),
        ];
        this.#uiSourceCodeToScriptsMap = new WeakMap();
    }
    static createV8ScriptURL(script) {
        const name = Common.ParsedURL.ParsedURL.extractName(script.sourceURL);
        const url = 'debugger:///VM' + script.scriptId + (name ? ' ' + name : '');
        return url;
    }
    static scriptForUISourceCode(uiSourceCode) {
        const scripts = uiSourceCodeToScriptsMap.get(uiSourceCode);
        return scripts ? scripts.values().next().value : null;
    }
    rawLocationToUILocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const uiSourceCode = scriptToUISourceCodeMap.get(script);
        if (!uiSourceCode) {
            return null;
        }
        const { lineNumber, columnNumber = 0 } = rawLocation;
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const script = this.#uiSourceCodeToScriptsMap.get(uiSourceCode);
        if (!script) {
            return [];
        }
        return [this.#debuggerModel.createRawLocation(script, lineNumber, columnNumber)];
    }
    parsedScriptSource(event) {
        const script = event.data;
        const url = DefaultScriptMapping.createV8ScriptURL(script);
        const uiSourceCode = this.#project.createUISourceCode(url, Common.ResourceType.resourceTypes.Script);
        this.#uiSourceCodeToScriptsMap.set(uiSourceCode, script);
        const scriptSet = uiSourceCodeToScriptsMap.get(uiSourceCode);
        if (!scriptSet) {
            uiSourceCodeToScriptsMap.set(uiSourceCode, new Set([script]));
        }
        else {
            scriptSet.add(script);
        }
        scriptToUISourceCodeMap.set(script, uiSourceCode);
        this.#project.addUISourceCodeWithProvider(uiSourceCode, script, null, 'text/javascript');
        void this.#debuggerWorkspaceBinding.updateLocations(script);
    }
    discardedScriptSource(event) {
        const script = event.data;
        const uiSourceCode = scriptToUISourceCodeMap.get(script);
        if (!uiSourceCode) {
            return;
        }
        scriptToUISourceCodeMap.delete(script);
        this.#uiSourceCodeToScriptsMap.delete(uiSourceCode);
        const scripts = uiSourceCodeToScriptsMap.get(uiSourceCode);
        if (scripts) {
            scripts.delete(script);
            if (!scripts.size) {
                uiSourceCodeToScriptsMap.delete(uiSourceCode);
            }
        }
        this.#project.removeUISourceCode(uiSourceCode.url());
    }
    debuggerReset() {
        this.#project.reset();
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.debuggerReset();
        this.#project.dispose();
    }
}
//# sourceMappingURL=DefaultScriptMapping.js.map