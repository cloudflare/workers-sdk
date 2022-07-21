// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../platform/platform.js';
const queryParamsObject = new URLSearchParams(location.search);
let runtimePlatform = '';
let runtimeInstance;
export function getRemoteBase(location = self.location.toString()) {
    const url = new URL(location);
    const remoteBase = url.searchParams.get('remoteBase');
    if (!remoteBase) {
        return null;
    }
    const version = /\/serve_file\/(@[0-9a-zA-Z]+)\/?$/.exec(remoteBase);
    if (!version) {
        return null;
    }
    return { base: `${url.origin}/remote/serve_file/${version[1]}/`, version: version[1] };
}
export class Runtime {
    constructor() {
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!runtimeInstance || forceNew) {
            runtimeInstance = new Runtime();
        }
        return runtimeInstance;
    }
    static removeInstance() {
        runtimeInstance = undefined;
    }
    static queryParam(name) {
        return queryParamsObject.get(name);
    }
    static setQueryParamForTesting(name, value) {
        queryParamsObject.set(name, value);
    }
    static experimentsSetting() {
        try {
            return JSON.parse(self.localStorage && self.localStorage['experiments'] ? self.localStorage['experiments'] : '{}');
        }
        catch (e) {
            console.error('Failed to parse localStorage[\'experiments\']');
            return {};
        }
    }
    static setPlatform(platform) {
        runtimePlatform = platform;
    }
    static platform() {
        return runtimePlatform;
    }
    static isDescriptorEnabled(descriptor) {
        const activatorExperiment = descriptor['experiment'];
        if (activatorExperiment === '*') {
            return true;
        }
        if (activatorExperiment && activatorExperiment.startsWith('!') &&
            experiments.isEnabled(activatorExperiment.substring(1))) {
            return false;
        }
        if (activatorExperiment && !activatorExperiment.startsWith('!') && !experiments.isEnabled(activatorExperiment)) {
            return false;
        }
        const condition = descriptor['condition'];
        if (condition && !condition.startsWith('!') && !Runtime.queryParam(condition)) {
            return false;
        }
        if (condition && condition.startsWith('!') && Runtime.queryParam(condition.substring(1))) {
            return false;
        }
        return true;
    }
    loadLegacyModule(modulePath) {
        return import(`../../${modulePath}`);
    }
}
export class ExperimentsSupport {
    #experiments;
    #experimentNames;
    #enabledTransiently;
    #enabledByDefault;
    #serverEnabled;
    constructor() {
        this.#experiments = [];
        this.#experimentNames = new Set();
        this.#enabledTransiently = new Set();
        this.#enabledByDefault = new Set();
        this.#serverEnabled = new Set();
    }
    allConfigurableExperiments() {
        const result = [];
        for (const experiment of this.#experiments) {
            if (!this.#enabledTransiently.has(experiment.name)) {
                result.push(experiment);
            }
        }
        return result;
    }
    enabledExperiments() {
        return this.#experiments.filter(experiment => experiment.isEnabled());
    }
    setExperimentsSetting(value) {
        if (!self.localStorage) {
            return;
        }
        self.localStorage['experiments'] = JSON.stringify(value);
    }
    register(experimentName, experimentTitle, unstable, docLink) {
        Platform.DCHECK(() => !this.#experimentNames.has(experimentName), 'Duplicate registration of experiment ' + experimentName);
        this.#experimentNames.add(experimentName);
        this.#experiments.push(new Experiment(this, experimentName, experimentTitle, Boolean(unstable), docLink ?? Platform.DevToolsPath.EmptyUrlString));
    }
    isEnabled(experimentName) {
        this.checkExperiment(experimentName);
        // Check for explicitly disabled #experiments first - the code could call setEnable(false) on the experiment enabled
        // by default and we should respect that.
        if (Runtime.experimentsSetting()[experimentName] === false) {
            return false;
        }
        if (this.#enabledTransiently.has(experimentName) || this.#enabledByDefault.has(experimentName)) {
            return true;
        }
        if (this.#serverEnabled.has(experimentName)) {
            return true;
        }
        return Boolean(Runtime.experimentsSetting()[experimentName]);
    }
    setEnabled(experimentName, enabled) {
        this.checkExperiment(experimentName);
        const experimentsSetting = Runtime.experimentsSetting();
        experimentsSetting[experimentName] = enabled;
        this.setExperimentsSetting(experimentsSetting);
    }
    enableExperimentsTransiently(experimentNames) {
        for (const experimentName of experimentNames) {
            this.checkExperiment(experimentName);
            this.#enabledTransiently.add(experimentName);
        }
    }
    enableExperimentsByDefault(experimentNames) {
        for (const experimentName of experimentNames) {
            this.checkExperiment(experimentName);
            this.#enabledByDefault.add(experimentName);
        }
    }
    setServerEnabledExperiments(experimentNames) {
        for (const experiment of experimentNames) {
            this.checkExperiment(experiment);
            this.#serverEnabled.add(experiment);
        }
    }
    enableForTest(experimentName) {
        this.checkExperiment(experimentName);
        this.#enabledTransiently.add(experimentName);
    }
    disableForTest(experimentName) {
        this.checkExperiment(experimentName);
        this.#enabledTransiently.delete(experimentName);
    }
    clearForTest() {
        this.#experiments = [];
        this.#experimentNames.clear();
        this.#enabledTransiently.clear();
        this.#enabledByDefault.clear();
        this.#serverEnabled.clear();
    }
    cleanUpStaleExperiments() {
        const experimentsSetting = Runtime.experimentsSetting();
        const cleanedUpExperimentSetting = {};
        for (const { name: experimentName } of this.#experiments) {
            if (experimentsSetting.hasOwnProperty(experimentName)) {
                const isEnabled = experimentsSetting[experimentName];
                if (isEnabled || this.#enabledByDefault.has(experimentName)) {
                    cleanedUpExperimentSetting[experimentName] = isEnabled;
                }
            }
        }
        this.setExperimentsSetting(cleanedUpExperimentSetting);
    }
    checkExperiment(experimentName) {
        Platform.DCHECK(() => this.#experimentNames.has(experimentName), 'Unknown experiment ' + experimentName);
    }
}
export class Experiment {
    name;
    title;
    unstable;
    docLink;
    #experiments;
    constructor(experiments, name, title, unstable, docLink) {
        this.name = name;
        this.title = title;
        this.unstable = unstable;
        this.docLink = docLink;
        this.#experiments = experiments;
    }
    isEnabled() {
        return this.#experiments.isEnabled(this.name);
    }
    setEnabled(enabled) {
        this.#experiments.setEnabled(this.name, enabled);
    }
}
// This must be constructed after the query parameters have been parsed.
export const experiments = new ExperimentsSupport();
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var ExperimentName;
(function (ExperimentName) {
    ExperimentName["CAPTURE_NODE_CREATION_STACKS"] = "captureNodeCreationStacks";
    ExperimentName["CSS_OVERVIEW"] = "cssOverview";
    ExperimentName["LIVE_HEAP_PROFILE"] = "liveHeapProfile";
    ExperimentName["DEVELOPER_RESOURCES_VIEW"] = "developerResourcesView";
    ExperimentName["TIMELINE_REPLAY_EVENT"] = "timelineReplayEvent";
    ExperimentName["CSP_VIOLATIONS_VIEW"] = "cspViolationsView";
    ExperimentName["WASM_DWARF_DEBUGGING"] = "wasmDWARFDebugging";
    ExperimentName["ALL"] = "*";
    ExperimentName["PROTOCOL_MONITOR"] = "protocolMonitor";
    ExperimentName["WEBAUTHN_PANE"] = "webauthnPane";
    ExperimentName["SYNC_SETTINGS"] = "syncSettings";
    ExperimentName["FULL_ACCESSIBILITY_TREE"] = "fullAccessibilityTree";
    ExperimentName["PRECISE_CHANGES"] = "preciseChanges";
    ExperimentName["STYLES_PANE_CSS_CHANGES"] = "stylesPaneCSSChanges";
    ExperimentName["HEADER_OVERRIDES"] = "headerOverrides";
    ExperimentName["CSS_LAYERS"] = "cssLayers";
    ExperimentName["EYEDROPPER_COLOR_PICKER"] = "eyedropperColorPicker";
    ExperimentName["INSTRUMENTATION_BREAKPOINTS"] = "instrumentationBreakpoints";
    ExperimentName["CSS_AUTHORING_HINTS"] = "cssAuthoringHints";
    ExperimentName["AUTHORED_DEPLOYED_GROUPING"] = "authoredDeployedGrouping";
})(ExperimentName || (ExperimentName = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var ConditionName;
(function (ConditionName) {
    ConditionName["CAN_DOCK"] = "can_dock";
    ConditionName["NOT_SOURCES_HIDE_ADD_FOLDER"] = "!sources.hide_add_folder";
})(ConditionName || (ConditionName = {}));
//# sourceMappingURL=Runtime.js.map