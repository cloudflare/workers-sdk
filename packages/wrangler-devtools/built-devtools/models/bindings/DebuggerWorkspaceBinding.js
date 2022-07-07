// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import { CompilerScriptMapping } from './CompilerScriptMapping.js';
import { DebuggerLanguagePluginManager } from './DebuggerLanguagePlugins.js';
import { DefaultScriptMapping } from './DefaultScriptMapping.js';
import { IgnoreListManager } from './IgnoreListManager.js';
import { LiveLocationWithPool } from './LiveLocation.js';
import { ResourceMapping } from './ResourceMapping.js';
import { ResourceScriptMapping } from './ResourceScriptMapping.js';
let debuggerWorkspaceBindingInstance;
export class DebuggerWorkspaceBinding {
    workspace;
    #sourceMappings;
    #debuggerModelToData;
    #liveLocationPromises;
    pluginManager;
    #targetManager;
    constructor(targetManager, workspace) {
        this.workspace = workspace;
        this.#sourceMappings = [];
        this.#debuggerModelToData = new Map();
        targetManager.addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.GlobalObjectCleared, this.globalObjectCleared, this);
        targetManager.addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerResumed, this.debuggerResumed, this);
        targetManager.observeModels(SDK.DebuggerModel.DebuggerModel, this);
        this.#targetManager = targetManager;
        this.#liveLocationPromises = new Set();
        this.pluginManager = Root.Runtime.experiments.isEnabled('wasmDWARFDebugging') ?
            new DebuggerLanguagePluginManager(targetManager, workspace, this) :
            null;
    }
    initPluginManagerForTest() {
        if (Root.Runtime.experiments.isEnabled('wasmDWARFDebugging')) {
            if (!this.pluginManager) {
                this.pluginManager = new DebuggerLanguagePluginManager(this.#targetManager, this.workspace, this);
            }
        }
        else {
            this.pluginManager = null;
        }
        return this.pluginManager;
    }
    static instance(opts = { forceNew: null, targetManager: null, workspace: null }) {
        const { forceNew, targetManager, workspace } = opts;
        if (!debuggerWorkspaceBindingInstance || forceNew) {
            if (!targetManager || !workspace) {
                throw new Error(`Unable to create DebuggerWorkspaceBinding: targetManager and workspace must be provided: ${new Error().stack}`);
            }
            debuggerWorkspaceBindingInstance = new DebuggerWorkspaceBinding(targetManager, workspace);
        }
        return debuggerWorkspaceBindingInstance;
    }
    static removeInstance() {
        debuggerWorkspaceBindingInstance = undefined;
    }
    addSourceMapping(sourceMapping) {
        this.#sourceMappings.push(sourceMapping);
    }
    removeSourceMapping(sourceMapping) {
        const index = this.#sourceMappings.indexOf(sourceMapping);
        if (index !== -1) {
            this.#sourceMappings.splice(index, 1);
        }
    }
    async computeAutoStepRanges(mode, callFrame) {
        function contained(location, range) {
            const { start, end } = range;
            if (start.scriptId !== location.scriptId) {
                return false;
            }
            if (location.lineNumber < start.lineNumber || location.lineNumber > end.lineNumber) {
                return false;
            }
            if (location.lineNumber === start.lineNumber && location.columnNumber < start.columnNumber) {
                return false;
            }
            if (location.lineNumber === end.lineNumber && location.columnNumber >= end.columnNumber) {
                return false;
            }
            return true;
        }
        const rawLocation = callFrame.location();
        if (!rawLocation) {
            return [];
        }
        const pluginManager = this.pluginManager;
        let ranges = [];
        if (pluginManager) {
            if (mode === SDK.DebuggerModel.StepMode.StepOut) {
                // Step out of inline function.
                return await pluginManager.getInlinedFunctionRanges(rawLocation);
            }
            const uiLocation = await pluginManager.rawLocationToUILocation(rawLocation);
            if (uiLocation) {
                ranges = await pluginManager.uiLocationToRawLocationRanges(uiLocation.uiSourceCode, uiLocation.lineNumber, uiLocation.columnNumber) ||
                    [];
                // TODO(bmeurer): Remove the {rawLocation} from the {ranges}?
                ranges = ranges.filter(range => contained(rawLocation, range));
                if (mode === SDK.DebuggerModel.StepMode.StepOver) {
                    // Step over an inlined function.
                    ranges = ranges.concat(await pluginManager.getInlinedCalleesRanges(rawLocation));
                }
                return ranges;
            }
        }
        const compilerMapping = this.#debuggerModelToData.get(rawLocation.debuggerModel)?.compilerMapping;
        if (!compilerMapping) {
            return [];
        }
        if (mode === SDK.DebuggerModel.StepMode.StepOut) {
            // We should actually return the source range for the entire function
            // to skip over. Since we don't have that, we return an empty range
            // instead, to signal that we should perform a regular step-out.
            return [];
        }
        ranges = compilerMapping.getLocationRangesForSameSourceLocation(rawLocation);
        ranges = ranges.filter(range => contained(rawLocation, range));
        return ranges;
    }
    modelAdded(debuggerModel) {
        this.#debuggerModelToData.set(debuggerModel, new ModelData(debuggerModel, this));
        debuggerModel.setComputeAutoStepRangesCallback(this.computeAutoStepRanges.bind(this));
    }
    modelRemoved(debuggerModel) {
        debuggerModel.setComputeAutoStepRangesCallback(null);
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (modelData) {
            modelData.dispose();
            this.#debuggerModelToData.delete(debuggerModel);
        }
    }
    /**
     * The promise returned by this function is resolved once all *currently*
     * pending LiveLocations are processed.
     */
    async pendingLiveLocationChangesPromise() {
        await Promise.all(this.#liveLocationPromises);
    }
    recordLiveLocationChange(promise) {
        void promise.then(() => {
            this.#liveLocationPromises.delete(promise);
        });
        this.#liveLocationPromises.add(promise);
    }
    async updateLocations(script) {
        const modelData = this.#debuggerModelToData.get(script.debuggerModel);
        if (modelData) {
            const updatePromise = modelData.updateLocations(script);
            this.recordLiveLocationChange(updatePromise);
            await updatePromise;
        }
    }
    async createLiveLocation(rawLocation, updateDelegate, locationPool) {
        const modelData = this.#debuggerModelToData.get(rawLocation.debuggerModel);
        if (!modelData) {
            return null;
        }
        const liveLocationPromise = modelData.createLiveLocation(rawLocation, updateDelegate, locationPool);
        this.recordLiveLocationChange(liveLocationPromise);
        return liveLocationPromise;
    }
    async createStackTraceTopFrameLiveLocation(rawLocations, updateDelegate, locationPool) {
        console.assert(rawLocations.length > 0);
        const locationPromise = StackTraceTopFrameLocation.createStackTraceTopFrameLocation(rawLocations, this, updateDelegate, locationPool);
        this.recordLiveLocationChange(locationPromise);
        return locationPromise;
    }
    async createCallFrameLiveLocation(location, updateDelegate, locationPool) {
        const script = location.script();
        if (!script) {
            return null;
        }
        const debuggerModel = location.debuggerModel;
        const liveLocationPromise = this.createLiveLocation(location, updateDelegate, locationPool);
        this.recordLiveLocationChange(liveLocationPromise);
        const liveLocation = await liveLocationPromise;
        if (!liveLocation) {
            return null;
        }
        this.registerCallFrameLiveLocation(debuggerModel, liveLocation);
        return liveLocation;
    }
    async rawLocationToUILocation(rawLocation) {
        for (const sourceMapping of this.#sourceMappings) {
            const uiLocation = sourceMapping.rawLocationToUILocation(rawLocation);
            if (uiLocation) {
                return uiLocation;
            }
        }
        if (this.pluginManager) {
            const uiLocation = await this.pluginManager.rawLocationToUILocation(rawLocation);
            if (uiLocation) {
                return uiLocation;
            }
        }
        const modelData = this.#debuggerModelToData.get(rawLocation.debuggerModel);
        return modelData ? modelData.rawLocationToUILocation(rawLocation) : null;
    }
    uiSourceCodeForSourceMapSourceURL(debuggerModel, url, isContentScript) {
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (!modelData) {
            return null;
        }
        return modelData.compilerMapping.uiSourceCodeForURL(url, isContentScript);
    }
    async uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        for (const sourceMapping of this.#sourceMappings) {
            const locations = sourceMapping.uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber);
            if (locations.length) {
                return locations;
            }
        }
        const locations = await this.pluginManager?.uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber);
        if (locations) {
            return locations;
        }
        for (const modelData of this.#debuggerModelToData.values()) {
            const locations = modelData.uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber);
            if (locations.length) {
                return locations;
            }
        }
        return [];
    }
    uiLocationToRawLocationsForUnformattedJavaScript(uiSourceCode, lineNumber, columnNumber) {
        console.assert(uiSourceCode.contentType().isScript());
        const locations = [];
        for (const modelData of this.#debuggerModelToData.values()) {
            locations.push(...modelData.uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber));
        }
        return locations;
    }
    async normalizeUILocation(uiLocation) {
        const rawLocations = await this.uiLocationToRawLocations(uiLocation.uiSourceCode, uiLocation.lineNumber, uiLocation.columnNumber);
        for (const location of rawLocations) {
            const uiLocationCandidate = await this.rawLocationToUILocation(location);
            if (uiLocationCandidate) {
                return uiLocationCandidate;
            }
        }
        return uiLocation;
    }
    scriptFile(uiSourceCode, debuggerModel) {
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        return modelData ? modelData.getResourceMapping().scriptFile(uiSourceCode) : null;
    }
    scriptsForUISourceCode(uiSourceCode) {
        const scripts = new Set();
        if (this.pluginManager) {
            this.pluginManager.scriptsForUISourceCode(uiSourceCode).forEach(script => scripts.add(script));
        }
        for (const modelData of this.#debuggerModelToData.values()) {
            const resourceScriptFile = modelData.getResourceMapping().scriptFile(uiSourceCode);
            if (resourceScriptFile && resourceScriptFile.script) {
                scripts.add(resourceScriptFile.script);
            }
            modelData.compilerMapping.scriptsForUISourceCode(uiSourceCode).forEach(script => scripts.add(script));
        }
        return [...scripts];
    }
    scriptsForResource(uiSourceCode) {
        const scripts = new Set();
        for (const modelData of this.#debuggerModelToData.values()) {
            const resourceScriptFile = modelData.getResourceMapping().scriptFile(uiSourceCode);
            if (resourceScriptFile && resourceScriptFile.script) {
                scripts.add(resourceScriptFile.script);
            }
        }
        return [...scripts];
    }
    supportsConditionalBreakpoints(uiSourceCode) {
        // DevTools traditionally supported (JavaScript) conditions
        // for breakpoints everywhere, so we keep that behavior...
        if (!this.pluginManager) {
            return true;
        }
        const scripts = this.pluginManager.scriptsForUISourceCode(uiSourceCode);
        return scripts.every(script => script.isJavaScript());
    }
    sourceMapForScript(script) {
        const modelData = this.#debuggerModelToData.get(script.debuggerModel);
        if (!modelData) {
            return null;
        }
        return modelData.compilerMapping.sourceMapForScript(script);
    }
    globalObjectCleared(event) {
        this.reset(event.data);
    }
    reset(debuggerModel) {
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (!modelData) {
            return;
        }
        for (const location of modelData.callFrameLocations.values()) {
            this.removeLiveLocation(location);
        }
        modelData.callFrameLocations.clear();
    }
    resetForTest(target) {
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (modelData) {
            modelData.getResourceMapping().resetForTest();
        }
    }
    registerCallFrameLiveLocation(debuggerModel, location) {
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (modelData) {
            const locations = modelData.callFrameLocations;
            locations.add(location);
        }
    }
    removeLiveLocation(location) {
        const modelData = this.#debuggerModelToData.get(location.rawLocation.debuggerModel);
        if (modelData) {
            modelData.disposeLocation(location);
        }
    }
    debuggerResumed(event) {
        this.reset(event.data);
    }
}
class ModelData {
    #debuggerModel;
    #debuggerWorkspaceBinding;
    callFrameLocations;
    #defaultMapping;
    resourceMapping;
    compilerMapping;
    #locations;
    constructor(debuggerModel, debuggerWorkspaceBinding) {
        this.#debuggerModel = debuggerModel;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.callFrameLocations = new Set();
        const workspace = debuggerWorkspaceBinding.workspace;
        this.#defaultMapping = new DefaultScriptMapping(debuggerModel, workspace, debuggerWorkspaceBinding);
        this.resourceMapping = new ResourceScriptMapping(debuggerModel, workspace, debuggerWorkspaceBinding);
        this.compilerMapping = new CompilerScriptMapping(debuggerModel, workspace, debuggerWorkspaceBinding);
        this.#locations = new Platform.MapUtilities.Multimap();
        debuggerModel.setBeforePausedCallback(this.beforePaused.bind(this));
    }
    async createLiveLocation(rawLocation, updateDelegate, locationPool) {
        console.assert(rawLocation.scriptId !== '');
        const scriptId = rawLocation.scriptId;
        const location = new Location(scriptId, rawLocation, this.#debuggerWorkspaceBinding, updateDelegate, locationPool);
        this.#locations.set(scriptId, location);
        await location.update();
        return location;
    }
    disposeLocation(location) {
        this.#locations.delete(location.scriptId, location);
    }
    async updateLocations(script) {
        const promises = [];
        for (const location of this.#locations.get(script.scriptId)) {
            promises.push(location.update());
        }
        await Promise.all(promises);
    }
    rawLocationToUILocation(rawLocation) {
        let uiLocation = this.compilerMapping.rawLocationToUILocation(rawLocation);
        uiLocation = uiLocation || this.resourceMapping.rawLocationToUILocation(rawLocation);
        uiLocation = uiLocation || ResourceMapping.instance().jsLocationToUILocation(rawLocation);
        uiLocation = uiLocation || this.#defaultMapping.rawLocationToUILocation(rawLocation);
        return uiLocation;
    }
    uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber = 0) {
        // TODO(crbug.com/1153123): Revisit the `#columnNumber = 0` and also preserve `undefined` for source maps?
        let locations = this.compilerMapping.uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber);
        locations = locations.length ?
            locations :
            this.resourceMapping.uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber);
        locations = locations.length ?
            locations :
            ResourceMapping.instance().uiLocationToJSLocations(uiSourceCode, lineNumber, columnNumber);
        locations = locations.length ?
            locations :
            this.#defaultMapping.uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber);
        return locations;
    }
    beforePaused(debuggerPausedDetails) {
        return Boolean(debuggerPausedDetails.callFrames[0]);
    }
    dispose() {
        this.#debuggerModel.setBeforePausedCallback(null);
        this.compilerMapping.dispose();
        this.resourceMapping.dispose();
        this.#defaultMapping.dispose();
    }
    getResourceMapping() {
        return this.resourceMapping;
    }
}
export class Location extends LiveLocationWithPool {
    scriptId;
    rawLocation;
    #binding;
    constructor(scriptId, rawLocation, binding, updateDelegate, locationPool) {
        super(updateDelegate, locationPool);
        this.scriptId = scriptId;
        this.rawLocation = rawLocation;
        this.#binding = binding;
    }
    async uiLocation() {
        const debuggerModelLocation = this.rawLocation;
        return this.#binding.rawLocationToUILocation(debuggerModelLocation);
    }
    dispose() {
        super.dispose();
        this.#binding.removeLiveLocation(this);
    }
    async isIgnoreListed() {
        const uiLocation = await this.uiLocation();
        return uiLocation ? IgnoreListManager.instance().isIgnoreListedUISourceCode(uiLocation.uiSourceCode) : false;
    }
}
class StackTraceTopFrameLocation extends LiveLocationWithPool {
    #updateScheduled;
    #current;
    #locations;
    constructor(updateDelegate, locationPool) {
        super(updateDelegate, locationPool);
        this.#updateScheduled = true;
        this.#current = null;
        this.#locations = null;
    }
    static async createStackTraceTopFrameLocation(rawLocations, binding, updateDelegate, locationPool) {
        const location = new StackTraceTopFrameLocation(updateDelegate, locationPool);
        const locationsPromises = rawLocations.map(rawLocation => binding.createLiveLocation(rawLocation, location.scheduleUpdate.bind(location), locationPool));
        location.#locations = (await Promise.all(locationsPromises)).filter(l => Boolean(l));
        await location.updateLocation();
        return location;
    }
    async uiLocation() {
        return this.#current ? this.#current.uiLocation() : null;
    }
    async isIgnoreListed() {
        return this.#current ? this.#current.isIgnoreListed() : false;
    }
    dispose() {
        super.dispose();
        if (this.#locations) {
            for (const location of this.#locations) {
                location.dispose();
            }
        }
        this.#locations = null;
        this.#current = null;
    }
    async scheduleUpdate() {
        if (this.#updateScheduled) {
            return;
        }
        this.#updateScheduled = true;
        queueMicrotask(() => {
            void this.updateLocation();
        });
    }
    async updateLocation() {
        this.#updateScheduled = false;
        if (!this.#locations || this.#locations.length === 0) {
            return;
        }
        this.#current = this.#locations[0];
        for (const location of this.#locations) {
            if (!(await location.isIgnoreListed())) {
                this.#current = location;
                break;
            }
        }
        void this.update();
    }
}
//# sourceMappingURL=DebuggerWorkspaceBinding.js.map