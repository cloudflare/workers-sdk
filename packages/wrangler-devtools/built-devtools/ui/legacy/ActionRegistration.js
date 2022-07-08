// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Root from '../../core/root/root.js';
import { Context } from './Context.js';
export class Action extends Common.ObjectWrapper.ObjectWrapper {
    enabledInternal = true;
    toggledInternal = false;
    actionRegistration;
    constructor(actionRegistration) {
        super();
        this.actionRegistration = actionRegistration;
    }
    id() {
        return this.actionRegistration.actionId;
    }
    async execute() {
        if (!this.actionRegistration.loadActionDelegate) {
            return false;
        }
        const delegate = await this.actionRegistration.loadActionDelegate();
        const actionId = this.id();
        return delegate.handleAction(Context.instance(), actionId);
    }
    icon() {
        return this.actionRegistration.iconClass;
    }
    toggledIcon() {
        return this.actionRegistration.toggledIconClass;
    }
    toggleWithRedColor() {
        return Boolean(this.actionRegistration.toggleWithRedColor);
    }
    setEnabled(enabled) {
        if (this.enabledInternal === enabled) {
            return;
        }
        this.enabledInternal = enabled;
        this.dispatchEventToListeners("Enabled" /* Enabled */, enabled);
    }
    enabled() {
        return this.enabledInternal;
    }
    category() {
        return this.actionRegistration.category;
    }
    tags() {
        if (this.actionRegistration.tags) {
            // Get localized keys and separate by null character to prevent fuzzy matching from matching across them.
            return this.actionRegistration.tags.map(tag => tag()).join('\0');
        }
    }
    toggleable() {
        return Boolean(this.actionRegistration.toggleable);
    }
    title() {
        let title = this.actionRegistration.title ? this.actionRegistration.title() : '';
        const options = this.actionRegistration.options;
        if (options) {
            // Actions with an 'options' property don't have a title field. Instead, the displayed
            // title is taken from the 'title' property of the option that is not active. Only one of the
            // two options can be active at a given moment and the 'toggled' property of the action along
            // with the 'value' of the options are used to determine which one it is.
            for (const pair of options) {
                if (pair.value !== this.toggledInternal) {
                    title = pair.title();
                }
            }
        }
        return title;
    }
    toggled() {
        return this.toggledInternal;
    }
    setToggled(toggled) {
        console.assert(this.toggleable(), 'Shouldn\'t be toggling an untoggleable action', this.id());
        if (this.toggledInternal === toggled) {
            return;
        }
        this.toggledInternal = toggled;
        this.dispatchEventToListeners("Toggled" /* Toggled */, toggled);
    }
    options() {
        return this.actionRegistration.options;
    }
    contextTypes() {
        if (this.actionRegistration.contextTypes) {
            return this.actionRegistration.contextTypes();
        }
        return undefined;
    }
    canInstantiate() {
        return Boolean(this.actionRegistration.loadActionDelegate);
    }
    bindings() {
        return this.actionRegistration.bindings;
    }
    experiment() {
        return this.actionRegistration.experiment;
    }
    condition() {
        return this.actionRegistration.condition;
    }
    order() {
        return this.actionRegistration.order;
    }
}
const registeredActionExtensions = [];
const actionIdSet = new Set();
export function registerActionExtension(registration) {
    const actionId = registration.actionId;
    if (actionIdSet.has(actionId)) {
        throw new Error(`Duplicate Action id '${actionId}': ${new Error().stack}`);
    }
    actionIdSet.add(actionId);
    registeredActionExtensions.push(new Action(registration));
}
export function getRegisteredActionExtensions() {
    return registeredActionExtensions
        .filter(action => Root.Runtime.Runtime.isDescriptorEnabled({ experiment: action.experiment(), condition: action.condition() }))
        .sort((firstAction, secondAction) => {
        const order1 = firstAction.order() || 0;
        const order2 = secondAction.order() || 0;
        return order1 - order2;
    });
}
export function maybeRemoveActionExtension(actionId) {
    const actionIndex = registeredActionExtensions.findIndex(action => action.id() === actionId);
    if (actionIndex < 0 || !actionIdSet.delete(actionId)) {
        return false;
    }
    registeredActionExtensions.splice(actionIndex, 1);
    return true;
}
// TODO(crbug.com/1181019)
export const ActionCategory = {
    ELEMENTS: 'Elements',
    SCREENSHOT: 'Screenshot',
    NETWORK: 'Network',
    MEMORY: 'Memory',
    JAVASCRIPT_PROFILER: 'JavaScript Profiler',
    CONSOLE: 'Console',
    PERFORMANCE: 'Performance',
    MOBILE: 'Mobile',
    SENSORS: 'Sensors',
    HELP: 'Help',
    INPUTS: 'Inputs',
    LAYERS: 'Layers',
    NAVIGATION: 'Navigation',
    DRAWER: 'Drawer',
    GLOBAL: 'Global',
    RESOURCES: 'Resources',
    BACKGROUND_SERVICES: 'Background Services',
    SETTINGS: 'Settings',
    DEBUGGER: 'Debugger',
    SOURCES: 'Sources',
    RENDERING: 'Rendering',
};
//# sourceMappingURL=ActionRegistration.js.map