// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Logs from '../../models/logs/logs.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import serviceWorkersViewStyles from './serviceWorkersView.css.js';
import serviceWorkerUpdateCycleViewStyles from './serviceWorkerUpdateCycleView.css.js';
import * as MobileThrottling from '../mobile_throttling/mobile_throttling.js';
import * as NetworkForward from '../../panels/network/forward/forward.js';
import { ServiceWorkerUpdateCycleView } from './ServiceWorkerUpdateCycleView.js';
const UIStrings = {
    /**
    *@description Text for linking to other Service Worker registrations
    */
    serviceWorkersFromOtherOrigins: 'Service workers from other origins',
    /**
    *@description Title of update on reload setting in service workers view of the application panel
    */
    updateOnReload: 'Update on reload',
    /**
    *@description Tooltip text that appears on the setting when hovering over it in Service Workers View of the Application panel
    */
    onPageReloadForceTheService: 'On page reload, force the `service worker` to update, and activate it',
    /**
    *@description Title of bypass service worker setting in service workers view of the application panel
    */
    bypassForNetwork: 'Bypass for network',
    /**
    *@description Tooltip text that appears on the setting when hovering over it in Service Workers View of the Application panel
    */
    bypassTheServiceWorkerAndLoad: 'Bypass the `service worker` and load resources from the network',
    /**
    *@description Screen reader title for a section of the Service Workers view of the Application panel
    *@example {https://example.com} PH1
    */
    serviceWorkerForS: '`Service worker` for {PH1}',
    /**
    *@description Text in Service Workers View of the Application panel
    */
    testPushMessageFromDevtools: 'Test push message from DevTools.',
    /**
    *@description Button label for service worker network requests
    */
    networkRequests: 'Network requests',
    /**
     * @description Label for a button in the Service Workers View of the Application panel.
     * Imperative noun. Clicking the button will refresh the list of service worker registrations.
     */
    update: 'Update',
    /**
    *@description Text in Service Workers View of the Application panel
    */
    unregisterServiceWorker: 'Unregister service worker',
    /**
    *@description Text in Service Workers View of the Application panel
    */
    unregister: 'Unregister',
    /**
    *@description Text for the source of something
    */
    source: 'Source',
    /**
    *@description Text for the status of something
    */
    status: 'Status',
    /**
    *@description Text in Service Workers View of the Application panel
    */
    clients: 'Clients',
    /**
    * @description Text in Service Workers View of the Application panel. Label for a section of the
    * tool which allows the developer to send a test push message to the service worker.
    */
    pushString: 'Push',
    /**
    * @description Text in Service Workers View of the Application panel. Placeholder text for where
    * the user can type in the data they want to push to the service worker i.e. the 'push data'. Noun
    * phrase.
    */
    pushData: 'Push data',
    /**
    *@description Text in Service Workers View of the Application panel
    */
    syncString: 'Sync',
    /**
    *@description Placeholder text for the input box where a user is asked for a test tag to sync. This is used as a compound noun, not as a verb.
    */
    syncTag: 'Sync tag',
    /**
    *@description Text for button in Service Workers View of the Application panel that dispatches a periodicsync event
    */
    periodicSync: 'Periodic Sync',
    /**
    *@description Default tag for a periodicsync event in Service Workers View of the Application panel
    */
    periodicSyncTag: 'Periodic Sync tag',
    /**
    *@description Aria accessible name in Service Workers View of the Application panel
    *@example {3} PH1
    */
    sRegistrationErrors: '{PH1} registration errors',
    /**
    * @description Text in Service Workers View of the Application panel. The Date/time that a service
    * worker version update was received by the webpage.
    * @example {7/3/2019, 3:38:37 PM} PH1
    */
    receivedS: 'Received {PH1}',
    /**
    *@description Text in Service Workers View of the Application panel
    *@example {example.com} PH1
    */
    sDeleted: '{PH1} - deleted',
    /**
    *@description Text in Service Workers View of the Application panel
    *@example {1} PH1
    *@example {stopped} PH2
    */
    sActivatedAndIsS: '#{PH1} activated and is {PH2}',
    /**
    *@description Text in Service Workers View of the Application panel
    */
    stopString: 'stop',
    /**
    *@description Text in Service Workers View of the Application panel
    */
    inspect: 'inspect',
    /**
    *@description Text in Service Workers View of the Application panel
    */
    startString: 'start',
    /**
    * @description Text in Service Workers View of the Application panel. Service workers have
    * different versions, which are labelled with numbers e.g. version #2. This text indicates that a
    * particular version is now redundant (it was replaced by a newer version). # means 'number' here.
    * @example {2} PH1
    */
    sIsRedundant: '#{PH1} is redundant',
    /**
    *@description Text in Service Workers View of the Application panel
    *@example {2} PH1
    */
    sWaitingToActivate: '#{PH1} waiting to activate',
    /**
    *@description Text in Service Workers View of the Application panel
    *@example {2} PH1
    */
    sTryingToInstall: '#{PH1} trying to install',
    /**
    *@description Text in Service Workers Update Timeline. Update is a noun.
    */
    updateCycle: 'Update Cycle',
    /**
    *@description Text of a DOM element in Service Workers View of the Application panel
    *@example {example.com} PH1
    */
    workerS: 'Worker: {PH1}',
    /**
    *@description Link text in Service Workers View of the Application panel. When the link is clicked,
    * the focus is moved to the service worker's client page.
    */
    focus: 'focus',
    /**
    *@description Link to view all the Service Workers that have been registered.
    */
    seeAllRegistrations: 'See all registrations',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/ServiceWorkersView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let throttleDisabledForDebugging = false;
export const setThrottleDisabledForDebugging = (enable) => {
    throttleDisabledForDebugging = enable;
};
export class ServiceWorkersView extends UI.Widget.VBox {
    currentWorkersView;
    toolbar;
    sections;
    manager;
    securityOriginManager;
    sectionToRegistration;
    eventListeners;
    constructor() {
        super(true);
        // TODO(crbug.com/1156978): Replace UI.ReportView.ReportView with ReportView.ts web component.
        this.currentWorkersView = new UI.ReportView.ReportView(i18n.i18n.lockedString('Service Workers'));
        this.currentWorkersView.setBodyScrollable(false);
        this.contentElement.classList.add('service-worker-list');
        this.currentWorkersView.show(this.contentElement);
        this.currentWorkersView.element.classList.add('service-workers-this-origin');
        this.toolbar = this.currentWorkersView.createToolbar();
        this.toolbar.makeWrappable(true /* growVertically */);
        this.sections = new Map();
        this.manager = null;
        this.securityOriginManager = null;
        this.sectionToRegistration = new WeakMap();
        const othersDiv = this.contentElement.createChild('div', 'service-workers-other-origin');
        // TODO(crbug.com/1156978): Replace UI.ReportView.ReportView with ReportView.ts web component.
        const othersView = new UI.ReportView.ReportView();
        othersView.setHeaderVisible(false);
        othersView.show(othersDiv);
        const othersSection = othersView.appendSection(i18nString(UIStrings.serviceWorkersFromOtherOrigins));
        const othersSectionRow = othersSection.appendRow();
        const seeOthers = UI.Fragment
            .html `<a class="devtools-link" role="link" tabindex="0" href="chrome://serviceworker-internals" target="_blank" style="display: inline; cursor: pointer;">${i18nString(UIStrings.seeAllRegistrations)}</a>`;
        self.onInvokeElement(seeOthers, event => {
            const mainTarget = SDK.TargetManager.TargetManager.instance().mainTarget();
            mainTarget && mainTarget.targetAgent().invoke_createTarget({ url: 'chrome://serviceworker-internals?devtools' });
            event.consume(true);
        });
        othersSectionRow.appendChild(seeOthers);
        this.toolbar.appendToolbarItem(MobileThrottling.ThrottlingManager.throttlingManager().createOfflineToolbarCheckbox());
        const updateOnReloadSetting = Common.Settings.Settings.instance().createSetting('serviceWorkerUpdateOnReload', false);
        updateOnReloadSetting.setTitle(i18nString(UIStrings.updateOnReload));
        const forceUpdate = new UI.Toolbar.ToolbarSettingCheckbox(updateOnReloadSetting, i18nString(UIStrings.onPageReloadForceTheService));
        this.toolbar.appendToolbarItem(forceUpdate);
        const bypassServiceWorkerSetting = Common.Settings.Settings.instance().createSetting('bypassServiceWorker', false);
        bypassServiceWorkerSetting.setTitle(i18nString(UIStrings.bypassForNetwork));
        const fallbackToNetwork = new UI.Toolbar.ToolbarSettingCheckbox(bypassServiceWorkerSetting, i18nString(UIStrings.bypassTheServiceWorkerAndLoad));
        this.toolbar.appendToolbarItem(fallbackToNetwork);
        this.eventListeners = new Map();
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.ServiceWorkerManager.ServiceWorkerManager, this);
        this.updateListVisibility();
        const drawerChangeHandler = (event) => {
            // @ts-ignore: No support for custom event listener
            const isDrawerOpen = event.detail && event.detail.isDrawerOpen;
            if (this.manager && !isDrawerOpen) {
                const { serviceWorkerNetworkRequestsPanelStatus: { isOpen, openedAt } } = this.manager;
                if (isOpen) {
                    const networkLocation = UI.ViewManager.ViewManager.instance().locationNameForViewId('network');
                    UI.ViewManager.ViewManager.instance().showViewInLocation('network', networkLocation, false);
                    void Common.Revealer.reveal(NetworkForward.UIFilter.UIRequestFilter.filters([]));
                    const currentTime = Date.now();
                    const timeDifference = currentTime - openedAt;
                    if (timeDifference < 2000) {
                        Host.userMetrics.actionTaken(Host.UserMetrics.Action.ServiceWorkerNetworkRequestClosedQuickly);
                    }
                    this.manager.serviceWorkerNetworkRequestsPanelStatus = {
                        isOpen: false,
                        openedAt: 0,
                    };
                }
            }
        };
        document.body.addEventListener(UI.InspectorView.Events.DrawerChange, drawerChangeHandler);
    }
    modelAdded(serviceWorkerManager) {
        if (this.manager) {
            return;
        }
        this.manager = serviceWorkerManager;
        this.securityOriginManager =
            serviceWorkerManager.target().model(SDK.SecurityOriginManager.SecurityOriginManager);
        for (const registration of this.manager.registrations().values()) {
            this.updateRegistration(registration);
        }
        this.eventListeners.set(serviceWorkerManager, [
            this.manager.addEventListener(SDK.ServiceWorkerManager.Events.RegistrationUpdated, this.registrationUpdated, this),
            this.manager.addEventListener(SDK.ServiceWorkerManager.Events.RegistrationDeleted, this.registrationDeleted, this),
            this.securityOriginManager.addEventListener(SDK.SecurityOriginManager.Events.SecurityOriginAdded, this.updateSectionVisibility, this),
            this.securityOriginManager.addEventListener(SDK.SecurityOriginManager.Events.SecurityOriginRemoved, this.updateSectionVisibility, this),
        ]);
    }
    modelRemoved(serviceWorkerManager) {
        if (!this.manager || this.manager !== serviceWorkerManager) {
            return;
        }
        Common.EventTarget.removeEventListeners(this.eventListeners.get(serviceWorkerManager) || []);
        this.eventListeners.delete(serviceWorkerManager);
        this.manager = null;
        this.securityOriginManager = null;
    }
    getTimeStamp(registration) {
        const versions = registration.versionsByMode();
        let timestamp = 0;
        const active = versions.get(SDK.ServiceWorkerManager.ServiceWorkerVersion.Modes.Active);
        const installing = versions.get(SDK.ServiceWorkerManager.ServiceWorkerVersion.Modes.Installing);
        const waiting = versions.get(SDK.ServiceWorkerManager.ServiceWorkerVersion.Modes.Waiting);
        const redundant = versions.get(SDK.ServiceWorkerManager.ServiceWorkerVersion.Modes.Redundant);
        if (active) {
            timestamp = active.scriptResponseTime;
        }
        else if (waiting) {
            timestamp = waiting.scriptResponseTime;
        }
        else if (installing) {
            timestamp = installing.scriptResponseTime;
        }
        else if (redundant) {
            timestamp = redundant.scriptResponseTime;
        }
        return timestamp || 0;
    }
    updateSectionVisibility() {
        let hasThis = false;
        const movedSections = [];
        for (const section of this.sections.values()) {
            const expectedView = this.getReportViewForOrigin(section.registration.securityOrigin);
            hasThis = hasThis || expectedView === this.currentWorkersView;
            if (section.section.parentWidget() !== expectedView) {
                movedSections.push(section);
            }
        }
        for (const section of movedSections) {
            const registration = section.registration;
            this.removeRegistrationFromList(registration);
            this.updateRegistration(registration, true);
        }
        this.currentWorkersView.sortSections((aSection, bSection) => {
            const aRegistration = this.sectionToRegistration.get(aSection);
            const bRegistration = this.sectionToRegistration.get(bSection);
            const aTimestamp = aRegistration ? this.getTimeStamp(aRegistration) : 0;
            const bTimestamp = bRegistration ? this.getTimeStamp(bRegistration) : 0;
            // the newest (largest timestamp value) should be the first
            return bTimestamp - aTimestamp;
        });
        for (const section of this.sections.values()) {
            if (section.section.parentWidget() === this.currentWorkersView ||
                this.isRegistrationVisible(section.registration)) {
                section.section.showWidget();
            }
            else {
                section.section.hideWidget();
            }
        }
        this.contentElement.classList.toggle('service-worker-has-current', Boolean(hasThis));
        this.updateListVisibility();
    }
    registrationUpdated(event) {
        this.updateRegistration(event.data);
        this.gcRegistrations();
    }
    gcRegistrations() {
        if (!this.manager || !this.securityOriginManager) {
            return;
        }
        let hasNonDeletedRegistrations = false;
        const securityOrigins = new Set(this.securityOriginManager.securityOrigins());
        for (const registration of this.manager.registrations().values()) {
            if (!securityOrigins.has(registration.securityOrigin) && !this.isRegistrationVisible(registration)) {
                continue;
            }
            if (!registration.canBeRemoved()) {
                hasNonDeletedRegistrations = true;
                break;
            }
        }
        if (!hasNonDeletedRegistrations) {
            return;
        }
        for (const registration of this.manager.registrations().values()) {
            const visible = securityOrigins.has(registration.securityOrigin) || this.isRegistrationVisible(registration);
            if (!visible && registration.canBeRemoved()) {
                this.removeRegistrationFromList(registration);
            }
        }
    }
    getReportViewForOrigin(origin) {
        if (this.securityOriginManager &&
            (this.securityOriginManager.securityOrigins().includes(origin) ||
                this.securityOriginManager.unreachableMainSecurityOrigin() === origin)) {
            return this.currentWorkersView;
        }
        return null;
    }
    updateRegistration(registration, skipUpdate) {
        let section = this.sections.get(registration);
        if (!section) {
            const title = registration.scopeURL;
            const reportView = this.getReportViewForOrigin(registration.securityOrigin);
            if (!reportView) {
                return;
            }
            const uiSection = reportView.appendSection(title);
            uiSection.setUiGroupTitle(i18nString(UIStrings.serviceWorkerForS, { PH1: title }));
            this.sectionToRegistration.set(uiSection, registration);
            section = new Section(this.manager, uiSection, registration);
            this.sections.set(registration, section);
        }
        if (skipUpdate) {
            return;
        }
        this.updateSectionVisibility();
        section.scheduleUpdate();
    }
    registrationDeleted(event) {
        this.removeRegistrationFromList(event.data);
    }
    removeRegistrationFromList(registration) {
        const section = this.sections.get(registration);
        if (section) {
            section.section.detach();
        }
        this.sections.delete(registration);
        this.updateSectionVisibility();
    }
    isRegistrationVisible(registration) {
        if (!registration.scopeURL) {
            return true;
        }
        return false;
    }
    updateListVisibility() {
        this.contentElement.classList.toggle('service-worker-list-empty', this.sections.size === 0);
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([
            serviceWorkersViewStyles,
        ]);
    }
}
export class Section {
    manager;
    section;
    registration;
    fingerprint;
    pushNotificationDataSetting;
    syncTagNameSetting;
    periodicSyncTagNameSetting;
    toolbar;
    updateCycleView;
    networkRequests;
    updateButton;
    deleteButton;
    sourceField;
    statusField;
    clientsField;
    linkifier;
    clientInfoCache;
    throttler;
    updateCycleField;
    constructor(manager, section, registration) {
        this.manager = manager;
        this.section = section;
        this.registration = registration;
        this.fingerprint = null;
        this.pushNotificationDataSetting = Common.Settings.Settings.instance().createLocalSetting('pushData', i18nString(UIStrings.testPushMessageFromDevtools));
        this.syncTagNameSetting =
            Common.Settings.Settings.instance().createLocalSetting('syncTagName', 'test-tag-from-devtools');
        this.periodicSyncTagNameSetting =
            Common.Settings.Settings.instance().createLocalSetting('periodicSyncTagName', 'test-tag-from-devtools');
        this.toolbar = section.createToolbar();
        this.toolbar.renderAsLinks();
        this.updateCycleView = new ServiceWorkerUpdateCycleView(registration);
        this.networkRequests = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.networkRequests), undefined, i18nString(UIStrings.networkRequests));
        this.networkRequests.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.networkRequestsClicked, this);
        this.toolbar.appendToolbarItem(this.networkRequests);
        this.updateButton =
            new UI.Toolbar.ToolbarButton(i18nString(UIStrings.update), undefined, i18nString(UIStrings.update));
        this.updateButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.updateButtonClicked, this);
        this.toolbar.appendToolbarItem(this.updateButton);
        this.deleteButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.unregisterServiceWorker), undefined, i18nString(UIStrings.unregister));
        this.deleteButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.unregisterButtonClicked, this);
        this.toolbar.appendToolbarItem(this.deleteButton);
        // Preserve the order.
        this.sourceField = this.wrapWidget(this.section.appendField(i18nString(UIStrings.source)));
        this.statusField = this.wrapWidget(this.section.appendField(i18nString(UIStrings.status)));
        this.clientsField = this.wrapWidget(this.section.appendField(i18nString(UIStrings.clients)));
        this.createSyncNotificationField(i18nString(UIStrings.pushString), this.pushNotificationDataSetting.get(), i18nString(UIStrings.pushData), this.push.bind(this));
        this.createSyncNotificationField(i18nString(UIStrings.syncString), this.syncTagNameSetting.get(), i18nString(UIStrings.syncTag), this.sync.bind(this));
        this.createSyncNotificationField(i18nString(UIStrings.periodicSync), this.periodicSyncTagNameSetting.get(), i18nString(UIStrings.periodicSyncTag), tag => this.periodicSync(tag));
        this.createUpdateCycleField();
        this.linkifier = new Components.Linkifier.Linkifier();
        this.clientInfoCache = new Map();
        this.throttler = new Common.Throttler.Throttler(500);
    }
    createSyncNotificationField(label, initialValue, placeholder, callback) {
        const form = this.wrapWidget(this.section.appendField(label)).createChild('form', 'service-worker-editor-with-button');
        const editor = UI.UIUtils.createInput('source-code service-worker-notification-editor');
        form.appendChild(editor);
        const button = UI.UIUtils.createTextButton(label);
        button.type = 'submit';
        form.appendChild(button);
        editor.value = initialValue;
        editor.placeholder = placeholder;
        UI.ARIAUtils.setAccessibleName(editor, label);
        form.addEventListener('submit', (e) => {
            callback(editor.value || '');
            e.consume(true);
        });
    }
    scheduleUpdate() {
        if (throttleDisabledForDebugging) {
            void this.update();
            return;
        }
        void this.throttler.schedule(this.update.bind(this));
    }
    targetForVersionId(versionId) {
        const version = this.manager.findVersion(versionId);
        if (!version || !version.targetId) {
            return null;
        }
        return SDK.TargetManager.TargetManager.instance().targetById(version.targetId);
    }
    addVersion(versionsStack, icon, label) {
        const installingEntry = versionsStack.createChild('div', 'service-worker-version');
        installingEntry.createChild('div', icon);
        const statusString = installingEntry.createChild('span', 'service-worker-version-string');
        statusString.textContent = label;
        UI.ARIAUtils.markAsAlert(statusString);
        return installingEntry;
    }
    updateClientsField(version) {
        this.clientsField.removeChildren();
        this.section.setFieldVisible(i18nString(UIStrings.clients), Boolean(version.controlledClients.length));
        for (const client of version.controlledClients) {
            const clientLabelText = this.clientsField.createChild('div', 'service-worker-client');
            const info = this.clientInfoCache.get(client);
            if (info) {
                this.updateClientInfo(clientLabelText, info);
            }
            void this.manager.target()
                .targetAgent()
                .invoke_getTargetInfo({ targetId: client })
                .then(this.onClientInfo.bind(this, clientLabelText));
        }
    }
    updateSourceField(version) {
        this.sourceField.removeChildren();
        const fileName = Common.ParsedURL.ParsedURL.extractName(version.scriptURL);
        const name = this.sourceField.createChild('div', 'report-field-value-filename');
        const link = Components.Linkifier.Linkifier.linkifyURL(version.scriptURL, { text: fileName });
        link.tabIndex = 0;
        name.appendChild(link);
        if (this.registration.errors.length) {
            const errorsLabel = UI.UIUtils.createIconLabel(String(this.registration.errors.length), 'smallicon-error');
            errorsLabel.classList.add('devtools-link', 'link');
            errorsLabel.tabIndex = 0;
            UI.ARIAUtils.setAccessibleName(errorsLabel, i18nString(UIStrings.sRegistrationErrors, { PH1: this.registration.errors.length }));
            self.onInvokeElement(errorsLabel, () => Common.Console.Console.instance().show());
            name.appendChild(errorsLabel);
        }
        if (version.scriptResponseTime !== undefined) {
            this.sourceField.createChild('div', 'report-field-value-subtitle').textContent =
                i18nString(UIStrings.receivedS, { PH1: new Date(version.scriptResponseTime * 1000).toLocaleString() });
        }
    }
    update() {
        const fingerprint = this.registration.fingerprint();
        if (fingerprint === this.fingerprint) {
            return Promise.resolve();
        }
        this.fingerprint = fingerprint;
        this.toolbar.setEnabled(!this.registration.isDeleted);
        const versions = this.registration.versionsByMode();
        const scopeURL = this.registration.scopeURL;
        const title = this.registration.isDeleted ? i18nString(UIStrings.sDeleted, { PH1: scopeURL }) : scopeURL;
        this.section.setTitle(title);
        const active = versions.get(SDK.ServiceWorkerManager.ServiceWorkerVersion.Modes.Active);
        const waiting = versions.get(SDK.ServiceWorkerManager.ServiceWorkerVersion.Modes.Waiting);
        const installing = versions.get(SDK.ServiceWorkerManager.ServiceWorkerVersion.Modes.Installing);
        const redundant = versions.get(SDK.ServiceWorkerManager.ServiceWorkerVersion.Modes.Redundant);
        this.statusField.removeChildren();
        const versionsStack = this.statusField.createChild('div', 'service-worker-version-stack');
        versionsStack.createChild('div', 'service-worker-version-stack-bar');
        if (active) {
            this.updateSourceField(active);
            const localizedRunningStatus = SDK.ServiceWorkerManager.ServiceWorkerVersion.RunningStatus[active.currentState.runningStatus]();
            // TODO(l10n): Don't concatenate strings here.
            const activeEntry = this.addVersion(versionsStack, 'service-worker-active-circle', i18nString(UIStrings.sActivatedAndIsS, { PH1: active.id, PH2: localizedRunningStatus }));
            if (active.isRunning() || active.isStarting()) {
                this.createLink(activeEntry, i18nString(UIStrings.stopString), this.stopButtonClicked.bind(this, active.id));
                if (!this.targetForVersionId(active.id)) {
                    this.createLink(activeEntry, i18nString(UIStrings.inspect), this.inspectButtonClicked.bind(this, active.id));
                }
            }
            else if (active.isStartable()) {
                this.createLink(activeEntry, i18nString(UIStrings.startString), this.startButtonClicked.bind(this));
            }
            this.updateClientsField(active);
        }
        else if (redundant) {
            this.updateSourceField(redundant);
            this.addVersion(versionsStack, 'service-worker-redundant-circle', i18nString(UIStrings.sIsRedundant, { PH1: redundant.id }));
            this.updateClientsField(redundant);
        }
        if (waiting) {
            const waitingEntry = this.addVersion(versionsStack, 'service-worker-waiting-circle', i18nString(UIStrings.sWaitingToActivate, { PH1: waiting.id }));
            this.createLink(waitingEntry, i18n.i18n.lockedString('skipWaiting'), this.skipButtonClicked.bind(this));
            if (waiting.scriptResponseTime !== undefined) {
                waitingEntry.createChild('div', 'service-worker-subtitle').textContent =
                    i18nString(UIStrings.receivedS, { PH1: new Date(waiting.scriptResponseTime * 1000).toLocaleString() });
            }
            if (!this.targetForVersionId(waiting.id) && (waiting.isRunning() || waiting.isStarting())) {
                this.createLink(waitingEntry, i18nString(UIStrings.inspect), this.inspectButtonClicked.bind(this, waiting.id));
            }
        }
        if (installing) {
            const installingEntry = this.addVersion(versionsStack, 'service-worker-installing-circle', i18nString(UIStrings.sTryingToInstall, { PH1: installing.id }));
            if (installing.scriptResponseTime !== undefined) {
                installingEntry.createChild('div', 'service-worker-subtitle').textContent = i18nString(UIStrings.receivedS, {
                    PH1: new Date(installing.scriptResponseTime * 1000).toLocaleString(),
                });
            }
            if (!this.targetForVersionId(installing.id) && (installing.isRunning() || installing.isStarting())) {
                this.createLink(installingEntry, i18nString(UIStrings.inspect), this.inspectButtonClicked.bind(this, installing.id));
            }
        }
        this.updateCycleView.refresh();
        return Promise.resolve();
    }
    createLink(parent, title, listener, className, useCapture) {
        const button = document.createElement('button');
        if (className) {
            button.className = className;
        }
        button.classList.add('link', 'devtools-link');
        button.textContent = title;
        button.tabIndex = 0;
        button.addEventListener('click', listener, useCapture);
        parent.appendChild(button);
        return button;
    }
    unregisterButtonClicked() {
        this.manager.deleteRegistration(this.registration.id);
    }
    createUpdateCycleField() {
        this.updateCycleField = this.wrapWidget(this.section.appendField(i18nString(UIStrings.updateCycle)));
        this.updateCycleField.appendChild(this.updateCycleView.tableElement);
    }
    updateButtonClicked() {
        void this.manager.updateRegistration(this.registration.id);
    }
    networkRequestsClicked() {
        const applicationTabLocation = UI.ViewManager.ViewManager.instance().locationNameForViewId('resources');
        const networkTabLocation = applicationTabLocation === 'drawer-view' ? 'panel' : 'drawer-view';
        UI.ViewManager.ViewManager.instance().showViewInLocation('network', networkTabLocation);
        void Common.Revealer.reveal(NetworkForward.UIFilter.UIRequestFilter.filters([
            {
                filterType: NetworkForward.UIFilter.FilterType.Is,
                filterValue: NetworkForward.UIFilter.IsFilterType.ServiceWorkerIntercepted,
            },
        ]));
        const requests = Logs.NetworkLog.NetworkLog.instance().requests();
        let lastRequest = null;
        if (Array.isArray(requests)) {
            for (const request of requests) {
                if (!lastRequest && request.fetchedViaServiceWorker) {
                    lastRequest = request;
                }
                if (request.fetchedViaServiceWorker && lastRequest &&
                    lastRequest.responseReceivedTime < request.responseReceivedTime) {
                    lastRequest = request;
                }
            }
        }
        if (lastRequest) {
            const requestLocation = NetworkForward.UIRequestLocation.UIRequestLocation.tab(lastRequest, NetworkForward.UIRequestLocation.UIRequestTabs.Timing, { clearFilter: false });
            void Common.Revealer.reveal(requestLocation);
        }
        this.manager.serviceWorkerNetworkRequestsPanelStatus = {
            isOpen: true,
            openedAt: Date.now(),
        };
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.ServiceWorkerNetworkRequestClicked);
    }
    push(data) {
        this.pushNotificationDataSetting.set(data);
        void this.manager.deliverPushMessage(this.registration.id, data);
    }
    sync(tag) {
        this.syncTagNameSetting.set(tag);
        void this.manager.dispatchSyncEvent(this.registration.id, tag, true);
    }
    periodicSync(tag) {
        this.periodicSyncTagNameSetting.set(tag);
        void this.manager.dispatchPeriodicSyncEvent(this.registration.id, tag);
    }
    onClientInfo(element, targetInfoResponse) {
        const targetInfo = targetInfoResponse.targetInfo;
        if (!targetInfo) {
            return;
        }
        this.clientInfoCache.set(targetInfo.targetId, targetInfo);
        this.updateClientInfo(element, targetInfo);
    }
    updateClientInfo(element, targetInfo) {
        if (targetInfo.type !== 'page' && targetInfo.type === 'iframe') {
            const clientString = element.createChild('span', 'service-worker-client-string');
            UI.UIUtils.createTextChild(clientString, i18nString(UIStrings.workerS, { PH1: targetInfo.url }));
            return;
        }
        element.removeChildren();
        const clientString = element.createChild('span', 'service-worker-client-string');
        UI.UIUtils.createTextChild(clientString, targetInfo.url);
        this.createLink(element, i18nString(UIStrings.focus), this.activateTarget.bind(this, targetInfo.targetId), 'service-worker-client-focus-link');
    }
    activateTarget(targetId) {
        void this.manager.target().targetAgent().invoke_activateTarget({ targetId });
    }
    startButtonClicked() {
        void this.manager.startWorker(this.registration.scopeURL);
    }
    skipButtonClicked() {
        void this.manager.skipWaiting(this.registration.scopeURL);
    }
    stopButtonClicked(versionId) {
        void this.manager.stopWorker(versionId);
    }
    inspectButtonClicked(versionId) {
        void this.manager.inspectWorker(versionId);
    }
    wrapWidget(container) {
        const shadowRoot = UI.Utils.createShadowRootWithCoreStyles(container, {
            cssFile: [
                serviceWorkersViewStyles,
                /* These styles are for the timing table in serviceWorkerUpdateCycleView but this is the widget that it is rendered
                   * inside so we are registering the files here. */
                serviceWorkerUpdateCycleViewStyles,
            ],
            delegatesFocus: undefined,
        });
        const contentElement = document.createElement('div');
        shadowRoot.appendChild(contentElement);
        return contentElement;
    }
}
//# sourceMappingURL=ServiceWorkersView.js.map