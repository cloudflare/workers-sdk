// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as EventListeners from '../event_listeners/event_listeners.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    *@description Label for a button in the sources panel that refreshes the list of global event listeners.
    */
    refreshGlobalListeners: 'Refresh global listeners',
};
const str_ = i18n.i18n.registerUIStrings('panels/browser_debugger/ObjectEventListenersSidebarPane.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let objectEventListenersSidebarPaneInstance;
export class ObjectEventListenersSidebarPane extends UI.Widget.VBox {
    #refreshButton;
    #eventListenersView;
    #lastRequestedContext;
    constructor() {
        super();
        this.#refreshButton =
            new UI.Toolbar.ToolbarButton(i18nString(UIStrings.refreshGlobalListeners), 'largeicon-refresh');
        this.#refreshButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.refreshClick, this);
        this.#refreshButton.setEnabled(false);
        this.#eventListenersView = new EventListeners.EventListenersView.EventListenersView(this.update.bind(this), /* enableDefaultTreeFocus */ true);
        this.#eventListenersView.show(this.element);
        this.setDefaultFocusedChild(this.#eventListenersView);
    }
    static instance() {
        if (!objectEventListenersSidebarPaneInstance) {
            objectEventListenersSidebarPaneInstance = new ObjectEventListenersSidebarPane();
        }
        return objectEventListenersSidebarPaneInstance;
    }
    get eventListenersView() {
        return this.#eventListenersView;
    }
    toolbarItems() {
        return [this.#refreshButton];
    }
    update() {
        if (this.#lastRequestedContext) {
            this.#lastRequestedContext.runtimeModel.releaseObjectGroup(objectGroupName);
            this.#lastRequestedContext = undefined;
        }
        const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        if (!executionContext) {
            this.#eventListenersView.reset();
            this.#eventListenersView.addEmptyHolderIfNeeded();
            return;
        }
        this.#lastRequestedContext = executionContext;
        void Promise.all([this.windowObjectInContext(executionContext)])
            .then(this.#eventListenersView.addObjects.bind(this.#eventListenersView));
    }
    wasShown() {
        super.wasShown();
        UI.Context.Context.instance().addFlavorChangeListener(SDK.RuntimeModel.ExecutionContext, this.update, this);
        this.#refreshButton.setEnabled(true);
        this.update();
    }
    willHide() {
        super.willHide();
        UI.Context.Context.instance().removeFlavorChangeListener(SDK.RuntimeModel.ExecutionContext, this.update, this);
        this.#refreshButton.setEnabled(false);
    }
    windowObjectInContext(executionContext) {
        return executionContext
            .evaluate({
            expression: 'self',
            objectGroup: objectGroupName,
            includeCommandLineAPI: false,
            silent: true,
            returnByValue: false,
            generatePreview: false,
            timeout: undefined,
            throwOnSideEffect: undefined,
            disableBreaks: undefined,
            replMode: undefined,
            allowUnsafeEvalBlockedByCSP: undefined,
        }, 
        /* userGesture */ false, 
        /* awaitPromise */ false)
            .then(result => {
            if ('error' in result || result.exceptionDetails) {
                return null;
            }
            return result.object;
        });
    }
    refreshClick(event) {
        event.data.consume();
        this.update();
    }
}
export const objectGroupName = 'object-event-listeners-sidebar-pane';
//# sourceMappingURL=ObjectEventListenersSidebarPane.js.map