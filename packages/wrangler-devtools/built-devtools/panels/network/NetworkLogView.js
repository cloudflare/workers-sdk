// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as HAR from '../../models/har/har.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import * as Logs from '../../models/logs/logs.js';
import * as Persistence from '../../models/persistence/persistence.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as NetworkForward from '../../panels/network/forward/forward.js';
import * as Sources from '../../panels/sources/sources.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ThemeSupport from '../../ui/legacy/theme_support/theme_support.js';
import networkLogViewStyles from './networkLogView.css.js';
import { Events, NetworkGroupNode, NetworkRequestNode } from './NetworkDataGridNode.js';
import { NetworkFrameGrouper } from './NetworkFrameGrouper.js';
import { NetworkLogViewColumns } from './NetworkLogViewColumns.js';
import { NetworkTimeBoundary, NetworkTransferDurationCalculator, NetworkTransferTimeCalculator, } from './NetworkTimeCalculator.js';
const UIStrings = {
    /**
    *@description Text in Network Log View of the Network panel
    */
    invertFilter: 'Invert',
    /**
    *@description Tooltip for the 'invert' checkbox in the Network panel.
    */
    invertsFilter: 'Inverts the search filter',
    /**
    *@description Text in Network Log View of the Network panel
    */
    hideDataUrls: 'Hide data URLs',
    /**
    *@description Data urlfilter ui element title in Network Log View of the Network panel
    */
    hidesDataAndBlobUrls: 'Hides data: and blob: URLs',
    /**
    *@description Aria accessible name in Network Log View of the Network panel
    */
    resourceTypesToInclude: 'Resource types to include',
    /**
    *@description Label for a filter in the Network panel
    */
    hasBlockedCookies: 'Has blocked cookies',
    /**
    *@description Tooltip for a checkbox in the Network panel. The response to a network request may include a
    *             cookie (https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies). Such response cookies can
    *             be malformed or otherwise invalid and the browser may choose to ignore or not accept invalid cookies.
    */
    onlyShowRequestsWithBlocked: 'Only show requests with blocked response cookies',
    /**
    *@description Label for a filter in the Network panel
    */
    blockedRequests: 'Blocked Requests',
    /**
    *@description Tooltip for a filter in the Network panel
    */
    onlyShowBlockedRequests: 'Only show blocked requests',
    /**
    *@description Label for a filter in the Network panel
    */
    thirdParty: '3rd-party requests',
    /**
    *@description Tooltip for a filter in the Network panel
    */
    onlyShowThirdPartyRequests: 'Shows only requests with origin different from page origin',
    /**
    *@description Text that appears when user drag and drop something (for example, a file) in Network Log View of the Network panel
    */
    dropHarFilesHere: 'Drop HAR files here',
    /**
    *@description Recording text text content in Network Log View of the Network panel
    */
    recordingNetworkActivity: 'Recording network activity…',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {Ctrl + R} PH1
    */
    performARequestOrHitSToRecordThe: 'Perform a request or hit {PH1} to record the reload.',
    /**
    *@description Shown in the Network Log View of the Network panel when the user has not yet
    * recorded any network activity. This is an instruction to the user to start recording in order to
    * show network activity in the current UI.
    *@example {Ctrl + E} PH1
    */
    recordToDisplayNetworkActivity: 'Record network log ({PH1}) to display network activity.',
    /**
    *@description Text that is usually a hyperlink to more documentation
    */
    learnMore: 'Learn more',
    /**
    *@description Text to announce to screen readers that network data is available.
    */
    networkDataAvailable: 'Network Data Available',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {3} PH1
    *@example {5} PH2
    */
    sSRequests: '{PH1} / {PH2} requests',
    /**
    *@description Message in the summary toolbar at the bottom of the Network log that shows the compressed size of the
    * resources transferred during a selected time frame over the compressed size of all resources transferred during
    * the whole network log.
    *@example {5 B} PH1
    *@example {10 B} PH2
    */
    sSTransferred: '{PH1} / {PH2} transferred',
    /**
    *@description Message in a tooltip that shows the compressed size of the resources transferred during a selected
    * time frame over the compressed size of all resources transferred during the whole network log.
    *@example {10} PH1
    *@example {15} PH2
    */
    sBSBTransferredOverNetwork: '{PH1} B / {PH2} B transferred over network',
    /**
    * @description Text in Network Log View of the Network panel. Appears when a particular network
    * resource is selected by the user. Shows how large the selected resource was (PH1) out of the
    * total size (PH2).
    * @example {40MB} PH1
    * @example {50MB} PH2
    */
    sSResources: '{PH1} / {PH2} resources',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {40} PH1
    *@example {50} PH2
    */
    sBSBResourcesLoadedByThePage: '{PH1} B / {PH2} B resources loaded by the page',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {6} PH1
    */
    sRequests: '{PH1} requests',
    /**
    *@description Message in the summary toolbar at the bottom of the Network log that shows the compressed size of
    * all resources transferred over network during a network activity log.
    *@example {4 B} PH1
    */
    sTransferred: '{PH1} transferred',
    /**
    *@description Message in a tooltip that shows the compressed size of all resources transferred over network during
    * a network activity log.
    *@example {4} PH1
    */
    sBTransferredOverNetwork: '{PH1} B transferred over network',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {4} PH1
    */
    sResources: '{PH1} resources',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {10} PH1
    */
    sBResourcesLoadedByThePage: '{PH1} B resources loaded by the page',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {120ms} PH1
    */
    finishS: 'Finish: {PH1}',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {3000ms} PH1
    */
    domcontentloadedS: 'DOMContentLoaded: {PH1}',
    /**
    *@description Text in Network Log View of the Network panel
    *@example {40ms} PH1
    */
    loadS: 'Load: {PH1}',
    /**
    *@description Text for copying
    */
    copy: 'Copy',
    /**
    *@description Text in Network Log View of the Network panel
    */
    copyRequestHeaders: 'Copy request headers',
    /**
    *@description Text in Network Log View of the Network panel
    */
    copyResponseHeaders: 'Copy response headers',
    /**
    *@description Text in Network Log View of the Network panel
    */
    copyResponse: 'Copy response',
    /**
    *@description Text in Network Log View of the Network panel
    */
    copyStacktrace: 'Copy stack trace',
    /**
    * @description A context menu command in the Network panel, for copying to the clipboard.
    * PowerShell refers to the format the data will be copied as.
    */
    copyAsPowershell: 'Copy as `PowerShell`',
    /**
    *@description A context menu command in the Network panel, for copying to the clipboard. 'fetch'
    * refers to the format the data will be copied as, which is compatible with the fetch web API.
    */
    copyAsFetch: 'Copy as `fetch`',
    /**
    * @description Text in Network Log View of the Network panel. An action that copies a command to
    * the developer's clipboard. The command allows the developer to replay this specific network
    * request in Node.js, a desktop application/framework. 'Node.js fetch' is a noun phrase for the
    * type of request that will be copied.
    */
    copyAsNodejsFetch: 'Copy as `Node.js` `fetch`',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with cURL (a program, not
    *translatable).
    */
    copyAsCurlCmd: 'Copy as `cURL` (`cmd`)',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with a Bash script.
    */
    copyAsCurlBash: 'Copy as `cURL` (`bash`)',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with a PowerShell script.
    */
    copyAllAsPowershell: 'Copy all as `PowerShell`',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with a 'fetch' command (fetch
    *should not be translated).
    */
    copyAllAsFetch: 'Copy all as `fetch`',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with a Node.js 'fetch' command
    *(fetch and Node.js should not be translated).
    */
    copyAllAsNodejsFetch: 'Copy all as `Node.js` `fetch`',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with cURL (a program, not
    *translatable).
    */
    copyAllAsCurlCmd: 'Copy all as `cURL` (`cmd`)',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with a Bash script.
    */
    copyAllAsCurlBash: 'Copy all as `cURL` (`bash`)',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with cURL (a program, not
    *translatable).
    */
    copyAsCurl: 'Copy as `cURL`',
    /**
    *@description Text in Network Log View of the Network panel. An action that copies a command to
    *the clipboard. It will copy the command in the format compatible with cURL (a program, not
    *translatable).
    */
    copyAllAsCurl: 'Copy all as `cURL`',
    /**
    * @description Text in Network Log View of the Network panel. An action that copies data to the
    * clipboard. It will copy the data in the HAR (not translatable) format. 'all' refers to every
    * network request that is currently shown.
    */
    copyAllAsHar: 'Copy all as `HAR`',
    /**
    *@description A context menu item in the Network Log View of the Network panel
    */
    saveAllAsHarWithContent: 'Save all as `HAR` with content',
    /**
    *@description A context menu item in the Network Log View of the Network panel
    */
    clearBrowserCache: 'Clear browser cache',
    /**
    *@description A context menu item in the Network Log View of the Network panel
    */
    clearBrowserCookies: 'Clear browser cookies',
    /**
    *@description A context menu item in the Network Log View of the Network panel
    */
    blockRequestUrl: 'Block request URL',
    /**
    *@description A context menu item in the Network Log View of the Network panel
    *@example {example.com} PH1
    */
    unblockS: 'Unblock {PH1}',
    /**
    *@description A context menu item in the Network Log View of the Network panel
    */
    blockRequestDomain: 'Block request domain',
    /**
    *@description Text to replay an XHR request
    */
    replayXhr: 'Replay XHR',
    /**
    *@description Text in Network Log View of the Network panel
    */
    areYouSureYouWantToClearBrowser: 'Are you sure you want to clear browser cache?',
    /**
    *@description Text in Network Log View of the Network panel
    */
    areYouSureYouWantToClearBrowserCookies: 'Are you sure you want to clear browser cookies?',
    /**
    *@description A context menu item in the Network Log View of the Network panel
    * for creating a header override
    */
    createResponseHeaderOverride: 'Create response header override',
};
const str_ = i18n.i18n.registerUIStrings('panels/network/NetworkLogView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class NetworkLogView extends Common.ObjectWrapper.eventMixin(UI.Widget.VBox) {
    networkInvertFilterSetting;
    networkHideDataURLSetting;
    networkShowIssuesOnlySetting;
    networkOnlyBlockedRequestsSetting;
    networkOnlyThirdPartySetting;
    networkResourceTypeFiltersSetting;
    rawRowHeight;
    progressBarContainer;
    networkLogLargeRowsSetting;
    rowHeightInternal;
    timeCalculatorInternal;
    durationCalculator;
    calculatorInternal;
    columns;
    staleRequests;
    mainRequestLoadTime;
    mainRequestDOMContentLoadedTime;
    filters;
    timeFilter;
    hoveredNodeInternal;
    recordingHint;
    refreshRequestId;
    highlightedNode;
    linkifierInternal;
    recording;
    needsRefresh;
    headerHeightInternal;
    groupLookups;
    activeGroupLookup;
    textFilterUI;
    invertFilterUI;
    dataURLFilterUI;
    resourceCategoryFilterUI;
    onlyIssuesFilterUI;
    onlyBlockedRequestsUI;
    onlyThirdPartyFilterUI;
    filterParser;
    suggestionBuilder;
    dataGrid;
    summaryToolbar;
    filterBar;
    textFilterSetting;
    constructor(filterBar, progressBarContainer, networkLogLargeRowsSetting) {
        super();
        this.setMinimumSize(50, 64);
        this.element.id = 'network-container';
        this.element.classList.add('no-node-selected');
        this.networkInvertFilterSetting = Common.Settings.Settings.instance().createSetting('networkInvertFilter', false);
        this.networkHideDataURLSetting = Common.Settings.Settings.instance().createSetting('networkHideDataURL', false);
        this.networkShowIssuesOnlySetting =
            Common.Settings.Settings.instance().createSetting('networkShowIssuesOnly', false);
        this.networkOnlyBlockedRequestsSetting =
            Common.Settings.Settings.instance().createSetting('networkOnlyBlockedRequests', false);
        this.networkOnlyThirdPartySetting =
            Common.Settings.Settings.instance().createSetting('networkOnlyThirdPartySetting', false);
        this.networkResourceTypeFiltersSetting =
            Common.Settings.Settings.instance().createSetting('networkResourceTypeFilters', {});
        this.rawRowHeight = 0;
        this.progressBarContainer = progressBarContainer;
        this.networkLogLargeRowsSetting = networkLogLargeRowsSetting;
        this.networkLogLargeRowsSetting.addChangeListener(updateRowHeight.bind(this), this);
        function updateRowHeight() {
            this.rawRowHeight = Boolean(this.networkLogLargeRowsSetting.get()) ? 41 : 21;
            this.rowHeightInternal = this.computeRowHeight();
        }
        this.rawRowHeight = 0;
        this.rowHeightInternal = 0;
        updateRowHeight.call(this);
        this.timeCalculatorInternal = new NetworkTransferTimeCalculator();
        this.durationCalculator = new NetworkTransferDurationCalculator();
        this.calculatorInternal = this.timeCalculatorInternal;
        this.columns = new NetworkLogViewColumns(this, this.timeCalculatorInternal, this.durationCalculator, networkLogLargeRowsSetting);
        this.columns.show(this.element);
        this.staleRequests = new Set();
        this.mainRequestLoadTime = -1;
        this.mainRequestDOMContentLoadedTime = -1;
        this.filters = [];
        this.timeFilter = null;
        this.hoveredNodeInternal = null;
        this.recordingHint = null;
        this.refreshRequestId = null;
        this.highlightedNode = null;
        this.linkifierInternal = new Components.Linkifier.Linkifier();
        this.recording = false;
        this.needsRefresh = false;
        this.headerHeightInternal = 0;
        this.groupLookups = new Map();
        this.groupLookups.set('Frame', new NetworkFrameGrouper(this));
        this.activeGroupLookup = null;
        this.textFilterUI = new UI.FilterBar.TextFilterUI();
        this.textFilterUI.addEventListener("FilterChanged" /* FilterChanged */, this.filterChanged, this);
        filterBar.addFilter(this.textFilterUI);
        this.invertFilterUI = new UI.FilterBar.CheckboxFilterUI('invert-filter', i18nString(UIStrings.invertFilter), true, this.networkInvertFilterSetting);
        this.invertFilterUI.addEventListener("FilterChanged" /* FilterChanged */, this.filterChanged.bind(this), this);
        UI.Tooltip.Tooltip.install(this.invertFilterUI.element(), i18nString(UIStrings.invertsFilter));
        filterBar.addFilter(this.invertFilterUI);
        this.dataURLFilterUI = new UI.FilterBar.CheckboxFilterUI('hide-data-url', i18nString(UIStrings.hideDataUrls), true, this.networkHideDataURLSetting);
        this.dataURLFilterUI.addEventListener("FilterChanged" /* FilterChanged */, this.filterChanged.bind(this), this);
        UI.Tooltip.Tooltip.install(this.dataURLFilterUI.element(), i18nString(UIStrings.hidesDataAndBlobUrls));
        filterBar.addFilter(this.dataURLFilterUI);
        const filterItems = Object.values(Common.ResourceType.resourceCategories)
            .map(category => ({ name: category.title(), label: () => category.shortTitle(), title: category.title() }));
        this.resourceCategoryFilterUI =
            new UI.FilterBar.NamedBitSetFilterUI(filterItems, this.networkResourceTypeFiltersSetting);
        UI.ARIAUtils.setAccessibleName(this.resourceCategoryFilterUI.element(), i18nString(UIStrings.resourceTypesToInclude));
        this.resourceCategoryFilterUI.addEventListener("FilterChanged" /* FilterChanged */, this.filterChanged.bind(this), this);
        filterBar.addFilter(this.resourceCategoryFilterUI);
        this.onlyIssuesFilterUI = new UI.FilterBar.CheckboxFilterUI('only-show-issues', i18nString(UIStrings.hasBlockedCookies), true, this.networkShowIssuesOnlySetting);
        this.onlyIssuesFilterUI.addEventListener("FilterChanged" /* FilterChanged */, this.filterChanged.bind(this), this);
        UI.Tooltip.Tooltip.install(this.onlyIssuesFilterUI.element(), i18nString(UIStrings.onlyShowRequestsWithBlocked));
        filterBar.addFilter(this.onlyIssuesFilterUI);
        this.onlyBlockedRequestsUI = new UI.FilterBar.CheckboxFilterUI('only-show-blocked-requests', i18nString(UIStrings.blockedRequests), true, this.networkOnlyBlockedRequestsSetting);
        this.onlyBlockedRequestsUI.addEventListener("FilterChanged" /* FilterChanged */, this.filterChanged.bind(this), this);
        UI.Tooltip.Tooltip.install(this.onlyBlockedRequestsUI.element(), i18nString(UIStrings.onlyShowBlockedRequests));
        filterBar.addFilter(this.onlyBlockedRequestsUI);
        this.onlyThirdPartyFilterUI = new UI.FilterBar.CheckboxFilterUI('only-show-third-party', i18nString(UIStrings.thirdParty), true, this.networkOnlyThirdPartySetting);
        this.onlyThirdPartyFilterUI.addEventListener("FilterChanged" /* FilterChanged */, this.filterChanged.bind(this), this);
        UI.Tooltip.Tooltip.install(this.onlyThirdPartyFilterUI.element(), i18nString(UIStrings.onlyShowThirdPartyRequests));
        filterBar.addFilter(this.onlyThirdPartyFilterUI);
        this.filterParser = new TextUtils.TextUtils.FilterParser(searchKeys);
        this.suggestionBuilder =
            new UI.FilterSuggestionBuilder.FilterSuggestionBuilder(searchKeys, NetworkLogView.sortSearchValues);
        this.resetSuggestionBuilder();
        this.dataGrid = this.columns.dataGrid();
        this.setupDataGrid();
        this.columns.sortByCurrentColumn();
        filterBar.filterButton().addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.dataGrid.scheduleUpdate.bind(this.dataGrid, true /* isFromUser */));
        this.summaryToolbar = new UI.Toolbar.Toolbar('network-summary-bar', this.element);
        this.summaryToolbar.element.setAttribute('role', 'status');
        new UI.DropTarget.DropTarget(this.element, [UI.DropTarget.Type.File], i18nString(UIStrings.dropHarFilesHere), this.handleDrop.bind(this));
        Common.Settings.Settings.instance()
            .moduleSetting('networkColorCodeResourceTypes')
            .addChangeListener(this.invalidateAllItems.bind(this, false), this);
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.NetworkManager.NetworkManager, this);
        Logs.NetworkLog.NetworkLog.instance().addEventListener(Logs.NetworkLog.Events.RequestAdded, this.onRequestUpdated, this);
        Logs.NetworkLog.NetworkLog.instance().addEventListener(Logs.NetworkLog.Events.RequestUpdated, this.onRequestUpdated, this);
        Logs.NetworkLog.NetworkLog.instance().addEventListener(Logs.NetworkLog.Events.Reset, this.reset, this);
        this.updateGroupByFrame();
        Common.Settings.Settings.instance()
            .moduleSetting('network.group-by-frame')
            .addChangeListener(() => this.updateGroupByFrame());
        this.filterBar = filterBar;
        this.textFilterSetting = Common.Settings.Settings.instance().createSetting('networkTextFilter', '');
        if (this.textFilterSetting.get()) {
            this.textFilterUI.setValue(this.textFilterSetting.get());
        }
    }
    updateGroupByFrame() {
        const value = Common.Settings.Settings.instance().moduleSetting('network.group-by-frame').get();
        this.setGrouping(value ? 'Frame' : null);
    }
    static sortSearchValues(key, values) {
        if (key === NetworkForward.UIFilter.FilterType.Priority) {
            values.sort((a, b) => {
                const aPriority = PerfUI.NetworkPriorities.uiLabelToNetworkPriority(a);
                const bPriority = PerfUI.NetworkPriorities.uiLabelToNetworkPriority(b);
                return PerfUI.NetworkPriorities.networkPriorityWeight(aPriority) -
                    PerfUI.NetworkPriorities.networkPriorityWeight(bPriority);
            });
        }
        else {
            values.sort();
        }
    }
    static negativeFilter(filter, request) {
        return !filter(request);
    }
    static requestPathFilter(regex, request) {
        if (!regex) {
            return false;
        }
        return regex.test(request.path() + '/' + request.name());
    }
    static subdomains(domain) {
        const result = [domain];
        let indexOfPeriod = domain.indexOf('.');
        while (indexOfPeriod !== -1) {
            result.push('*' + domain.substring(indexOfPeriod));
            indexOfPeriod = domain.indexOf('.', indexOfPeriod + 1);
        }
        return result;
    }
    static createRequestDomainFilter(value) {
        const escapedPattern = value.split('*').map(Platform.StringUtilities.escapeForRegExp).join('.*');
        return NetworkLogView.requestDomainFilter.bind(null, new RegExp('^' + escapedPattern + '$', 'i'));
    }
    static requestDomainFilter(regex, request) {
        return regex.test(request.domain);
    }
    static runningRequestFilter(request) {
        return !request.finished;
    }
    static fromCacheRequestFilter(request) {
        return request.cached();
    }
    static interceptedByServiceWorkerFilter(request) {
        return request.fetchedViaServiceWorker;
    }
    static initiatedByServiceWorkerFilter(request) {
        return request.initiatedByServiceWorker();
    }
    static requestResponseHeaderFilter(value, request) {
        return request.responseHeaderValue(value) !== undefined;
    }
    static requestResponseHeaderSetCookieFilter(value, request) {
        // Multiple Set-Cookie headers in the request are concatenated via space. Only
        // filter via `includes` instead of strict equality.
        return Boolean(request.responseHeaderValue('Set-Cookie')?.includes(value));
    }
    static requestMethodFilter(value, request) {
        return request.requestMethod === value;
    }
    static requestPriorityFilter(value, request) {
        return request.priority() === value;
    }
    static requestMimeTypeFilter(value, request) {
        return request.mimeType === value;
    }
    static requestMixedContentFilter(value, request) {
        if (value === NetworkForward.UIFilter.MixedContentFilterValues.Displayed) {
            return request.mixedContentType === "optionally-blockable" /* OptionallyBlockable */;
        }
        if (value === NetworkForward.UIFilter.MixedContentFilterValues.Blocked) {
            return request.mixedContentType === "blockable" /* Blockable */ && request.wasBlocked();
        }
        if (value === NetworkForward.UIFilter.MixedContentFilterValues.BlockOverridden) {
            return request.mixedContentType === "blockable" /* Blockable */ && !request.wasBlocked();
        }
        if (value === NetworkForward.UIFilter.MixedContentFilterValues.All) {
            return request.mixedContentType !== "none" /* None */;
        }
        return false;
    }
    static requestSchemeFilter(value, request) {
        return request.scheme === value;
    }
    static requestCookieDomainFilter(value, request) {
        return request.allCookiesIncludingBlockedOnes().some(cookie => cookie.domain() === value);
    }
    static requestCookieNameFilter(value, request) {
        return request.allCookiesIncludingBlockedOnes().some(cookie => cookie.name() === value);
    }
    static requestCookiePathFilter(value, request) {
        return request.allCookiesIncludingBlockedOnes().some(cookie => cookie.path() === value);
    }
    static requestCookieValueFilter(value, request) {
        return request.allCookiesIncludingBlockedOnes().some(cookie => cookie.value() === value);
    }
    static requestSetCookieDomainFilter(value, request) {
        return request.responseCookies.some(cookie => cookie.domain() === value);
    }
    static requestSetCookieNameFilter(value, request) {
        return request.responseCookies.some(cookie => cookie.name() === value);
    }
    static requestSetCookieValueFilter(value, request) {
        return request.responseCookies.some(cookie => cookie.value() === value);
    }
    static requestSizeLargerThanFilter(value, request) {
        return request.transferSize >= value;
    }
    static statusCodeFilter(value, request) {
        return (String(request.statusCode)) === value;
    }
    static getHTTPRequestsFilter(request) {
        return request.parsedURL.isValid && (request.scheme in HTTPSchemas);
    }
    static resourceTypeFilter(value, request) {
        return request.resourceType().name() === value;
    }
    static requestUrlFilter(value, request) {
        const regex = new RegExp(Platform.StringUtilities.escapeForRegExp(value), 'i');
        return regex.test(request.url());
    }
    static requestTimeFilter(windowStart, windowEnd, request) {
        if (request.issueTime() > windowEnd) {
            return false;
        }
        if (request.endTime !== -1 && request.endTime < windowStart) {
            return false;
        }
        return true;
    }
    static copyRequestHeaders(request) {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(request.requestHeadersText());
    }
    static copyResponseHeaders(request) {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(request.responseHeadersText);
    }
    static async copyResponse(request) {
        const contentData = await request.contentData();
        let content = contentData.content || '';
        if (!request.contentType().isTextType()) {
            content = TextUtils.ContentProvider.contentAsDataURL(content, request.mimeType, contentData.encoded);
        }
        else if (contentData.encoded && content) {
            content = window.atob(content);
        }
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(content);
    }
    handleDrop(dataTransfer) {
        const items = dataTransfer.items;
        if (!items.length) {
            return;
        }
        const file = items[0].getAsFile();
        if (file) {
            void this.onLoadFromFile(file);
        }
    }
    async onLoadFromFile(file) {
        const outputStream = new Common.StringOutputStream.StringOutputStream();
        const reader = new Bindings.FileUtils.ChunkedFileReader(file, /* chunkSize */ 10000000);
        const success = await reader.read(outputStream);
        if (!success) {
            const error = reader.error();
            if (error) {
                this.harLoadFailed(error.message);
            }
            return;
        }
        let harRoot;
        try {
            // HARRoot and JSON.parse might throw.
            harRoot = new HAR.HARFormat.HARRoot(JSON.parse(outputStream.data()));
        }
        catch (e) {
            this.harLoadFailed(e);
            return;
        }
        Logs.NetworkLog.NetworkLog.instance().importRequests(HAR.Importer.Importer.requestsFromHARLog(harRoot.log));
    }
    harLoadFailed(message) {
        Common.Console.Console.instance().error('Failed to load HAR file with following error: ' + message);
    }
    setGrouping(groupKey) {
        if (this.activeGroupLookup) {
            this.activeGroupLookup.reset();
        }
        const groupLookup = groupKey ? this.groupLookups.get(groupKey) || null : null;
        this.activeGroupLookup = groupLookup;
        this.invalidateAllItems();
    }
    computeRowHeight() {
        return Math.round(this.rawRowHeight * window.devicePixelRatio) / window.devicePixelRatio;
    }
    nodeForRequest(request) {
        return networkRequestToNode.get(request) || null;
    }
    headerHeight() {
        return this.headerHeightInternal;
    }
    setRecording(recording) {
        this.recording = recording;
        this.updateSummaryBar();
    }
    modelAdded(networkManager) {
        // TODO(allada) Remove dependency on networkManager and instead use NetworkLog and PageLoad for needed data.
        if (networkManager.target().parentTarget()) {
            return;
        }
        const resourceTreeModel = networkManager.target().model(SDK.ResourceTreeModel.ResourceTreeModel);
        if (resourceTreeModel) {
            resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.Load, this.loadEventFired, this);
            resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.DOMContentLoaded, this.domContentLoadedEventFired, this);
        }
    }
    modelRemoved(networkManager) {
        if (!networkManager.target().parentTarget()) {
            const resourceTreeModel = networkManager.target().model(SDK.ResourceTreeModel.ResourceTreeModel);
            if (resourceTreeModel) {
                resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.Load, this.loadEventFired, this);
                resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.DOMContentLoaded, this.domContentLoadedEventFired, this);
            }
        }
    }
    linkifier() {
        return this.linkifierInternal;
    }
    setWindow(start, end) {
        if (!start && !end) {
            this.timeFilter = null;
            this.timeCalculatorInternal.setWindow(null);
        }
        else {
            this.timeFilter = NetworkLogView.requestTimeFilter.bind(null, start, end);
            this.timeCalculatorInternal.setWindow(new NetworkTimeBoundary(start, end));
        }
        this.filterRequests();
    }
    resetFocus() {
        this.dataGrid.element.focus();
    }
    resetSuggestionBuilder() {
        this.suggestionBuilder.clear();
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.Is, NetworkForward.UIFilter.IsFilterType.Running);
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.Is, NetworkForward.UIFilter.IsFilterType.FromCache);
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.Is, NetworkForward.UIFilter.IsFilterType.ServiceWorkerIntercepted);
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.Is, NetworkForward.UIFilter.IsFilterType.ServiceWorkerInitiated);
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.LargerThan, '100');
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.LargerThan, '10k');
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.LargerThan, '1M');
        this.textFilterUI.setSuggestionProvider(this.suggestionBuilder.completions.bind(this.suggestionBuilder));
    }
    filterChanged() {
        this.removeAllNodeHighlights();
        this.parseFilterQuery(this.textFilterUI.value(), this.invertFilterUI.checked());
        this.filterRequests();
        this.textFilterSetting.set(this.textFilterUI.value());
    }
    async resetFilter() {
        this.textFilterUI.clear();
    }
    showRecordingHint() {
        this.hideRecordingHint();
        this.recordingHint = this.element.createChild('div', 'network-status-pane fill');
        const hintText = this.recordingHint.createChild('div', 'recording-hint');
        if (this.recording) {
            let reloadShortcutNode = null;
            const reloadShortcut = UI.ShortcutRegistry.ShortcutRegistry.instance().shortcutsForAction('inspector_main.reload')[0];
            if (reloadShortcut) {
                reloadShortcutNode = this.recordingHint.createChild('b');
                reloadShortcutNode.textContent = reloadShortcut.title();
            }
            const recordingText = hintText.createChild('span');
            recordingText.textContent = i18nString(UIStrings.recordingNetworkActivity);
            if (reloadShortcutNode) {
                hintText.createChild('br');
                hintText.appendChild(i18n.i18n.getFormatLocalizedString(str_, UIStrings.performARequestOrHitSToRecordThe, { PH1: reloadShortcutNode }));
            }
        }
        else {
            const recordNode = hintText.createChild('b');
            recordNode.textContent =
                UI.ShortcutRegistry.ShortcutRegistry.instance().shortcutTitleForAction('network.toggle-recording') || '';
            hintText.appendChild(i18n.i18n.getFormatLocalizedString(str_, UIStrings.recordToDisplayNetworkActivity, { PH1: recordNode }));
        }
        hintText.createChild('br');
        hintText.appendChild(UI.XLink.XLink.create('https://developer.chrome.com/docs/devtools/network/?utm_source=devtools&utm_campaign=2019Q1', i18nString(UIStrings.learnMore)));
        this.setHidden(true);
    }
    hideRecordingHint() {
        this.setHidden(false);
        if (this.recordingHint) {
            this.recordingHint.remove();
        }
        UI.ARIAUtils.alert(i18nString(UIStrings.networkDataAvailable));
        this.recordingHint = null;
    }
    setHidden(value) {
        this.columns.setHidden(value);
        UI.ARIAUtils.setHidden(this.summaryToolbar.element, value);
    }
    elementsToRestoreScrollPositionsFor() {
        if (!this.dataGrid) // Not initialized yet.
         {
            return [];
        }
        return [this.dataGrid.scrollContainer];
    }
    columnExtensionResolved() {
        this.invalidateAllItems(true);
    }
    setupDataGrid() {
        this.dataGrid.setRowContextMenuCallback((contextMenu, node) => {
            const request = node.request();
            if (request) {
                this.handleContextMenuForRequest(contextMenu, request);
            }
        });
        this.dataGrid.setStickToBottom(true);
        this.dataGrid.setName('networkLog');
        this.dataGrid.setResizeMethod(DataGrid.DataGrid.ResizeMethod.Last);
        this.dataGrid.element.classList.add('network-log-grid');
        this.dataGrid.element.addEventListener('mousedown', this.dataGridMouseDown.bind(this), true);
        this.dataGrid.element.addEventListener('mousemove', this.dataGridMouseMove.bind(this), true);
        this.dataGrid.element.addEventListener('mouseleave', () => this.setHoveredNode(null), true);
        this.dataGrid.element.addEventListener('keydown', event => {
            if (event.key === 'ArrowRight' && this.dataGrid.selectedNode) {
                const initiatorLink = this.dataGrid.selectedNode.element().querySelector('span.devtools-link');
                if (initiatorLink) {
                    initiatorLink.focus();
                }
            }
            if (isEnterOrSpaceKey(event)) {
                this.dispatchEventToListeners(Events.RequestActivated, { showPanel: true, takeFocus: true });
                event.consume(true);
            }
        });
        this.dataGrid.element.addEventListener('keyup', event => {
            if ((event.key === 'r' || event.key === 'R') && this.dataGrid.selectedNode) {
                const request = this.dataGrid.selectedNode.request();
                if (!request) {
                    return;
                }
                if (SDK.NetworkManager.NetworkManager.canReplayRequest(request)) {
                    SDK.NetworkManager.NetworkManager.replayRequest(request);
                }
            }
        });
        this.dataGrid.element.addEventListener('focus', this.onDataGridFocus.bind(this), true);
        this.dataGrid.element.addEventListener('blur', this.onDataGridBlur.bind(this), true);
        return this.dataGrid;
    }
    dataGridMouseMove(event) {
        const mouseEvent = event;
        const node = (this.dataGrid.dataGridNodeFromNode(mouseEvent.target));
        const highlightInitiatorChain = mouseEvent.shiftKey;
        this.setHoveredNode(node, highlightInitiatorChain);
    }
    hoveredNode() {
        return this.hoveredNodeInternal;
    }
    setHoveredNode(node, highlightInitiatorChain) {
        if (this.hoveredNodeInternal) {
            this.hoveredNodeInternal.setHovered(false, false);
        }
        this.hoveredNodeInternal = node;
        if (this.hoveredNodeInternal) {
            this.hoveredNodeInternal.setHovered(true, Boolean(highlightInitiatorChain));
        }
    }
    dataGridMouseDown(event) {
        const mouseEvent = event;
        if (!this.dataGrid.selectedNode && mouseEvent.button) {
            mouseEvent.consume();
        }
    }
    updateSummaryBar() {
        this.hideRecordingHint();
        let transferSize = 0;
        let resourceSize = 0;
        let selectedNodeNumber = 0;
        let selectedTransferSize = 0;
        let selectedResourceSize = 0;
        let baseTime = -1;
        let maxTime = -1;
        let nodeCount = 0;
        for (const request of Logs.NetworkLog.NetworkLog.instance().requests()) {
            const node = networkRequestToNode.get(request);
            if (!node) {
                continue;
            }
            nodeCount++;
            const requestTransferSize = request.transferSize;
            transferSize += requestTransferSize;
            const requestResourceSize = request.resourceSize;
            resourceSize += requestResourceSize;
            if (!filteredNetworkRequests.has(node)) {
                selectedNodeNumber++;
                selectedTransferSize += requestTransferSize;
                selectedResourceSize += requestResourceSize;
            }
            const networkManager = SDK.NetworkManager.NetworkManager.forRequest(request);
            // TODO(allada) inspectedURL should be stored in PageLoad used instead of target so HAR requests can have an
            // inspected url.
            if (networkManager && request.url() === networkManager.target().inspectedURL() &&
                request.resourceType() === Common.ResourceType.resourceTypes.Document &&
                !networkManager.target().parentTarget()) {
                baseTime = request.startTime;
            }
            if (request.endTime > maxTime) {
                maxTime = request.endTime;
            }
        }
        if (!nodeCount) {
            this.showRecordingHint();
            return;
        }
        this.summaryToolbar.removeToolbarItems();
        const appendChunk = (chunk, title) => {
            const toolbarText = new UI.Toolbar.ToolbarText(chunk);
            toolbarText.setTitle(title ? title : chunk);
            this.summaryToolbar.appendToolbarItem(toolbarText);
            return toolbarText.element;
        };
        if (selectedNodeNumber !== nodeCount) {
            appendChunk(i18nString(UIStrings.sSRequests, { PH1: selectedNodeNumber, PH2: nodeCount }));
            this.summaryToolbar.appendSeparator();
            appendChunk(i18nString(UIStrings.sSTransferred, {
                PH1: Platform.NumberUtilities.bytesToString(selectedTransferSize),
                PH2: Platform.NumberUtilities.bytesToString(transferSize),
            }), i18nString(UIStrings.sBSBTransferredOverNetwork, { PH1: selectedTransferSize, PH2: transferSize }));
            this.summaryToolbar.appendSeparator();
            appendChunk(i18nString(UIStrings.sSResources, {
                PH1: Platform.NumberUtilities.bytesToString(selectedResourceSize),
                PH2: Platform.NumberUtilities.bytesToString(resourceSize),
            }), i18nString(UIStrings.sBSBResourcesLoadedByThePage, { PH1: selectedResourceSize, PH2: resourceSize }));
        }
        else {
            appendChunk(i18nString(UIStrings.sRequests, { PH1: nodeCount }));
            this.summaryToolbar.appendSeparator();
            appendChunk(i18nString(UIStrings.sTransferred, { PH1: Platform.NumberUtilities.bytesToString(transferSize) }), i18nString(UIStrings.sBTransferredOverNetwork, { PH1: transferSize }));
            this.summaryToolbar.appendSeparator();
            appendChunk(i18nString(UIStrings.sResources, { PH1: Platform.NumberUtilities.bytesToString(resourceSize) }), i18nString(UIStrings.sBResourcesLoadedByThePage, { PH1: resourceSize }));
        }
        if (baseTime !== -1 && maxTime !== -1) {
            this.summaryToolbar.appendSeparator();
            appendChunk(i18nString(UIStrings.finishS, { PH1: i18n.TimeUtilities.secondsToString(maxTime - baseTime) }));
            if (this.mainRequestDOMContentLoadedTime !== -1 && this.mainRequestDOMContentLoadedTime > baseTime) {
                this.summaryToolbar.appendSeparator();
                const domContentLoadedText = i18nString(UIStrings.domcontentloadedS, { PH1: i18n.TimeUtilities.secondsToString(this.mainRequestDOMContentLoadedTime - baseTime) });
                appendChunk(domContentLoadedText).style.color = NetworkLogView.getDCLEventColor();
            }
            if (this.mainRequestLoadTime !== -1) {
                this.summaryToolbar.appendSeparator();
                const loadText = i18nString(UIStrings.loadS, { PH1: i18n.TimeUtilities.secondsToString(this.mainRequestLoadTime - baseTime) });
                appendChunk(loadText).style.color = NetworkLogView.getLoadEventColor();
            }
        }
    }
    scheduleRefresh() {
        if (this.needsRefresh) {
            return;
        }
        this.needsRefresh = true;
        if (this.isShowing() && !this.refreshRequestId) {
            this.refreshRequestId = this.element.window().requestAnimationFrame(this.refresh.bind(this));
        }
    }
    addFilmStripFrames(times) {
        this.columns.addEventDividers(times, 'network-frame-divider');
    }
    selectFilmStripFrame(time) {
        this.columns.selectFilmStripFrame(time);
    }
    clearFilmStripFrame() {
        this.columns.clearFilmStripFrame();
    }
    refreshIfNeeded() {
        if (this.needsRefresh) {
            this.refresh();
        }
    }
    invalidateAllItems(deferUpdate) {
        this.staleRequests = new Set(Logs.NetworkLog.NetworkLog.instance().requests());
        if (deferUpdate) {
            this.scheduleRefresh();
        }
        else {
            this.refresh();
        }
    }
    timeCalculator() {
        return this.timeCalculatorInternal;
    }
    calculator() {
        return this.calculatorInternal;
    }
    setCalculator(x) {
        if (!x || this.calculatorInternal === x) {
            return;
        }
        if (this.calculatorInternal !== x) {
            this.calculatorInternal = x;
            this.columns.setCalculator(this.calculatorInternal);
        }
        this.calculatorInternal.reset();
        if (this.calculatorInternal.startAtZero) {
            this.columns.hideEventDividers();
        }
        else {
            this.columns.showEventDividers();
        }
        this.invalidateAllItems();
    }
    loadEventFired(event) {
        if (!this.recording) {
            return;
        }
        const time = event.data.loadTime;
        if (time) {
            this.mainRequestLoadTime = time;
            this.columns.addEventDividers([time], 'network-load-divider');
        }
    }
    domContentLoadedEventFired(event) {
        if (!this.recording) {
            return;
        }
        const { data } = event;
        if (data) {
            this.mainRequestDOMContentLoadedTime = data;
            this.columns.addEventDividers([data], 'network-dcl-divider');
        }
    }
    wasShown() {
        this.refreshIfNeeded();
        this.registerCSSFiles([networkLogViewStyles]);
        this.columns.wasShown();
    }
    willHide() {
        this.columns.willHide();
    }
    onResize() {
        this.rowHeightInternal = this.computeRowHeight();
    }
    flatNodesList() {
        const rootNode = this.dataGrid.rootNode();
        return rootNode.flatChildren();
    }
    onDataGridFocus() {
        if (this.dataGrid.element.matches(':focus-visible')) {
            this.element.classList.add('grid-focused');
        }
        this.updateNodeBackground();
    }
    onDataGridBlur() {
        this.element.classList.remove('grid-focused');
        this.updateNodeBackground();
    }
    updateNodeBackground() {
        if (this.dataGrid.selectedNode) {
            this.dataGrid.selectedNode.updateBackgroundColor();
        }
    }
    updateNodeSelectedClass(isSelected) {
        if (isSelected) {
            this.element.classList.remove('no-node-selected');
        }
        else {
            this.element.classList.add('no-node-selected');
        }
    }
    stylesChanged() {
        this.columns.scheduleRefresh();
    }
    refresh() {
        this.needsRefresh = false;
        if (this.refreshRequestId) {
            this.element.window().cancelAnimationFrame(this.refreshRequestId);
            this.refreshRequestId = null;
        }
        this.removeAllNodeHighlights();
        this.timeCalculatorInternal.updateBoundariesForEventTime(this.mainRequestLoadTime);
        this.durationCalculator.updateBoundariesForEventTime(this.mainRequestLoadTime);
        this.timeCalculatorInternal.updateBoundariesForEventTime(this.mainRequestDOMContentLoadedTime);
        this.durationCalculator.updateBoundariesForEventTime(this.mainRequestDOMContentLoadedTime);
        const nodesToInsert = new Map();
        const nodesToRefresh = [];
        const staleNodes = new Set();
        // While creating nodes it may add more entries into staleRequests because redirect request nodes update the parent
        // node so we loop until we have no more stale requests.
        while (this.staleRequests.size) {
            const request = this.staleRequests.values().next().value;
            this.staleRequests.delete(request);
            let node = networkRequestToNode.get(request);
            if (!node) {
                node = this.createNodeForRequest(request);
            }
            staleNodes.add(node);
        }
        for (const node of staleNodes) {
            const isFilteredOut = !this.applyFilter(node);
            if (isFilteredOut && node === this.hoveredNodeInternal) {
                this.setHoveredNode(null);
            }
            if (!isFilteredOut) {
                nodesToRefresh.push(node);
            }
            const request = node.request();
            this.timeCalculatorInternal.updateBoundaries(request);
            this.durationCalculator.updateBoundaries(request);
            const newParent = this.parentNodeForInsert(node);
            const wasAlreadyFiltered = filteredNetworkRequests.has(node);
            if (wasAlreadyFiltered === isFilteredOut && node.parent === newParent) {
                continue;
            }
            if (isFilteredOut) {
                filteredNetworkRequests.add(node);
            }
            else {
                filteredNetworkRequests.delete(node);
            }
            const removeFromParent = node.parent && (isFilteredOut || node.parent !== newParent);
            if (removeFromParent) {
                let parent = node.parent;
                if (!parent) {
                    continue;
                }
                parent.removeChild(node);
                while (parent && !parent.hasChildren() && parent.dataGrid && parent.dataGrid.rootNode() !== parent) {
                    const grandparent = parent.parent;
                    grandparent.removeChild(parent);
                    parent = grandparent;
                }
            }
            if (!newParent || isFilteredOut) {
                continue;
            }
            if (!newParent.dataGrid && !nodesToInsert.has(newParent)) {
                nodesToInsert.set(newParent, this.dataGrid.rootNode());
                nodesToRefresh.push(newParent);
            }
            nodesToInsert.set(node, newParent);
        }
        for (const node of nodesToInsert.keys()) {
            nodesToInsert.get(node).appendChild(node);
        }
        for (const node of nodesToRefresh) {
            node.refresh();
        }
        this.updateSummaryBar();
        if (nodesToInsert.size) {
            this.columns.sortByCurrentColumn();
        }
        this.dataGrid.updateInstantly();
        this.didRefreshForTest();
    }
    didRefreshForTest() {
    }
    parentNodeForInsert(node) {
        if (!this.activeGroupLookup) {
            return this.dataGrid.rootNode();
        }
        const groupNode = this.activeGroupLookup.groupNodeForRequest(node.request());
        if (!groupNode) {
            return this.dataGrid.rootNode();
        }
        return groupNode;
    }
    reset() {
        this.dispatchEventToListeners(Events.RequestActivated, { showPanel: false });
        this.setHoveredNode(null);
        this.columns.reset();
        this.timeFilter = null;
        this.calculatorInternal.reset();
        this.timeCalculatorInternal.setWindow(null);
        this.linkifierInternal.reset();
        if (this.activeGroupLookup) {
            this.activeGroupLookup.reset();
        }
        this.staleRequests.clear();
        this.resetSuggestionBuilder();
        this.mainRequestLoadTime = -1;
        this.mainRequestDOMContentLoadedTime = -1;
        this.dataGrid.rootNode().removeChildren();
        this.updateSummaryBar();
        this.dataGrid.setStickToBottom(true);
        this.scheduleRefresh();
    }
    setTextFilterValue(filterString) {
        this.textFilterUI.setValue(filterString);
        this.dataURLFilterUI.setChecked(false);
        this.onlyIssuesFilterUI.setChecked(false);
        this.onlyBlockedRequestsUI.setChecked(false);
        this.resourceCategoryFilterUI.reset();
    }
    createNodeForRequest(request) {
        const node = new NetworkRequestNode(this, request);
        networkRequestToNode.set(request, node);
        filteredNetworkRequests.add(node);
        for (let redirect = request.redirectSource(); redirect; redirect = redirect.redirectSource()) {
            this.refreshRequest(redirect);
        }
        return node;
    }
    onRequestUpdated(event) {
        const request = event.data;
        this.refreshRequest(request);
    }
    refreshRequest(request) {
        NetworkLogView.subdomains(request.domain)
            .forEach(this.suggestionBuilder.addItem.bind(this.suggestionBuilder, NetworkForward.UIFilter.FilterType.Domain));
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.Method, request.requestMethod);
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.MimeType, request.mimeType);
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.Scheme, String(request.scheme));
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.StatusCode, String(request.statusCode));
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.ResourceType, request.resourceType().name());
        this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.Url, request.securityOrigin());
        const priority = request.priority();
        if (priority) {
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.Priority, PerfUI.NetworkPriorities.uiLabelForNetworkPriority(priority));
        }
        if (request.mixedContentType !== "none" /* None */) {
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.MixedContent, NetworkForward.UIFilter.MixedContentFilterValues.All);
        }
        if (request.mixedContentType === "optionally-blockable" /* OptionallyBlockable */) {
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.MixedContent, NetworkForward.UIFilter.MixedContentFilterValues.Displayed);
        }
        if (request.mixedContentType === "blockable" /* Blockable */) {
            const suggestion = request.wasBlocked() ? NetworkForward.UIFilter.MixedContentFilterValues.Blocked :
                NetworkForward.UIFilter.MixedContentFilterValues.BlockOverridden;
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.MixedContent, suggestion);
        }
        const responseHeaders = request.responseHeaders;
        for (const responseHeader of responseHeaders) {
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.HasResponseHeader, responseHeader.name);
            if (responseHeader.name === 'Set-Cookie') {
                this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.ResponseHeaderValueSetCookie);
            }
        }
        for (const cookie of request.responseCookies) {
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.SetCookieDomain, cookie.domain());
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.SetCookieName, cookie.name());
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.SetCookieValue, cookie.value());
        }
        for (const cookie of request.allCookiesIncludingBlockedOnes()) {
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.CookieDomain, cookie.domain());
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.CookieName, cookie.name());
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.CookiePath, cookie.path());
            this.suggestionBuilder.addItem(NetworkForward.UIFilter.FilterType.CookieValue, cookie.value());
        }
        this.staleRequests.add(request);
        this.scheduleRefresh();
    }
    rowHeight() {
        return this.rowHeightInternal;
    }
    switchViewMode(gridMode) {
        this.columns.switchViewMode(gridMode);
    }
    handleContextMenuForRequest(contextMenu, request) {
        contextMenu.appendApplicableItems(request);
        let copyMenu = contextMenu.clipboardSection().appendSubMenuItem(i18nString(UIStrings.copy));
        const footerSection = copyMenu.footerSection();
        if (request) {
            copyMenu.defaultSection().appendItem(UI.UIUtils.copyLinkAddressLabel(), Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText.bind(Host.InspectorFrontendHost.InspectorFrontendHostInstance, request.contentURL()));
            if (request.requestHeadersText()) {
                copyMenu.defaultSection().appendItem(i18nString(UIStrings.copyRequestHeaders), NetworkLogView.copyRequestHeaders.bind(null, request));
            }
            if (request.responseHeadersText) {
                copyMenu.defaultSection().appendItem(i18nString(UIStrings.copyResponseHeaders), NetworkLogView.copyResponseHeaders.bind(null, request));
            }
            if (request.finished) {
                copyMenu.defaultSection().appendItem(i18nString(UIStrings.copyResponse), NetworkLogView.copyResponse.bind(null, request));
            }
            const initiator = request.initiator();
            if (initiator) {
                const stack = initiator.stack;
                if (stack) {
                    // We proactively compute the stacktrace text, as we can't determine whether the stacktrace
                    // has any context solely based on the top frame. Sometimes, the top frame does not have
                    // any callFrames, but its parent frames do.
                    const stackTraceText = computeStackTraceText(stack);
                    if (stackTraceText !== '') {
                        copyMenu.defaultSection().appendItem(i18nString(UIStrings.copyStacktrace), () => {
                            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(stackTraceText);
                        });
                    }
                }
            }
            const disableIfBlob = request.isBlobRequest();
            if (Host.Platform.isWin()) {
                footerSection.appendItem(i18nString(UIStrings.copyAsPowershell), this.copyPowerShellCommand.bind(this, request), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAsFetch), this.copyFetchCall.bind(this, request, 0 /* Browser */), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAsNodejsFetch), this.copyFetchCall.bind(this, request, 1 /* NodeJs */), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAsCurlCmd), this.copyCurlCommand.bind(this, request, 'win'), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAsCurlBash), this.copyCurlCommand.bind(this, request, 'unix'), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAllAsPowershell), this.copyAllPowerShellCommand.bind(this));
                footerSection.appendItem(i18nString(UIStrings.copyAllAsFetch), this.copyAllFetchCall.bind(this, 0 /* Browser */));
                footerSection.appendItem(i18nString(UIStrings.copyAllAsNodejsFetch), this.copyAllFetchCall.bind(this, 1 /* NodeJs */));
                footerSection.appendItem(i18nString(UIStrings.copyAllAsCurlCmd), this.copyAllCurlCommand.bind(this, 'win'));
                footerSection.appendItem(i18nString(UIStrings.copyAllAsCurlBash), this.copyAllCurlCommand.bind(this, 'unix'));
            }
            else {
                footerSection.appendItem(i18nString(UIStrings.copyAsPowershell), this.copyPowerShellCommand.bind(this, request), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAsFetch), this.copyFetchCall.bind(this, request, 0 /* Browser */), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAsNodejsFetch), this.copyFetchCall.bind(this, request, 1 /* NodeJs */), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAsCurl), this.copyCurlCommand.bind(this, request, 'unix'), disableIfBlob);
                footerSection.appendItem(i18nString(UIStrings.copyAllAsPowershell), this.copyAllPowerShellCommand.bind(this));
                footerSection.appendItem(i18nString(UIStrings.copyAllAsFetch), this.copyAllFetchCall.bind(this, 0 /* Browser */));
                footerSection.appendItem(i18nString(UIStrings.copyAllAsNodejsFetch), this.copyAllFetchCall.bind(this, 1 /* NodeJs */));
                footerSection.appendItem(i18nString(UIStrings.copyAllAsCurl), this.copyAllCurlCommand.bind(this, 'unix'));
            }
        }
        else {
            copyMenu = contextMenu.clipboardSection().appendSubMenuItem(i18nString(UIStrings.copy));
        }
        footerSection.appendItem(i18nString(UIStrings.copyAllAsHar), this.copyAll.bind(this));
        contextMenu.saveSection().appendItem(i18nString(UIStrings.saveAllAsHarWithContent), this.exportAll.bind(this));
        if (Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.HEADER_OVERRIDES)) {
            contextMenu.editSection().appendItem(i18nString(UIStrings.createResponseHeaderOverride), this.#handleCreateResponseHeaderOverrideClick.bind(this, request));
            contextMenu.editSection().appendSeparator();
        }
        contextMenu.editSection().appendItem(i18nString(UIStrings.clearBrowserCache), this.clearBrowserCache.bind(this));
        contextMenu.editSection().appendItem(i18nString(UIStrings.clearBrowserCookies), this.clearBrowserCookies.bind(this));
        if (request) {
            const maxBlockedURLLength = 20;
            const manager = SDK.NetworkManager.MultitargetNetworkManager.instance();
            let patterns = manager.blockedPatterns();
            function addBlockedURL(url) {
                patterns.push({ enabled: true, url: url });
                manager.setBlockedPatterns(patterns);
                manager.setBlockingEnabled(true);
                void UI.ViewManager.ViewManager.instance().showView('network.blocked-urls');
            }
            function removeBlockedURL(url) {
                patterns = patterns.filter(pattern => pattern.url !== url);
                manager.setBlockedPatterns(patterns);
                void UI.ViewManager.ViewManager.instance().showView('network.blocked-urls');
            }
            const urlWithoutScheme = request.parsedURL.urlWithoutScheme();
            if (urlWithoutScheme && !patterns.find(pattern => pattern.url === urlWithoutScheme)) {
                contextMenu.debugSection().appendItem(i18nString(UIStrings.blockRequestUrl), addBlockedURL.bind(null, urlWithoutScheme));
            }
            else if (urlWithoutScheme) {
                const croppedURL = Platform.StringUtilities.trimMiddle(urlWithoutScheme, maxBlockedURLLength);
                contextMenu.debugSection().appendItem(i18nString(UIStrings.unblockS, { PH1: croppedURL }), removeBlockedURL.bind(null, urlWithoutScheme));
            }
            const domain = request.parsedURL.domain();
            if (domain && !patterns.find(pattern => pattern.url === domain)) {
                contextMenu.debugSection().appendItem(i18nString(UIStrings.blockRequestDomain), addBlockedURL.bind(null, domain));
            }
            else if (domain) {
                const croppedDomain = Platform.StringUtilities.trimMiddle(domain, maxBlockedURLLength);
                contextMenu.debugSection().appendItem(i18nString(UIStrings.unblockS, { PH1: croppedDomain }), removeBlockedURL.bind(null, domain));
            }
            if (SDK.NetworkManager.NetworkManager.canReplayRequest(request)) {
                contextMenu.debugSection().appendItem(i18nString(UIStrings.replayXhr), SDK.NetworkManager.NetworkManager.replayRequest.bind(null, request));
            }
        }
    }
    harRequests() {
        return Logs.NetworkLog.NetworkLog.instance()
            .requests()
            .filter(NetworkLogView.getHTTPRequestsFilter)
            .filter(request => {
            return request.finished ||
                (request.resourceType() === Common.ResourceType.resourceTypes.WebSocket && request.responseReceivedTime);
        });
    }
    async copyAll() {
        const harArchive = { log: await HAR.Log.Log.build(this.harRequests()) };
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(JSON.stringify(harArchive, null, 2));
    }
    async copyCurlCommand(request, platform) {
        const command = await this.generateCurlCommand(request, platform);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(command);
    }
    async copyAllCurlCommand(platform) {
        const commands = await this.generateAllCurlCommand(Logs.NetworkLog.NetworkLog.instance().requests(), platform);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(commands);
    }
    async copyFetchCall(request, style) {
        const command = await this.generateFetchCall(request, style);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(command);
    }
    async copyAllFetchCall(style) {
        const commands = await this.generateAllFetchCall(Logs.NetworkLog.NetworkLog.instance().requests(), style);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(commands);
    }
    async copyPowerShellCommand(request) {
        const command = await this.generatePowerShellCommand(request);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(command);
    }
    async copyAllPowerShellCommand() {
        const commands = await this.generateAllPowerShellCommand(Logs.NetworkLog.NetworkLog.instance().requests());
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(commands);
    }
    async exportAll() {
        const mainTarget = SDK.TargetManager.TargetManager.instance().mainTarget();
        if (!mainTarget) {
            return;
        }
        const url = mainTarget.inspectedURL();
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(url);
        const filename = (parsedURL ? parsedURL.host : 'network-log');
        const stream = new Bindings.FileUtils.FileOutputStream();
        if (!await stream.open(Common.ParsedURL.ParsedURL.concatenate(filename, '.har'))) {
            return;
        }
        const progressIndicator = new UI.ProgressIndicator.ProgressIndicator();
        this.progressBarContainer.appendChild(progressIndicator.element);
        await HAR.Writer.Writer.write(stream, this.harRequests(), progressIndicator);
        progressIndicator.done();
        void stream.close();
    }
    async #handleCreateResponseHeaderOverrideClick(request) {
        if (Persistence.NetworkPersistenceManager.NetworkPersistenceManager.instance().project()) {
            await this.#revealHeaderOverrideEditor(request);
        }
        else { // If folder for local overrides has not been provided yet
            UI.InspectorView.InspectorView.instance().displaySelectOverrideFolderInfobar(async () => {
                await Sources.SourcesNavigator.OverridesNavigatorView.instance().setupNewWorkspace();
                await this.#revealHeaderOverrideEditor(request);
            });
        }
    }
    async #revealHeaderOverrideEditor(request) {
        const networkPersistanceManager = Persistence.NetworkPersistenceManager.NetworkPersistenceManager.instance();
        const uiSourceCode = await networkPersistanceManager.getOrCreateHeadersUISourceCodeFromUrl(request.url());
        if (uiSourceCode) {
            const sourcesPanel = Sources.SourcesPanel.SourcesPanel.instance();
            sourcesPanel.showUISourceCode(uiSourceCode);
            sourcesPanel.revealInNavigator(uiSourceCode);
        }
    }
    clearBrowserCache() {
        if (confirm(i18nString(UIStrings.areYouSureYouWantToClearBrowser))) {
            SDK.NetworkManager.MultitargetNetworkManager.instance().clearBrowserCache();
        }
    }
    clearBrowserCookies() {
        if (confirm(i18nString(UIStrings.areYouSureYouWantToClearBrowserCookies))) {
            SDK.NetworkManager.MultitargetNetworkManager.instance().clearBrowserCookies();
        }
    }
    removeAllHighlights() {
        this.removeAllNodeHighlights();
    }
    applyFilter(node) {
        const request = node.request();
        if (this.timeFilter && !this.timeFilter(request)) {
            return false;
        }
        const categoryName = request.resourceType().category().title();
        if (!this.resourceCategoryFilterUI.accept(categoryName)) {
            return false;
        }
        if (this.dataURLFilterUI.checked() && (request.parsedURL.isDataURL() || request.parsedURL.isBlobURL())) {
            return false;
        }
        if (this.onlyIssuesFilterUI.checked() &&
            !IssuesManager.RelatedIssue.hasIssueOfCategory(request, IssuesManager.Issue.IssueCategory.Cookie)) {
            return false;
        }
        if (this.onlyBlockedRequestsUI.checked() && !request.wasBlocked() && !request.corsErrorStatus()) {
            return false;
        }
        if (this.onlyThirdPartyFilterUI.checked() && request.isSameSite()) {
            return false;
        }
        for (let i = 0; i < this.filters.length; ++i) {
            if (!this.filters[i](request)) {
                return false;
            }
        }
        return true;
    }
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    parseFilterQuery(query, invert) {
        // A query string can have multiple filters, some of them regular
        // expressions, some not. Each one of those filters can be negated with a
        // "-" prefix, including the regular expressions. The top-level `invert`
        // checkbox therefore inverts each one of those individual filters.
        const descriptors = this.filterParser.parse(query);
        this.filters = descriptors.map(descriptor => {
            const key = descriptor.key;
            const text = descriptor.text || '';
            const regex = descriptor.regex;
            let filter;
            if (key) {
                const defaultText = Platform.StringUtilities.escapeForRegExp(key + ':' + text);
                filter = this.createSpecialFilter(key, text) ||
                    NetworkLogView.requestPathFilter.bind(null, new RegExp(defaultText, 'i'));
            }
            else if (descriptor.regex) {
                filter = NetworkLogView.requestPathFilter.bind(null, regex);
            }
            else if (this.isValidUrl(text)) {
                filter = NetworkLogView.requestUrlFilter.bind(null, text);
            }
            else {
                filter = NetworkLogView.requestPathFilter.bind(null, new RegExp(Platform.StringUtilities.escapeForRegExp(text), 'i'));
            }
            if ((descriptor.negative && !invert) || (!descriptor.negative && invert)) {
                return NetworkLogView.negativeFilter.bind(null, filter);
            }
            return filter;
        });
    }
    createSpecialFilter(type, value) {
        switch (type) {
            case NetworkForward.UIFilter.FilterType.Domain:
                return NetworkLogView.createRequestDomainFilter(value);
            case NetworkForward.UIFilter.FilterType.HasResponseHeader:
                return NetworkLogView.requestResponseHeaderFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.ResponseHeaderValueSetCookie:
                return NetworkLogView.requestResponseHeaderSetCookieFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.Is:
                if (value.toLowerCase() === NetworkForward.UIFilter.IsFilterType.Running) {
                    return NetworkLogView.runningRequestFilter;
                }
                if (value.toLowerCase() === NetworkForward.UIFilter.IsFilterType.FromCache) {
                    return NetworkLogView.fromCacheRequestFilter;
                }
                if (value.toLowerCase() === NetworkForward.UIFilter.IsFilterType.ServiceWorkerIntercepted) {
                    return NetworkLogView.interceptedByServiceWorkerFilter;
                }
                if (value.toLowerCase() === NetworkForward.UIFilter.IsFilterType.ServiceWorkerInitiated) {
                    return NetworkLogView.initiatedByServiceWorkerFilter;
                }
                break;
            case NetworkForward.UIFilter.FilterType.LargerThan:
                return this.createSizeFilter(value.toLowerCase());
            case NetworkForward.UIFilter.FilterType.Method:
                return NetworkLogView.requestMethodFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.MimeType:
                return NetworkLogView.requestMimeTypeFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.MixedContent:
                return NetworkLogView.requestMixedContentFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.Scheme:
                return NetworkLogView.requestSchemeFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.SetCookieDomain:
                return NetworkLogView.requestSetCookieDomainFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.SetCookieName:
                return NetworkLogView.requestSetCookieNameFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.SetCookieValue:
                return NetworkLogView.requestSetCookieValueFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.CookieDomain:
                return NetworkLogView.requestCookieDomainFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.CookieName:
                return NetworkLogView.requestCookieNameFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.CookiePath:
                return NetworkLogView.requestCookiePathFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.CookieValue:
                return NetworkLogView.requestCookieValueFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.Priority:
                return NetworkLogView.requestPriorityFilter.bind(null, PerfUI.NetworkPriorities.uiLabelToNetworkPriority(value));
            case NetworkForward.UIFilter.FilterType.StatusCode:
                return NetworkLogView.statusCodeFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.ResourceType:
                return NetworkLogView.resourceTypeFilter.bind(null, value);
            case NetworkForward.UIFilter.FilterType.Url:
                return NetworkLogView.requestUrlFilter.bind(null, value);
        }
        return null;
    }
    createSizeFilter(value) {
        let multiplier = 1;
        if (value.endsWith('k')) {
            multiplier = 1000;
            value = value.substring(0, value.length - 1);
        }
        else if (value.endsWith('m')) {
            multiplier = 1000 * 1000;
            value = value.substring(0, value.length - 1);
        }
        const quantity = Number(value);
        if (isNaN(quantity)) {
            return null;
        }
        return NetworkLogView.requestSizeLargerThanFilter.bind(null, quantity * multiplier);
    }
    filterRequests() {
        this.removeAllHighlights();
        this.invalidateAllItems();
    }
    reveal(request) {
        this.removeAllNodeHighlights();
        const node = networkRequestToNode.get(request);
        if (!node || !node.dataGrid) {
            return null;
        }
        // Viewport datagrid nodes do not reveal if not in the root node
        // list of flatChildren. For children of grouped frame nodes:
        // reveal and expand parent to ensure child is revealable.
        if (node.parent && node.parent instanceof NetworkGroupNode) {
            node.parent.reveal();
            node.parent.expand();
        }
        node.reveal();
        return node;
    }
    revealAndHighlightRequest(request) {
        const node = this.reveal(request);
        if (node) {
            this.highlightNode(node);
        }
    }
    revealAndHighlightRequestWithId(requestId) {
        const request = Logs.NetworkLog.NetworkLog.instance().requestByManagerAndId(requestId.manager, requestId.requestId);
        if (request) {
            this.revealAndHighlightRequest(request);
        }
    }
    selectRequest(request, options) {
        const defaultOptions = { clearFilter: true };
        const { clearFilter } = options || defaultOptions;
        if (clearFilter) {
            this.setTextFilterValue('');
        }
        const node = this.reveal(request);
        if (node) {
            node.select();
        }
    }
    removeAllNodeHighlights() {
        if (this.highlightedNode) {
            this.highlightedNode.element().classList.remove('highlighted-row');
            this.highlightedNode = null;
        }
    }
    highlightNode(node) {
        UI.UIUtils.runCSSAnimationOnce(node.element(), 'highlighted-row');
        this.highlightedNode = node;
    }
    filterOutBlobRequests(requests) {
        return requests.filter(request => !request.isBlobRequest());
    }
    async generateFetchCall(request, style) {
        const ignoredHeaders = new Set([
            // Internal headers
            'method',
            'path',
            'scheme',
            'version',
            // Unsafe headers
            // Keep this list synchronized with src/net/http/http_util.cc
            'accept-charset',
            'accept-encoding',
            'access-control-request-headers',
            'access-control-request-method',
            'connection',
            'content-length',
            'cookie',
            'cookie2',
            'date',
            'dnt',
            'expect',
            'host',
            'keep-alive',
            'origin',
            'referer',
            'te',
            'trailer',
            'transfer-encoding',
            'upgrade',
            'via',
            // TODO(phistuck) - remove this once crbug.com/571722 is fixed.
            'user-agent',
        ]);
        const credentialHeaders = new Set(['cookie', 'authorization']);
        const url = JSON.stringify(request.url());
        const requestHeaders = request.requestHeaders();
        const headerData = requestHeaders.reduce((result, header) => {
            const name = header.name;
            if (!ignoredHeaders.has(name.toLowerCase()) && !name.includes(':')) {
                result.append(name, header.value);
            }
            return result;
        }, new Headers());
        const headers = {};
        for (const headerArray of headerData) {
            headers[headerArray[0]] = headerArray[1];
        }
        const credentials = request.includedRequestCookies().length ||
            requestHeaders.some(({ name }) => credentialHeaders.has(name.toLowerCase())) ?
            'include' :
            'omit';
        const referrerHeader = requestHeaders.find(({ name }) => name.toLowerCase() === 'referer');
        const referrer = referrerHeader ? referrerHeader.value : void 0;
        const referrerPolicy = request.referrerPolicy() || void 0;
        const requestBody = await request.requestFormData();
        const fetchOptions = {
            headers: Object.keys(headers).length ? headers : void 0,
            referrer,
            referrerPolicy,
            body: requestBody,
            method: request.requestMethod,
            mode: 'cors',
        };
        if (style === 1 /* NodeJs */) {
            const cookieHeader = requestHeaders.find(header => header.name.toLowerCase() === 'cookie');
            const extraHeaders = {};
            // According to https://www.npmjs.com/package/node-fetch#class-request the
            // following properties are not implemented in Node.js.
            delete fetchOptions.mode;
            if (cookieHeader) {
                extraHeaders['cookie'] = cookieHeader.value;
            }
            if (referrer) {
                delete fetchOptions.referrer;
                extraHeaders['Referer'] = referrer;
            }
            if (referrer) {
                delete fetchOptions.referrerPolicy;
                extraHeaders['Referrer-Policy'] = referrerPolicy;
            }
            if (Object.keys(extraHeaders).length) {
                fetchOptions.headers = {
                    ...headers,
                    ...extraHeaders,
                };
            }
        }
        else {
            fetchOptions.credentials = credentials;
        }
        const options = JSON.stringify(fetchOptions, null, 2);
        return `fetch(${url}, ${options});`;
    }
    async generateAllFetchCall(requests, style) {
        const nonBlobRequests = this.filterOutBlobRequests(requests);
        const commands = await Promise.all(nonBlobRequests.map(request => this.generateFetchCall(request, style)));
        return commands.join(' ;\n');
    }
    async generateCurlCommand(request, platform) {
        let command = [];
        // Most of these headers are derived from the URL and are automatically added by cURL.
        // The |Accept-Encoding| header is ignored to prevent decompression errors. crbug.com/1015321
        const ignoredHeaders = new Set(['accept-encoding', 'host', 'method', 'path', 'scheme', 'version']);
        function escapeStringWin(str) {
            /* If there are no new line characters do not escape the " characters
               since it only uglifies the command.
      
               Because cmd.exe parser and MS Crt arguments parsers use some of the
               same escape characters, they can interact with each other in
               horrible ways, the order of operations is critical.
      
               Replace \ with \\ first because it is an escape character for certain
               conditions in both parsers.
      
               Replace all " with \" to ensure the first parser does not remove it.
      
               Then escape all characters we are not sure about with ^ to ensure it
               gets to MS Crt parser safely.
      
               The % character is special because MS Crt parser will try and look for
               ENV variables and fill them in it's place. We cannot escape them with %
               and cannot escape them with ^ (because it's cmd.exe's escape not MS Crt
               parser); So we can get cmd.exe parser to escape the character after it,
               if it is followed by a valid beginning character of an ENV variable.
               This ensures we do not try and double escape another ^ if it was placed
               by the previous replace.
      
               Lastly we replace new lines with ^ and TWO new lines because the first
               new line is there to enact the escape command the second is the character
               to escape (in this case new line).
              */
            const encapsChars = /[\r\n]/.test(str) ? '^"' : '"';
            return encapsChars +
                str.replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/[^a-zA-Z0-9\s_\-:=+~'\/.',?;()*`&]/g, '^$&')
                    .replace(/%(?=[a-zA-Z0-9_])/g, '%^')
                    .replace(/\r?\n/g, '^\n\n') +
                encapsChars;
        }
        function escapeStringPosix(str) {
            function escapeCharacter(x) {
                const code = x.charCodeAt(0);
                let hexString = code.toString(16);
                // Zero pad to four digits to comply with ANSI-C Quoting:
                // http://www.gnu.org/software/bash/manual/html_node/ANSI_002dC-Quoting.html
                while (hexString.length < 4) {
                    hexString = '0' + hexString;
                }
                return '\\u' + hexString;
            }
            if (/[\0-\x1F\x7F-\x9F!]|\'/.test(str)) {
                // Use ANSI-C quoting syntax.
                return '$\'' +
                    str.replace(/\\/g, '\\\\')
                        .replace(/\'/g, '\\\'')
                        .replace(/\n/g, '\\n')
                        .replace(/\r/g, '\\r')
                        .replace(/[\0-\x1F\x7F-\x9F!]/g, escapeCharacter) +
                    '\'';
            }
            // Use single quote syntax.
            return '\'' + str + '\'';
        }
        // cURL command expected to run on the same platform that DevTools run
        // (it may be different from the inspected page platform).
        const escapeString = platform === 'win' ? escapeStringWin : escapeStringPosix;
        command.push(escapeString(request.url()).replace(/[[{}\]]/g, '\\$&'));
        let inferredMethod = 'GET';
        const data = [];
        const formData = await request.requestFormData();
        if (formData) {
            // Note that formData is not necessarily urlencoded because it might for example
            // come from a fetch request made with an explicitly unencoded body.
            data.push('--data-raw ' + escapeString(formData));
            ignoredHeaders.add('content-length');
            inferredMethod = 'POST';
        }
        if (request.requestMethod !== inferredMethod) {
            command.push('-X ' + escapeString(request.requestMethod));
        }
        const requestHeaders = request.requestHeaders();
        for (let i = 0; i < requestHeaders.length; i++) {
            const header = requestHeaders[i];
            const name = header.name.replace(/^:/, ''); // Translate SPDY v3 headers to HTTP headers.
            if (ignoredHeaders.has(name.toLowerCase())) {
                continue;
            }
            command.push('-H ' + escapeString(name + ': ' + header.value));
        }
        command = command.concat(data);
        command.push('--compressed');
        if (request.securityState() === "insecure" /* Insecure */) {
            command.push('--insecure');
        }
        return 'curl ' + command.join(command.length >= 3 ? (platform === 'win' ? ' ^\n  ' : ' \\\n  ') : ' ');
    }
    async generateAllCurlCommand(requests, platform) {
        const nonBlobRequests = this.filterOutBlobRequests(requests);
        const commands = await Promise.all(nonBlobRequests.map(request => this.generateCurlCommand(request, platform)));
        if (platform === 'win') {
            return commands.join(' &\r\n');
        }
        return commands.join(' ;\n');
    }
    async generatePowerShellCommand(request) {
        const command = [];
        const ignoredHeaders = new Set([
            'host',
            'connection',
            'proxy-connection',
            'content-length',
            'expect',
            'range',
            'content-type',
            'user-agent',
            'cookie',
        ]);
        function escapeString(str) {
            return '"' +
                str.replace(/[`\$"]/g, '`$&').replace(/[^\x20-\x7E]/g, char => '$([char]' + char.charCodeAt(0) + ')') + '"';
        }
        // Generate a WebRequestSession object with the UserAgent and Cookie header values.
        // This is used to pass the user-agent and cookie headers to Invoke-WebRequest because the Invoke-WebRequest
        // command does not allow setting these headers through the -Headers parameter. See docs at:
        // https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/invoke-webrequest?view=powershell-7.1#parameters
        function generatePowerShellSession(request) {
            const requestHeaders = request.requestHeaders();
            const props = [];
            const userAgentHeader = requestHeaders.find(({ name }) => name.toLowerCase() === 'user-agent');
            if (userAgentHeader) {
                props.push(`$session.UserAgent = ${escapeString(userAgentHeader.value)}`);
            }
            for (const cookie of request.includedRequestCookies()) {
                const name = escapeString(cookie.name());
                const value = escapeString(cookie.value());
                const domain = escapeString(cookie.domain());
                props.push(`$session.Cookies.Add((New-Object System.Net.Cookie(${name}, ${value}, "/", ${domain})))`);
            }
            if (props.length) {
                return '$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession\n' + props.join('\n') + '\n';
            }
            return null;
        }
        command.push('-Uri ' + escapeString(request.url()));
        if (request.requestMethod !== 'GET') {
            command.push('-Method ' + escapeString(request.requestMethod));
        }
        const session = generatePowerShellSession(request);
        if (session) {
            command.push('-WebSession $session');
        }
        const requestHeaders = request.requestHeaders();
        const headerNameValuePairs = [];
        for (const header of requestHeaders) {
            const name = header.name.replace(/^:/, ''); // Translate h2 headers to HTTP headers.
            if (ignoredHeaders.has(name.toLowerCase())) {
                continue;
            }
            headerNameValuePairs.push(escapeString(name) + '=' + escapeString(header.value));
        }
        if (headerNameValuePairs.length) {
            command.push('-Headers @{\n' + headerNameValuePairs.join('\n  ') + '\n}');
        }
        const contentTypeHeader = requestHeaders.find(({ name }) => name.toLowerCase() === 'content-type');
        if (contentTypeHeader) {
            command.push('-ContentType ' + escapeString(contentTypeHeader.value));
        }
        const formData = await request.requestFormData();
        if (formData) {
            const body = escapeString(formData);
            if (/[^\x20-\x7E]/.test(formData)) {
                command.push('-Body ([System.Text.Encoding]::UTF8.GetBytes(' + body + '))');
            }
            else {
                command.push('-Body ' + body);
            }
        }
        // The -UseBasicParsing parameter prevents Invoke-WebRequest from using the IE engine for parsing. Basic
        // parsing is the default behavior in PowerShell 6.0.0+ and the parameter is included here for backwards
        // compatibility only.
        const prelude = session || '';
        return prelude + 'Invoke-WebRequest -UseBasicParsing ' + command.join(command.length >= 3 ? ' `\n' : ' ');
    }
    async generateAllPowerShellCommand(requests) {
        const nonBlobRequests = this.filterOutBlobRequests(requests);
        const commands = await Promise.all(nonBlobRequests.map(request => this.generatePowerShellCommand(request)));
        return commands.join(';\r\n');
    }
    static getDCLEventColor() {
        return ThemeSupport.ThemeSupport.instance().getComputedValue('--color-syntax-3');
    }
    static getLoadEventColor() {
        return ThemeSupport.ThemeSupport.instance().getComputedValue('--color-syntax-1');
    }
}
export function computeStackTraceText(stackTrace) {
    let stackTraceText = '';
    for (const frame of stackTrace.callFrames) {
        const functionName = UI.UIUtils.beautifyFunctionName(frame.functionName);
        stackTraceText += `${functionName} @ ${frame.url}:${frame.lineNumber + 1}\n`;
    }
    if (stackTrace.parent) {
        stackTraceText += computeStackTraceText(stackTrace.parent);
    }
    return stackTraceText;
}
const filteredNetworkRequests = new WeakSet();
const networkRequestToNode = new WeakMap();
export function isRequestFilteredOut(request) {
    return filteredNetworkRequests.has(request);
}
export const HTTPSchemas = {
    'http': true,
    'https': true,
    'ws': true,
    'wss': true,
};
const searchKeys = Object.values(NetworkForward.UIFilter.FilterType);
//# sourceMappingURL=NetworkLogView.js.map