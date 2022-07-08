// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
let ignoreListManagerInstance;
export class IgnoreListManager {
    #debuggerWorkspaceBinding;
    #listeners;
    #isIgnoreListedURLCache;
    constructor(debuggerWorkspaceBinding) {
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.GlobalObjectCleared, this.clearCacheIfNeeded.bind(this), this);
        Common.Settings.Settings.instance()
            .moduleSetting('skipStackFramesPattern')
            .addChangeListener(this.patternChanged.bind(this));
        Common.Settings.Settings.instance()
            .moduleSetting('skipContentScripts')
            .addChangeListener(this.patternChanged.bind(this));
        this.#listeners = new Set();
        this.#isIgnoreListedURLCache = new Map();
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.DebuggerModel.DebuggerModel, this);
    }
    static instance(opts = { forceNew: null, debuggerWorkspaceBinding: null }) {
        const { forceNew, debuggerWorkspaceBinding } = opts;
        if (!ignoreListManagerInstance || forceNew) {
            if (!debuggerWorkspaceBinding) {
                throw new Error(`Unable to create settings: targetManager, workspace, and debuggerWorkspaceBinding must be provided: ${new Error().stack}`);
            }
            ignoreListManagerInstance = new IgnoreListManager(debuggerWorkspaceBinding);
        }
        return ignoreListManagerInstance;
    }
    addChangeListener(listener) {
        this.#listeners.add(listener);
    }
    removeChangeListener(listener) {
        this.#listeners.delete(listener);
    }
    modelAdded(debuggerModel) {
        void this.setIgnoreListPatterns(debuggerModel);
        const sourceMapManager = debuggerModel.sourceMapManager();
        sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this);
        sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this);
    }
    modelRemoved(debuggerModel) {
        this.clearCacheIfNeeded();
        const sourceMapManager = debuggerModel.sourceMapManager();
        sourceMapManager.removeEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this);
        sourceMapManager.removeEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this);
    }
    clearCacheIfNeeded() {
        if (this.#isIgnoreListedURLCache.size > 1024) {
            this.#isIgnoreListedURLCache.clear();
        }
    }
    getSkipStackFramesPatternSetting() {
        return Common.Settings.Settings.instance().moduleSetting('skipStackFramesPattern');
    }
    setIgnoreListPatterns(debuggerModel) {
        const regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
        const patterns = [];
        for (const item of regexPatterns) {
            if (!item.disabled && item.pattern) {
                patterns.push(item.pattern);
            }
        }
        return debuggerModel.setBlackboxPatterns(patterns);
    }
    isIgnoreListedUISourceCode(uiSourceCode) {
        const projectType = uiSourceCode.project().type();
        const isContentScript = projectType === Workspace.Workspace.projectTypes.ContentScripts;
        if (isContentScript && Common.Settings.Settings.instance().moduleSetting('skipContentScripts').get()) {
            return true;
        }
        const url = this.uiSourceCodeURL(uiSourceCode);
        return url ? this.isIgnoreListedURL(url) : false;
    }
    isIgnoreListedURL(url, isContentScript) {
        if (this.#isIgnoreListedURLCache.has(url)) {
            return Boolean(this.#isIgnoreListedURLCache.get(url));
        }
        if (isContentScript && Common.Settings.Settings.instance().moduleSetting('skipContentScripts').get()) {
            return true;
        }
        const regex = this.getSkipStackFramesPatternSetting().asRegExp();
        const isIgnoreListed = (regex && regex.test(url)) || false;
        this.#isIgnoreListedURLCache.set(url, isIgnoreListed);
        return isIgnoreListed;
    }
    sourceMapAttached(event) {
        const script = event.data.client;
        const sourceMap = event.data.sourceMap;
        void this.updateScriptRanges(script, sourceMap);
    }
    sourceMapDetached(event) {
        const script = event.data.client;
        void this.updateScriptRanges(script, null);
    }
    async updateScriptRanges(script, sourceMap) {
        let hasIgnoreListedMappings = false;
        if (!IgnoreListManager.instance().isIgnoreListedURL(script.sourceURL, script.isContentScript())) {
            hasIgnoreListedMappings = sourceMap ? sourceMap.sourceURLs().some(url => this.isIgnoreListedURL(url)) : false;
        }
        if (!hasIgnoreListedMappings) {
            if (scriptToRange.get(script) && await script.setBlackboxedRanges([])) {
                scriptToRange.delete(script);
            }
            await this.#debuggerWorkspaceBinding.updateLocations(script);
            return;
        }
        if (!sourceMap) {
            return;
        }
        const mappings = sourceMap.mappings();
        const newRanges = [];
        if (mappings.length > 0) {
            let currentIgnoreListed = false;
            if (mappings[0].lineNumber !== 0 || mappings[0].columnNumber !== 0) {
                newRanges.push({ lineNumber: 0, columnNumber: 0 });
                currentIgnoreListed = true;
            }
            for (const mapping of mappings) {
                if (mapping.sourceURL && currentIgnoreListed !== this.isIgnoreListedURL(mapping.sourceURL)) {
                    newRanges.push({ lineNumber: mapping.lineNumber, columnNumber: mapping.columnNumber });
                    currentIgnoreListed = !currentIgnoreListed;
                }
            }
        }
        const oldRanges = scriptToRange.get(script) || [];
        if (!isEqual(oldRanges, newRanges) && await script.setBlackboxedRanges(newRanges)) {
            scriptToRange.set(script, newRanges);
        }
        void this.#debuggerWorkspaceBinding.updateLocations(script);
        function isEqual(rangesA, rangesB) {
            if (rangesA.length !== rangesB.length) {
                return false;
            }
            for (let i = 0; i < rangesA.length; ++i) {
                if (rangesA[i].lineNumber !== rangesB[i].lineNumber || rangesA[i].columnNumber !== rangesB[i].columnNumber) {
                    return false;
                }
            }
            return true;
        }
    }
    uiSourceCodeURL(uiSourceCode) {
        return uiSourceCode.project().type() === Workspace.Workspace.projectTypes.Debugger ? null : uiSourceCode.url();
    }
    canIgnoreListUISourceCode(uiSourceCode) {
        const url = this.uiSourceCodeURL(uiSourceCode);
        return url ? Boolean(this.urlToRegExpString(url)) : false;
    }
    ignoreListUISourceCode(uiSourceCode) {
        const url = this.uiSourceCodeURL(uiSourceCode);
        if (url) {
            this.ignoreListURL(url);
        }
    }
    unIgnoreListUISourceCode(uiSourceCode) {
        const url = this.uiSourceCodeURL(uiSourceCode);
        if (url) {
            this.unIgnoreListURL(url);
        }
    }
    ignoreListContentScripts() {
        Common.Settings.Settings.instance().moduleSetting('skipContentScripts').set(true);
    }
    unIgnoreListContentScripts() {
        Common.Settings.Settings.instance().moduleSetting('skipContentScripts').set(false);
    }
    ignoreListURL(url) {
        const regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
        const regexValue = this.urlToRegExpString(url);
        if (!regexValue) {
            return;
        }
        let found = false;
        for (let i = 0; i < regexPatterns.length; ++i) {
            const item = regexPatterns[i];
            if (item.pattern === regexValue) {
                item.disabled = false;
                found = true;
                break;
            }
        }
        if (!found) {
            regexPatterns.push({ pattern: regexValue, disabled: undefined });
        }
        this.getSkipStackFramesPatternSetting().setAsArray(regexPatterns);
    }
    unIgnoreListURL(url) {
        let regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
        const regexValue = IgnoreListManager.instance().urlToRegExpString(url);
        if (!regexValue) {
            return;
        }
        regexPatterns = regexPatterns.filter(function (item) {
            return item.pattern !== regexValue;
        });
        for (let i = 0; i < regexPatterns.length; ++i) {
            const item = regexPatterns[i];
            if (item.disabled) {
                continue;
            }
            try {
                const regex = new RegExp(item.pattern);
                if (regex.test(url)) {
                    item.disabled = true;
                }
            }
            catch (e) {
            }
        }
        this.getSkipStackFramesPatternSetting().setAsArray(regexPatterns);
    }
    async patternChanged() {
        this.#isIgnoreListedURLCache.clear();
        const promises = [];
        for (const debuggerModel of SDK.TargetManager.TargetManager.instance().models(SDK.DebuggerModel.DebuggerModel)) {
            promises.push(this.setIgnoreListPatterns(debuggerModel));
            const sourceMapManager = debuggerModel.sourceMapManager();
            for (const script of debuggerModel.scripts()) {
                promises.push(this.updateScriptRanges(script, sourceMapManager.sourceMapForClient(script)));
            }
        }
        await Promise.all(promises);
        const listeners = Array.from(this.#listeners);
        for (const listener of listeners) {
            listener();
        }
        this.patternChangeFinishedForTests();
    }
    patternChangeFinishedForTests() {
        // This method is sniffed in tests.
    }
    urlToRegExpString(url) {
        const parsedURL = new Common.ParsedURL.ParsedURL(url);
        if (parsedURL.isAboutBlank() || parsedURL.isDataURL()) {
            return '';
        }
        if (!parsedURL.isValid) {
            return '^' + Platform.StringUtilities.escapeForRegExp(url) + '$';
        }
        let name = parsedURL.lastPathComponent;
        if (name) {
            name = '/' + name;
        }
        else if (parsedURL.folderPathComponents) {
            name = parsedURL.folderPathComponents + '/';
        }
        if (!name) {
            name = parsedURL.host;
        }
        if (!name) {
            return '';
        }
        const scheme = parsedURL.scheme;
        let prefix = '';
        if (scheme && scheme !== 'http' && scheme !== 'https') {
            prefix = '^' + scheme + '://';
            if (scheme === 'chrome-extension') {
                prefix += parsedURL.host + '\\b';
            }
            prefix += '.*';
        }
        return prefix + Platform.StringUtilities.escapeForRegExp(name) + (url.endsWith(name) ? '$' : '\\b');
    }
}
const scriptToRange = new WeakMap();
//# sourceMappingURL=IgnoreListManager.js.map