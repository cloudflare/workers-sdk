// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var RegisteredAdorners;
(function (RegisteredAdorners) {
    RegisteredAdorners["GRID"] = "grid";
    RegisteredAdorners["FLEX"] = "flex";
    RegisteredAdorners["AD"] = "ad";
    RegisteredAdorners["SCROLL_SNAP"] = "scroll-snap";
    RegisteredAdorners["CONTAINER"] = "container";
    RegisteredAdorners["SLOT"] = "slot";
    RegisteredAdorners["TOP_LAYER"] = "top-layer";
})(RegisteredAdorners || (RegisteredAdorners = {}));
// This enum-like const object serves as the authoritative registry for all the
// adorners available.
export function getRegisteredAdorner(which) {
    switch (which) {
        case RegisteredAdorners.GRID:
            return {
                name: 'grid',
                category: "Layout" /* LAYOUT */,
                enabledByDefault: true,
            };
        case RegisteredAdorners.FLEX:
            return {
                name: 'flex',
                category: "Layout" /* LAYOUT */,
                enabledByDefault: true,
            };
        case RegisteredAdorners.AD:
            return {
                name: 'ad',
                category: "Security" /* SECURITY */,
                enabledByDefault: true,
            };
        case RegisteredAdorners.SCROLL_SNAP:
            return {
                name: 'scroll-snap',
                category: "Layout" /* LAYOUT */,
                enabledByDefault: true,
            };
        case RegisteredAdorners.CONTAINER:
            return {
                name: 'container',
                category: "Layout" /* LAYOUT */,
                enabledByDefault: true,
            };
        case RegisteredAdorners.SLOT:
            return {
                name: 'slot',
                category: "Layout" /* LAYOUT */,
                enabledByDefault: true,
            };
        case RegisteredAdorners.TOP_LAYER:
            return {
                name: 'top-layer',
                category: "Layout" /* LAYOUT */,
                enabledByDefault: true,
            };
    }
}
let adornerNameToCategoryMap = undefined;
function getCategoryFromAdornerName(name) {
    if (!adornerNameToCategoryMap) {
        adornerNameToCategoryMap = new Map();
        for (const { name, category } of Object.values(RegisteredAdorners).map(getRegisteredAdorner)) {
            adornerNameToCategoryMap.set(name, category);
        }
    }
    return adornerNameToCategoryMap.get(name) || "Default" /* DEFAULT */;
}
export const DefaultAdornerSettings = Object.values(RegisteredAdorners).map(getRegisteredAdorner).map(({ name, enabledByDefault }) => ({
    adorner: name,
    isEnabled: enabledByDefault,
}));
export class AdornerManager {
    #adornerSettings = new Map();
    #settingStore;
    constructor(settingStore) {
        this.#settingStore = settingStore;
        this.#syncSettings();
    }
    updateSettings(settings) {
        this.#adornerSettings = settings;
        this.#persistCurrentSettings();
    }
    getSettings() {
        return this.#adornerSettings;
    }
    isAdornerEnabled(adornerText) {
        return this.#adornerSettings.get(adornerText) || false;
    }
    #persistCurrentSettings() {
        const settingList = [];
        for (const [adorner, isEnabled] of this.#adornerSettings) {
            settingList.push({ adorner, isEnabled });
        }
        this.#settingStore.set(settingList);
    }
    #loadSettings() {
        const settingList = this.#settingStore.get();
        for (const setting of settingList) {
            this.#adornerSettings.set(setting.adorner, setting.isEnabled);
        }
    }
    #syncSettings() {
        this.#loadSettings();
        // Prune outdated adorners and add new ones to the persistence.
        const outdatedAdorners = new Set(this.#adornerSettings.keys());
        for (const { adorner, isEnabled } of DefaultAdornerSettings) {
            outdatedAdorners.delete(adorner);
            if (!this.#adornerSettings.has(adorner)) {
                this.#adornerSettings.set(adorner, isEnabled);
            }
        }
        for (const outdatedAdorner of outdatedAdorners) {
            this.#adornerSettings.delete(outdatedAdorner);
        }
        this.#persistCurrentSettings();
    }
}
const OrderedAdornerCategories = [
    "Security" /* SECURITY */,
    "Layout" /* LAYOUT */,
    "Default" /* DEFAULT */,
];
// Use idx + 1 for the order to avoid JavaScript's 0 == false issue
export const AdornerCategoryOrder = new Map(OrderedAdornerCategories.map((category, idx) => [category, idx + 1]));
export function compareAdornerNamesByCategory(nameA, nameB) {
    const orderA = AdornerCategoryOrder.get(getCategoryFromAdornerName(nameA)) || Number.POSITIVE_INFINITY;
    const orderB = AdornerCategoryOrder.get(getCategoryFromAdornerName(nameB)) || Number.POSITIVE_INFINITY;
    return orderA - orderB;
}
//# sourceMappingURL=AdornerManager.js.map