// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';
import lighthouseDialogStyles from './lighthouseDialog.css.js';
import { Events, RuntimeSettings } from './LighthouseController.js';
const UIStrings = {
    /**
    *@description Text to cancel something
    */
    cancel: 'Cancel',
    /**
    *@description Text when something is loading
    */
    loading: 'Loading…',
    /**
    *@description Status text in Lighthouse splash screen while an audit is being performed
    *@example {github.com} PH1
    */
    auditingS: 'Auditing {PH1}',
    /**
    *@description Status text in Lighthouse splash screen while an audit is being performed
    */
    auditingYourWebPage: 'Auditing your web page',
    /**
    *@description Status text in Lighthouse splash screen while an audit is being performed, and cancellation to take effect
    */
    cancelling: 'Cancelling…',
    /**
    *@description Status text in Lighthouse splash screen while preparing for an audit
    */
    lighthouseIsWarmingUp: '`Lighthouse` is warming up…',
    /**
    *@description Status text in Lighthouse splash screen while an audit is being performed
    */
    lighthouseIsLoadingYourPage: '`Lighthouse` is loading your page',
    /**
    *@description Text in Lighthouse Status View
    *@example {75% of global mobile users in 2016 were on 2G or 3G [Source: GSMA Mobile]} PH1
    */
    fastFactMessageWithPlaceholder: '💡 {PH1}',
    /**
    *@description Text of a DOM element in Lighthouse Status View
    */
    ahSorryWeRanIntoAnError: 'Ah, sorry! We ran into an error.',
    /**
    *@description Text in Lighthouse Status View
    */
    tryToNavigateToTheUrlInAFresh: 'Try to navigate to the URL in a fresh `Chrome` profile without any other tabs or extensions open and try again.',
    /**
    *@description Text of a DOM element in Lighthouse Status View
    */
    ifThisIssueIsReproduciblePlease: 'If this issue is reproducible, please report it at the `Lighthouse` `GitHub` repo.',
    /**
    *@description Text in Lighthouse splash screen when loading the page for auditing
    */
    lighthouseIsLoadingThePage: 'Lighthouse is loading the page.',
    /**
    *@description Text in Lighthouse splash screen when Lighthouse is gathering information for display
    */
    lighthouseIsGatheringInformation: '`Lighthouse` is gathering information about the page to compute your score.',
    /**
    *@description Text in Lighthouse splash screen when Lighthouse is generating a report.
    */
    almostThereLighthouseIsNow: 'Almost there! `Lighthouse` is now generating your report.',
    /**
    *@description Text in Lighthouse splash screen when loading the page for auditing
    */
    lighthouseIsLoadingYourPageWith: '`Lighthouse` is loading your page with throttling to measure performance on a mobile device on 3G.',
    /**
    *@description Text in Lighthouse splash screen when loading the page for auditing
    */
    lighthouseIsLoadingYourPageWithThrottling: '`Lighthouse` is loading your page with throttling to measure performance on a slow desktop on 3G.',
    /**
    *@description Text in Lighthouse splash screen when loading the page for auditing
    */
    lighthouseIsLoadingYourPageWithMobile: '`Lighthouse` is loading your page with mobile emulation.',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    mbTakesAMinimumOfSecondsTo: '1MB takes a minimum of 5 seconds to download on a typical 3G connection [Source: `WebPageTest` and `DevTools` 3G definition].',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    rebuildingPinterestPagesFor: 'Rebuilding Pinterest pages for performance increased conversion rates by 15% [Source: `WPO Stats`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    byReducingTheResponseSizeOfJson: 'By reducing the response size of JSON needed for displaying comments, Instagram saw increased impressions [Source: `WPO Stats`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    walmartSawAIncreaseInRevenueFor: 'Walmart saw a 1% increase in revenue for every 100ms improvement in page load [Source: `WPO Stats`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    ifASiteTakesSecondToBecome: 'If a site takes >1 second to become interactive, users lose attention, and their perception of completing the page task is broken [Source: `Google Developers Blog`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    OfGlobalMobileUsersInWereOnGOrG: '75% of global mobile users in 2016 were on 2G or 3G [Source: `GSMA Mobile`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    theAverageUserDeviceCostsLess: 'The average user device costs less than 200 USD. [Source: `International Data Corporation`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    SecondsIsTheAverageTimeAMobile: '19 seconds is the average time a mobile web page takes to load on a 3G connection [Source: `Google DoubleClick blog`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    OfMobilePagesTakeNearlySeconds: '70% of mobile pages take nearly 7 seconds for the visual content above the fold to display on the screen. [Source: `Think with Google`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    asPageLoadTimeIncreasesFromOne: 'As page load time increases from one second to seven seconds, the probability of a mobile site visitor bouncing increases 113%. [Source: `Think with Google`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    asTheNumberOfElementsOnAPage: 'As the number of elements on a page increases from 400 to 6,000, the probability of conversion drops 95%. [Source: `Think with Google`]',
    /**
    *@description Fast fact in the splash screen while Lighthouse is performing an audit
    */
    lighthouseOnlySimulatesMobile: '`Lighthouse` only simulates mobile performance; to measure performance on a real device, try WebPageTest.org [Source: `Lighthouse` team]',
};
const str_ = i18n.i18n.registerUIStrings('panels/lighthouse/LighthouseStatusView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class StatusView {
    controller;
    statusView;
    statusHeader;
    progressWrapper;
    progressBar;
    statusText;
    cancelButton;
    inspectedURL;
    textChangedAt;
    fastFactsQueued;
    currentPhase;
    scheduledTextChangeTimeout;
    scheduledFastFactTimeout;
    dialog;
    constructor(controller) {
        this.controller = controller;
        this.statusView = null;
        this.statusHeader = null;
        this.progressWrapper = null;
        this.progressBar = null;
        this.statusText = null;
        this.cancelButton = null;
        this.inspectedURL = '';
        this.textChangedAt = 0;
        this.fastFactsQueued = FastFacts.map(lazyString => lazyString());
        this.currentPhase = null;
        this.scheduledTextChangeTimeout = null;
        this.scheduledFastFactTimeout = null;
        this.dialog = new UI.Dialog.Dialog();
        this.dialog.setDimmed(true);
        this.dialog.setCloseOnEscape(false);
        this.dialog.setOutsideClickCallback(event => event.consume(true));
        this.render();
    }
    render() {
        const dialogRoot = UI.Utils.createShadowRootWithCoreStyles(this.dialog.contentElement, { cssFile: [lighthouseDialogStyles], delegatesFocus: undefined });
        const lighthouseViewElement = dialogRoot.createChild('div', 'lighthouse-view vbox');
        const cancelButton = UI.UIUtils.createTextButton(i18nString(UIStrings.cancel), this.cancel.bind(this));
        const fragment = UI.Fragment.Fragment.build `
  <div class="lighthouse-view vbox">
  <h2 $="status-header">Auditing your web page…</h2>
  <div class="lighthouse-status vbox" $="status-view">
  <div class="lighthouse-progress-wrapper" $="progress-wrapper">
  <div class="lighthouse-progress-bar" $="progress-bar"></div>
  </div>
  <div class="lighthouse-status-text" $="status-text"></div>
  </div>
  ${cancelButton}
  </div>
  `;
        lighthouseViewElement.appendChild(fragment.element());
        this.statusView = fragment.$('status-view');
        this.statusHeader = fragment.$('status-header');
        this.progressWrapper = fragment.$('progress-wrapper');
        this.progressBar = fragment.$('progress-bar');
        this.statusText = fragment.$('status-text');
        // Use StatusPhases array index as progress bar value
        UI.ARIAUtils.markAsProgressBar(this.progressBar, 0, StatusPhases.length - 1);
        this.cancelButton = cancelButton;
        UI.ARIAUtils.markAsStatus(this.statusText);
        this.dialog.setDefaultFocusedElement(cancelButton);
        this.dialog.setSizeBehavior("SetExactWidthMaxHeight" /* SetExactWidthMaxHeight */);
        this.dialog.setMaxContentSize(new UI.Geometry.Size(500, 400));
    }
    reset() {
        this.resetProgressBarClasses();
        clearTimeout(this.scheduledFastFactTimeout);
        this.textChangedAt = 0;
        this.fastFactsQueued = FastFacts.map(lazyString => lazyString());
        this.currentPhase = null;
        this.scheduledTextChangeTimeout = null;
        this.scheduledFastFactTimeout = null;
    }
    show(dialogRenderElement) {
        this.reset();
        this.updateStatus(i18nString(UIStrings.loading));
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(this.inspectedURL);
        const pageHost = parsedURL && parsedURL.host;
        const statusHeader = pageHost ? i18nString(UIStrings.auditingS, { PH1: pageHost }) : i18nString(UIStrings.auditingYourWebPage);
        this.renderStatusHeader(statusHeader);
        // @ts-ignore TS expects Document, but gets Element (show takes Element|Document)
        this.dialog.show(dialogRenderElement);
    }
    renderStatusHeader(statusHeader) {
        if (this.statusHeader) {
            this.statusHeader.textContent = `${statusHeader}…`;
        }
    }
    hide() {
        if (this.dialog.isShowing()) {
            this.dialog.hide();
        }
    }
    setInspectedURL(url = '') {
        this.inspectedURL = url;
    }
    updateStatus(message) {
        if (!message || !this.statusText) {
            return;
        }
        if (message.startsWith('Cancel')) {
            this.commitTextChange(i18nString(UIStrings.cancelling));
            clearTimeout(this.scheduledFastFactTimeout);
            return;
        }
        const nextPhase = this.getPhaseForMessage(message);
        // @ts-ignore indexOf null is valid.
        const nextPhaseIndex = StatusPhases.indexOf(nextPhase);
        // @ts-ignore indexOf null is valid.
        const currentPhaseIndex = StatusPhases.indexOf(this.currentPhase);
        if (!nextPhase && !this.currentPhase) {
            this.commitTextChange(i18nString(UIStrings.lighthouseIsWarmingUp));
            clearTimeout(this.scheduledFastFactTimeout);
        }
        else if (nextPhase && (!this.currentPhase || currentPhaseIndex < nextPhaseIndex)) {
            this.currentPhase = nextPhase;
            const text = this.getMessageForPhase(nextPhase);
            this.scheduleTextChange(text);
            this.scheduleFastFactCheck();
            this.resetProgressBarClasses();
            if (this.progressBar) {
                this.progressBar.classList.add(nextPhase.progressBarClass);
                UI.ARIAUtils.setProgressBarValue(this.progressBar, nextPhaseIndex, text);
            }
        }
    }
    cancel() {
        this.controller.dispatchEventToListeners(Events.RequestLighthouseCancel);
    }
    getMessageForPhase(phase) {
        if (phase.message()) {
            return phase.message();
        }
        const deviceTypeSetting = RuntimeSettings.find(item => item.setting.name === 'lighthouse.device_type');
        const throttleSetting = RuntimeSettings.find(item => item.setting.name === 'lighthouse.throttling');
        const deviceType = deviceTypeSetting ? deviceTypeSetting.setting.get() : '';
        const throttling = throttleSetting ? throttleSetting.setting.get() : '';
        const match = LoadingMessages.find(item => {
            return item.deviceType === deviceType && item.throttling === throttling;
        });
        return match ? match.message() : i18nString(UIStrings.lighthouseIsLoadingYourPage);
    }
    getPhaseForMessage(message) {
        return StatusPhases.find(phase => phase.statusMessageRegex.test(message)) || null;
    }
    resetProgressBarClasses() {
        if (this.progressBar) {
            this.progressBar.className = 'lighthouse-progress-bar';
        }
    }
    scheduleFastFactCheck() {
        if (!this.currentPhase || this.scheduledFastFactTimeout) {
            return;
        }
        this.scheduledFastFactTimeout = window.setTimeout(() => {
            this.updateFastFactIfNecessary();
            this.scheduledFastFactTimeout = null;
            this.scheduleFastFactCheck();
        }, 100);
    }
    updateFastFactIfNecessary() {
        const now = performance.now();
        if (now - this.textChangedAt < fastFactRotationInterval) {
            return;
        }
        if (!this.fastFactsQueued.length) {
            return;
        }
        const fastFactIndex = Math.floor(Math.random() * this.fastFactsQueued.length);
        this.scheduleTextChange(i18nString(UIStrings.fastFactMessageWithPlaceholder, { PH1: this.fastFactsQueued[fastFactIndex] }));
        this.fastFactsQueued.splice(fastFactIndex, 1);
    }
    commitTextChange(text) {
        if (!this.statusText) {
            return;
        }
        this.textChangedAt = performance.now();
        this.statusText.textContent = text;
    }
    scheduleTextChange(text) {
        if (this.scheduledTextChangeTimeout) {
            clearTimeout(this.scheduledTextChangeTimeout);
        }
        const msSinceLastChange = performance.now() - this.textChangedAt;
        const msToTextChange = minimumTextVisibilityDuration - msSinceLastChange;
        this.scheduledTextChangeTimeout = window.setTimeout(() => {
            this.commitTextChange(text);
        }, Math.max(msToTextChange, 0));
    }
    renderBugReport(err) {
        console.error(err);
        if (this.scheduledFastFactTimeout) {
            window.clearTimeout(this.scheduledFastFactTimeout);
        }
        if (this.scheduledTextChangeTimeout) {
            window.clearTimeout(this.scheduledTextChangeTimeout);
        }
        this.resetProgressBarClasses();
        if (this.progressBar) {
            this.progressBar.classList.add('errored');
        }
        if (this.statusText) {
            this.commitTextChange('');
            UI.UIUtils.createTextChild(this.statusText.createChild('p'), i18nString(UIStrings.ahSorryWeRanIntoAnError));
            if (KnownBugPatterns.some(pattern => pattern.test(err.message))) {
                const message = i18nString(UIStrings.tryToNavigateToTheUrlInAFresh);
                UI.UIUtils.createTextChild(this.statusText.createChild('p'), message);
            }
            else {
                this.renderBugReportBody(err, this.inspectedURL);
            }
        }
    }
    renderText(statusHeader, text) {
        this.renderStatusHeader(statusHeader);
        this.commitTextChange(text);
    }
    toggleCancelButton(show) {
        if (this.cancelButton) {
            this.cancelButton.style.visibility = show ? 'visible' : 'hidden';
        }
    }
    renderBugReportBody(err, auditURL) {
        const chromeVersion = navigator.userAgent.match(/Chrome\/(\S+)/) || ['', 'Unknown'];
        // @ts-ignore Lighthouse sets `friendlyMessage` on certain
        // important errors such as PROTOCOL_TIMEOUT.
        const errorMessage = err.friendlyMessage || err.message;
        const issueBody = `
${errorMessage}
\`\`\`
Channel: DevTools
Initial URL: ${auditURL}
Chrome Version: ${chromeVersion[1]}
Stack Trace: ${err.stack}
\`\`\`
`;
        if (this.statusText) {
            UI.UIUtils.createTextChild(this.statusText.createChild('p'), i18nString(UIStrings.ifThisIssueIsReproduciblePlease));
            UI.UIUtils.createTextChild(this.statusText.createChild('code', 'monospace'), issueBody.trim());
        }
    }
}
export const fastFactRotationInterval = 6000;
export const minimumTextVisibilityDuration = 3000;
const KnownBugPatterns = [
    /PARSING_PROBLEM/,
    /DOCUMENT_REQUEST/,
    /READ_FAILED/,
    /TRACING_ALREADY_STARTED/,
    /^You must provide a url to the runner/,
    /^You probably have multiple tabs open/,
];
export const StatusPhases = [
    {
        id: 'loading',
        progressBarClass: 'loading',
        message: i18nLazyString(UIStrings.lighthouseIsLoadingThePage),
        statusMessageRegex: /^(Loading page|Navigating to)/,
    },
    {
        id: 'gathering',
        progressBarClass: 'gathering',
        message: i18nLazyString(UIStrings.lighthouseIsGatheringInformation),
        statusMessageRegex: /^(Gathering|Computing artifact)/,
    },
    {
        id: 'auditing',
        progressBarClass: 'auditing',
        message: i18nLazyString(UIStrings.almostThereLighthouseIsNow),
        statusMessageRegex: /^Auditing/,
    },
];
const LoadingMessages = [
    {
        deviceType: 'mobile',
        throttling: 'on',
        message: i18nLazyString(UIStrings.lighthouseIsLoadingYourPageWith),
    },
    {
        deviceType: 'desktop',
        throttling: 'on',
        message: i18nLazyString(UIStrings.lighthouseIsLoadingYourPageWithThrottling),
    },
    {
        deviceType: 'mobile',
        throttling: 'off',
        message: i18nLazyString(UIStrings.lighthouseIsLoadingYourPageWithMobile),
    },
    {
        deviceType: 'desktop',
        throttling: 'off',
        message: i18nLazyString(UIStrings.lighthouseIsLoadingThePage),
    },
];
const FastFacts = [
    i18nLazyString(UIStrings.mbTakesAMinimumOfSecondsTo),
    i18nLazyString(UIStrings.rebuildingPinterestPagesFor),
    i18nLazyString(UIStrings.byReducingTheResponseSizeOfJson),
    i18nLazyString(UIStrings.walmartSawAIncreaseInRevenueFor),
    i18nLazyString(UIStrings.ifASiteTakesSecondToBecome),
    i18nLazyString(UIStrings.OfGlobalMobileUsersInWereOnGOrG),
    i18nLazyString(UIStrings.theAverageUserDeviceCostsLess),
    i18nLazyString(UIStrings.SecondsIsTheAverageTimeAMobile),
    i18nLazyString(UIStrings.OfMobilePagesTakeNearlySeconds),
    i18nLazyString(UIStrings.asPageLoadTimeIncreasesFromOne),
    i18nLazyString(UIStrings.asTheNumberOfElementsOnAPage),
    i18nLazyString(UIStrings.OfMobilePagesTakeNearlySeconds),
    i18nLazyString(UIStrings.lighthouseOnlySimulatesMobile),
];
//# sourceMappingURL=LighthouseStatusView.js.map