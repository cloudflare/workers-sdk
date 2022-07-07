// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
const UIStrings = {
    /**
      *@description  Description text for Prerender2 status Activated.
      */
    Activated: 'Activated.',
    /**
      *@description  Description text for Prerender2 cancellation status Destroyed.
      */
    Destroyed: 'A prerendered page was abandoned for unknown reasons.',
    /**
      *@description  Description text for Prerender2 cancellation status LowEndDevice.
      */
    LowEndDevice: 'Prerendering is not supported for low-memory devices.',
    /**
      *@description  Description text for Prerender2 cancellation status CrossOriginRedirect.
      */
    CrossOriginRedirect: 'Attempted to prerender a URL which redirected to a cross-origin URL. Currently prerendering cross-origin pages is disallowed.',
    /**
      *@description  Description text for Prerender2 cancellation status CrossOriginNavigation.
      */
    CrossOriginNavigation: 'The prerendered page navigated to a cross-origin URL after loading. Currently prerendering cross-origin pages is disallowed.',
    /**
      *@description  Description text for Prerender2 cancellation status InvalidSchemeRedirect.
      */
    InvalidSchemeRedirect: 'Attempted to prerender a URL that redirected to a non-HTTP(S) URL. Only HTTP(S) pages can be prerendered.',
    /**
      *@description  Description text for Prerender2 cancellation status InvalidSchemeNavigation.
      */
    InvalidSchemeNavigation: 'Only HTTP(S) navigation allowed for Prerender.',
    /**
      *@description  Description text for Prerender2 cancellation status InProgressNavigation.
      */
    InProgressNavigation: 'InProgressNavigation.',
    /**
      *@description  Description text for Prerender2 cancellation status NavigationRequestBlockedByCsp.
      */
    NavigationRequestBlockedByCsp: 'Navigation request is blocked by CSP.',
    /**
      *@description  Description text for Prerender2 cancellation status MainFrameNavigation.
      */
    MainFrameNavigation: 'Navigations after the initial prerendering navigation are disallowed',
    /**
      *@description  Description text for Prerender2 cancellation status MojoBinderPolicy.
      */
    MojoBinderPolicy: 'A disallowed API was used by the prerendered page',
    /**
      *@description  Description text for Prerender2 cancellation status RendererProcessCrashed.
      */
    RendererProcessCrashed: 'The prerendered page crashed.',
    /**
      *@description  Description text for Prerender2 cancellation status RendererProcessKilled.
      */
    RendererProcessKilled: 'The renderer process for the prerendering page was killed.',
    /**
      *@description  Description text for Prerender2 cancellation status Download.
      */
    Download: 'Download is disallowed in Prerender.',
    /**
      *@description  Description text for Prerender2 cancellation status TriggerDestroyed.
      */
    TriggerDestroyed: 'Prerender is not activated and destroyed with the trigger.',
    /**
      *@description  Description text for Prerender2 cancellation status NavigationNotCommitted.
      */
    NavigationNotCommitted: 'The prerendering page is not committed in the end.',
    /**
      *@description  Description text for Prerender2 cancellation status NavigationBadHttpStatus.
      */
    NavigationBadHttpStatus: 'The initial prerendering navigation was not successful due to the server returning a non-200/204/205 status code.',
    /**
      *@description  Description text for Prerender2 cancellation status ClientCertRequested.
      */
    ClientCertRequested: 'The page is requesting client cert, which is not suitable for a hidden page like prerendering.',
    /**
      *@description  Description text for Prerender2 cancellation status NavigationRequestNetworkError.
      */
    NavigationRequestNetworkError: 'Encountered a network error during prerendering.',
    /**
      *@description  Description text for Prerender2 cancellation status MaxNumOfRunningPrerendersExceeded.
      */
    MaxNumOfRunningPrerendersExceeded: 'Max number of prerendering exceeded.',
    /**
      *@description  Description text for Prerender2 cancellation status CancelAllHostsForTesting.
      */
    CancelAllHostsForTesting: 'CancelAllHostsForTesting.',
    /**
      *@description  Description text for Prerender2 cancellation status DidFailLoad.
      */
    DidFailLoad: 'DidFailLoadWithError happened during prerendering.',
    /**
      *@description  Description text for Prerender2 cancellation status Stop.
      */
    Stop: 'The tab is stopped.',
    /**
      *@description  Description text for Prerender2 cancellation status SslCertificateError.
      */
    SslCertificateError: 'SSL certificate error.',
    /**
      *@description  Description text for Prerender2 cancellation status LoginAuthRequested.
      */
    LoginAuthRequested: 'Prerender does not support auth requests from UI.',
    /**
      *@description  Description text for Prerender2 cancellation status UaChangeRequiresReload.
      */
    UaChangeRequiresReload: 'Reload is needed after UserAgentOverride.',
    /**
      *@description  Description text for Prerender2 cancellation status BlockedByClient.
      */
    BlockedByClient: 'Resource load is blocked by the client.',
    /**
      *@description  Description text for Prerender2 cancellation status AudioOutputDeviceRequested.
      */
    AudioOutputDeviceRequested: 'Prerendering has not supported the AudioContext API yet.',
    /**
      *@description  Description text for Prerender2 cancellation status MixedContent.
      */
    MixedContent: 'Prerendering is canceled by a mixed content frame.',
    /**
      *@description  Description text for Prerender2 cancellation status TriggerBackgrounded.
      */
    TriggerBackgrounded: 'The tab is in the background',
    /**
      *@description  Description text for Prerender2 cancellation status EmbedderTriggeredAndSameOriginRedirected.
      */
    EmbedderTriggeredAndSameOriginRedirected: 'Prerendering triggered by Chrome internal (e.g., Omnibox prerendering) is canceled because the navigation is redirected to another same-origin page.',
    /**
      *@description  Description text for Prerender2 cancellation status EmbedderTriggeredAndCrossOriginRedirected.
      */
    EmbedderTriggeredAndCrossOriginRedirected: 'Prerendering triggered by Chrome internal (e.g., Omnibox prerendering) is is canceled because the navigation is redirected to another cross-origin page.',
    /**
      *@description  Description text for Prerender2 cancellation status EmbedderTriggeredAndDestroyed.
      */
    EmbedderTriggeredAndDestroyed: 'Prerendering triggered by Chrome internal (e.g., Omnibox prerendering) is is destroyed in the destructor.',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/components/Prerender2.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export const Prerender2ReasonDescription = {
    'Activated': { name: i18nLazyString(UIStrings.Activated) },
    'Destroyed': { name: i18nLazyString(UIStrings.Destroyed) },
    'LowEndDevice': { name: i18nLazyString(UIStrings.LowEndDevice) },
    'CrossOriginRedirect': { name: i18nLazyString(UIStrings.CrossOriginRedirect) },
    'CrossOriginNavigation': { name: i18nLazyString(UIStrings.CrossOriginNavigation) },
    'InvalidSchemeRedirect': { name: i18nLazyString(UIStrings.InvalidSchemeRedirect) },
    'InvalidSchemeNavigation': { name: i18nLazyString(UIStrings.InvalidSchemeNavigation) },
    'InProgressNavigation': { name: i18nLazyString(UIStrings.InProgressNavigation) },
    'NavigationRequestBlockedByCsp': { name: i18nLazyString(UIStrings.NavigationRequestBlockedByCsp) },
    'MainFrameNavigation': { name: i18nLazyString(UIStrings.MainFrameNavigation) },
    'MojoBinderPolicy': { name: i18nLazyString(UIStrings.MojoBinderPolicy) },
    'RendererProcessCrashed': { name: i18nLazyString(UIStrings.RendererProcessCrashed) },
    'RendererProcessKilled': { name: i18nLazyString(UIStrings.RendererProcessKilled) },
    'Download': { name: i18nLazyString(UIStrings.Download) },
    'TriggerDestroyed': { name: i18nLazyString(UIStrings.TriggerDestroyed) },
    'NavigationNotCommitted': { name: i18nLazyString(UIStrings.NavigationNotCommitted) },
    'NavigationBadHttpStatus': { name: i18nLazyString(UIStrings.NavigationBadHttpStatus) },
    'ClientCertRequested': { name: i18nLazyString(UIStrings.ClientCertRequested) },
    'NavigationRequestNetworkError': { name: i18nLazyString(UIStrings.NavigationRequestNetworkError) },
    'MaxNumOfRunningPrerendersExceeded': { name: i18nLazyString(UIStrings.MaxNumOfRunningPrerendersExceeded) },
    'CancelAllHostsForTesting': { name: i18nLazyString(UIStrings.CancelAllHostsForTesting) },
    'DidFailLoad': { name: i18nLazyString(UIStrings.DidFailLoad) },
    'Stop': { name: i18nLazyString(UIStrings.Stop) },
    'SslCertificateError': { name: i18nLazyString(UIStrings.SslCertificateError) },
    'LoginAuthRequested': { name: i18nLazyString(UIStrings.LoginAuthRequested) },
    'UaChangeRequiresReload': { name: i18nLazyString(UIStrings.UaChangeRequiresReload) },
    'BlockedByClient': { name: i18nLazyString(UIStrings.BlockedByClient) },
    'AudioOutputDeviceRequested': { name: i18nLazyString(UIStrings.AudioOutputDeviceRequested) },
    'MixedContent': { name: i18nLazyString(UIStrings.MixedContent) },
    'TriggerBackgrounded': { name: i18nLazyString(UIStrings.TriggerBackgrounded) },
    'EmbedderTriggeredAndSameOriginRedirected': { name: i18nLazyString(UIStrings.EmbedderTriggeredAndSameOriginRedirected) },
    'EmbedderTriggeredAndCrossOriginRedirected': { name: i18nLazyString(UIStrings.EmbedderTriggeredAndCrossOriginRedirected) },
    'EmbedderTriggeredAndDestroyed': { name: i18nLazyString(UIStrings.EmbedderTriggeredAndDestroyed) },
};
//# sourceMappingURL=Prerender2.js.map