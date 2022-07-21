// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as SourceMapScopes from '../../models/source_map_scopes/source_map_scopes.js';
import * as LinearMemoryInspector from '../../ui/components/linear_memory_inspector/linear_memory_inspector.js';
import * as ObjectUI from '../../ui/legacy/components/object_ui/object_ui.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import scopeChainSidebarPaneStyles from './scopeChainSidebarPane.css.js';
const UIStrings = {
    /**
    *@description Loading indicator in Scope Sidebar Pane of the Sources panel
    */
    loading: 'Loading...',
    /**
    *@description Not paused message element text content in Call Stack Sidebar Pane of the Sources panel
    */
    notPaused: 'Not paused',
    /**
    *@description Empty placeholder in Scope Chain Sidebar Pane of the Sources panel
    */
    noVariables: 'No variables',
    /**
    *@description Text in the Sources panel Scope pane describing a closure scope.
    *@example {func} PH1
    */
    closureS: 'Closure ({PH1})',
    /**
    *@description Text that refers to closure as a programming term
    */
    closure: 'Closure',
    /**
    *@description Text in Scope Chain Sidebar Pane of the Sources panel
    */
    exception: 'Exception',
    /**
    *@description Text in Scope Chain Sidebar Pane of the Sources panel
    */
    returnValue: 'Return value',
    /**
    *@description A context menu item in the Scope View of the Sources Panel
    */
    revealInMemoryInspectorPanel: 'Reveal in Memory Inspector panel',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/ScopeChainSidebarPane.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let scopeChainSidebarPaneInstance;
export class ScopeChainSidebarPane extends UI.Widget.VBox {
    treeOutline;
    expandController;
    linkifier;
    infoElement;
    #scopesScript = null;
    constructor() {
        super(true);
        this.treeOutline = new ObjectUI.ObjectPropertiesSection.ObjectPropertiesSectionsTreeOutline();
        this.treeOutline.setShowSelectionOnKeyboardFocus(/* show */ true);
        this.expandController =
            new ObjectUI.ObjectPropertiesSection.ObjectPropertiesSectionsTreeExpandController(this.treeOutline);
        this.linkifier = new Components.Linkifier.Linkifier();
        this.infoElement = document.createElement('div');
        this.infoElement.className = 'gray-info-message';
        this.infoElement.tabIndex = -1;
        void this.update();
    }
    static instance() {
        if (!scopeChainSidebarPaneInstance) {
            scopeChainSidebarPaneInstance = new ScopeChainSidebarPane();
        }
        return scopeChainSidebarPaneInstance;
    }
    flavorChanged(_object) {
        void this.update();
    }
    focus() {
        if (this.hasFocus()) {
            return;
        }
        if (UI.Context.Context.instance().flavor(SDK.DebuggerModel.DebuggerPausedDetails)) {
            this.treeOutline.forceSelect();
        }
    }
    sourceMapAttached(event) {
        if (event.data.client === this.#scopesScript) {
            void this.update();
        }
    }
    setScopeSourceMapSubscription(callFrame) {
        const oldScript = this.#scopesScript;
        this.#scopesScript = callFrame?.script ?? null;
        // Shortcut for the case when we are listening to the same model.
        if (oldScript?.debuggerModel === this.#scopesScript?.debuggerModel) {
            return;
        }
        if (oldScript) {
            oldScript.debuggerModel.sourceMapManager().removeEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this);
        }
        if (this.#scopesScript) {
            this.#scopesScript.debuggerModel.sourceMapManager().addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this);
        }
    }
    async update() {
        // The `resolveThisObject(callFrame)` and `resolveScopeChain(callFrame)` calls
        // below may take a while to complete, so indicate to the user that something
        // is happening (see https://crbug.com/1162416).
        this.infoElement.textContent = i18nString(UIStrings.loading);
        this.contentElement.removeChildren();
        this.contentElement.appendChild(this.infoElement);
        this.linkifier.reset();
        const callFrame = UI.Context.Context.instance().flavor(SDK.DebuggerModel.CallFrame);
        this.setScopeSourceMapSubscription(callFrame);
        const [thisObject, scopeChain] = await Promise.all([
            SourceMapScopes.NamesResolver.resolveThisObject(callFrame),
            SourceMapScopes.NamesResolver.resolveScopeChain(callFrame),
        ]);
        // By now the developer might have moved on, and we don't want to show stale
        // scope information, so check again that we're still on the same CallFrame.
        if (callFrame === UI.Context.Context.instance().flavor(SDK.DebuggerModel.CallFrame)) {
            const details = UI.Context.Context.instance().flavor(SDK.DebuggerModel.DebuggerPausedDetails);
            this.treeOutline.removeChildren();
            if (!details || !callFrame || !scopeChain) {
                this.infoElement.textContent = i18nString(UIStrings.notPaused);
                return;
            }
            this.contentElement.removeChildren();
            this.contentElement.appendChild(this.treeOutline.element);
            let foundLocalScope = false;
            for (let i = 0; i < scopeChain.length; ++i) {
                const scope = scopeChain[i];
                const extraProperties = this.extraPropertiesForScope(scope, details, callFrame, thisObject, i === 0);
                if (scope.type() === "local" /* Local */) {
                    foundLocalScope = true;
                }
                const section = this.createScopeSectionTreeElement(scope, extraProperties);
                if (scope.type() === "global" /* Global */) {
                    section.collapse();
                }
                else if (!foundLocalScope || scope.type() === "local" /* Local */) {
                    section.expand();
                }
                this.treeOutline.appendChild(section);
                if (i === 0) {
                    section.select(/* omitFocus */ true);
                }
            }
            this.sidebarPaneUpdatedForTest();
        }
    }
    createScopeSectionTreeElement(scope, extraProperties) {
        let emptyPlaceholder = null;
        if (scope.type() === "local" /* Local */ || "closure" /* Closure */) {
            emptyPlaceholder = i18nString(UIStrings.noVariables);
        }
        let title = scope.typeName();
        if (scope.type() === "closure" /* Closure */) {
            const scopeName = scope.name();
            if (scopeName) {
                title = i18nString(UIStrings.closureS, { PH1: UI.UIUtils.beautifyFunctionName(scopeName) });
            }
            else {
                title = i18nString(UIStrings.closure);
            }
        }
        let subtitle = scope.description();
        if (!title || title === subtitle) {
            subtitle = null;
        }
        const icon = scope.icon();
        const titleElement = document.createElement('div');
        titleElement.classList.add('scope-chain-sidebar-pane-section-header');
        titleElement.classList.add('tree-element-title');
        if (icon) {
            const iconElement = document.createElement('img');
            iconElement.classList.add('scope-chain-sidebar-pane-section-icon');
            iconElement.src = icon;
            titleElement.appendChild(iconElement);
        }
        titleElement.createChild('div', 'scope-chain-sidebar-pane-section-subtitle').textContent = subtitle;
        titleElement.createChild('div', 'scope-chain-sidebar-pane-section-title').textContent = title;
        const section = new ObjectUI.ObjectPropertiesSection.RootElement(SourceMapScopes.NamesResolver.resolveScopeInObject(scope), this.linkifier, emptyPlaceholder, 0 /* All */, extraProperties);
        section.title = titleElement;
        section.listItemElement.classList.add('scope-chain-sidebar-pane-section');
        section.listItemElement.setAttribute('aria-label', title);
        this.expandController.watchSection(title + (subtitle ? ':' + subtitle : ''), section);
        return section;
    }
    extraPropertiesForScope(scope, details, callFrame, thisObject, isFirstScope) {
        if (scope.type() !== "local" /* Local */ || callFrame.script.isWasm()) {
            return [];
        }
        const extraProperties = [];
        if (thisObject) {
            extraProperties.push(new SDK.RemoteObject.RemoteObjectProperty('this', thisObject, undefined, undefined, undefined, undefined, undefined, /* synthetic */ true));
        }
        if (isFirstScope) {
            const exception = details.exception();
            if (exception) {
                extraProperties.push(new SDK.RemoteObject.RemoteObjectProperty(i18nString(UIStrings.exception), exception, undefined, undefined, undefined, undefined, undefined, 
                /* synthetic */ true));
            }
            const returnValue = callFrame.returnValue();
            if (returnValue) {
                extraProperties.push(new SDK.RemoteObject.RemoteObjectProperty(i18nString(UIStrings.returnValue), returnValue, undefined, undefined, undefined, undefined, undefined, 
                /* synthetic */ true, callFrame.setReturnValue.bind(callFrame)));
            }
        }
        return extraProperties;
    }
    sidebarPaneUpdatedForTest() {
    }
    wasShown() {
        super.wasShown();
        this.treeOutline.registerCSSFiles([scopeChainSidebarPaneStyles]);
        this.registerCSSFiles([scopeChainSidebarPaneStyles]);
    }
}
let openLinearMemoryInspectorInstance;
export class OpenLinearMemoryInspector extends UI.Widget.VBox {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!openLinearMemoryInspectorInstance || forceNew) {
            openLinearMemoryInspectorInstance = new OpenLinearMemoryInspector();
        }
        return openLinearMemoryInspectorInstance;
    }
    appendApplicableItems(event, contextMenu, target) {
        if (target instanceof ObjectUI.ObjectPropertiesSection.ObjectPropertyTreeElement) {
            if (target.property && target.property.value &&
                LinearMemoryInspector.LinearMemoryInspectorController.isMemoryObjectProperty(target.property.value)) {
                contextMenu.debugSection().appendItem(i18nString(UIStrings.revealInMemoryInspectorPanel), this.openMemoryInspector.bind(this, target.property.value));
            }
        }
    }
    async openMemoryInspector(obj) {
        const controller = LinearMemoryInspector.LinearMemoryInspectorController.LinearMemoryInspectorController.instance();
        Host.userMetrics.linearMemoryInspectorRevealedFrom(Host.UserMetrics.LinearMemoryInspectorRevealedFrom.ContextMenu);
        void controller.openInspectorView(obj);
    }
}
//# sourceMappingURL=ScopeChainSidebarPane.js.map