// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Root from '../../core/root/root.js';
import * as Puppeteer from '../../services/puppeteer/puppeteer.js';
function disableLoggingForTest() {
    console.log = () => undefined; // eslint-disable-line no-console
}
/**
 * LegacyPort is provided to Lighthouse as the CDP connection in legacyNavigation mode.
 * Its complement is https://github.com/GoogleChrome/lighthouse/blob/v9.3.1/lighthouse-core/gather/connections/raw.js
 * It speaks pure CDP via notifyFrontendViaWorkerMessage
 *
 * Any message that comes back from Lighthouse has to go via a so-called "port".
 * This class holds the relevant callbacks that Lighthouse provides and that
 * can be called in the onmessage callback of the worker, so that the frontend
 * can communicate to Lighthouse. Lighthouse itself communicates to the frontend
 * via status updates defined below.
 */
class LegacyPort {
    onMessage;
    onClose;
    on(eventName, callback) {
        if (eventName === 'message') {
            this.onMessage = callback;
        }
        else if (eventName === 'close') {
            this.onClose = callback;
        }
    }
    send(message) {
        notifyFrontendViaWorkerMessage('sendProtocolMessage', { message });
    }
    close() {
    }
}
/**
 * ConnectionProxy is a SDK interface, but the implementation has no knowledge it's a parallelConnection.
 * The CDP traffic is smuggled back and forth by the system described in LighthouseProtocolService
*/
class ConnectionProxy {
    sessionId;
    onMessage;
    onDisconnect;
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.onMessage = null;
        this.onDisconnect = null;
    }
    setOnMessage(onMessage) {
        this.onMessage = onMessage;
    }
    setOnDisconnect(onDisconnect) {
        this.onDisconnect = onDisconnect;
    }
    getOnDisconnect() {
        return this.onDisconnect;
    }
    getSessionId() {
        return this.sessionId;
    }
    sendRawMessage(message) {
        notifyFrontendViaWorkerMessage('sendProtocolMessage', { message });
    }
    async disconnect() {
        this.onDisconnect?.('force disconnect');
        this.onDisconnect = null;
        this.onMessage = null;
    }
}
const legacyPort = new LegacyPort();
let cdpConnection;
let endTimespan;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invokeLH(action, args) {
    if (Root.Runtime.Runtime.queryParam('isUnderTest')) {
        disableLoggingForTest();
        args.flags.maxWaitForLoad = 2 * 1000;
    }
    // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
    self.listenForStatus(message => {
        notifyFrontendViaWorkerMessage('statusUpdate', { message: message[1] });
    });
    let puppeteerConnection;
    try {
        // For timespan we only need to perform setup on startTimespan.
        // Config, flags, locale, etc. should be stored in the closure of endTimespan.
        if (action === 'endTimespan') {
            if (!endTimespan) {
                throw new Error('Cannot end a timespan before starting one');
            }
            const result = await endTimespan();
            endTimespan = undefined;
            return result;
        }
        const locale = await fetchLocaleData(args.locales);
        const flags = args.flags;
        flags.logLevel = flags.logLevel || 'info';
        flags.channel = 'devtools';
        flags.locale = locale;
        // TODO: Remove this filter once pubads is mode restricted
        // https://github.com/googleads/publisher-ads-lighthouse-plugin/pull/339
        if (action === 'startTimespan' || action === 'snapshot') {
            args.categoryIDs = args.categoryIDs.filter((c) => c !== 'lighthouse-plugin-publisher-ads');
        }
        // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
        const config = self.createConfig(args.categoryIDs, flags.emulatedFormFactor);
        const url = args.url;
        // Handle legacy Lighthouse runner path.
        if (action === 'navigation' && flags.legacyNavigation) {
            // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
            const connection = self.setUpWorkerConnection(legacyPort);
            // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
            return await self.runLighthouse(url, flags, config, connection);
        }
        const { mainTargetId, mainFrameId, mainSessionId } = args.target;
        cdpConnection = new ConnectionProxy(mainSessionId);
        puppeteerConnection =
            await Puppeteer.PuppeteerConnection.getPuppeteerConnection(cdpConnection, mainFrameId, mainTargetId);
        const { page } = puppeteerConnection;
        const configContext = {
            logLevel: flags.logLevel,
            settingsOverrides: flags,
        };
        if (action === 'snapshot') {
            // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
            return await self.runLighthouseSnapshot({ config, page, configContext });
        }
        if (action === 'startTimespan') {
            // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
            const timespan = await self.startLighthouseTimespan({ config, page, configContext });
            endTimespan = timespan.endTimespan;
            return;
        }
        // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
        return await self.runLighthouseNavigation(url, { config, page, configContext });
    }
    catch (err) {
        return ({
            fatal: true,
            message: err.message,
            stack: err.stack,
        });
    }
    finally {
        // endTimespan will need to use the same connection as startTimespan.
        if (action !== 'startTimespan') {
            puppeteerConnection?.browser.disconnect();
        }
    }
}
/**
 * Finds a locale supported by Lighthouse from the user's system locales.
 * If no matching locale is found, or if fetching locale data fails, this function returns nothing
 * and Lighthouse will use `en-US` by default.
 */
async function fetchLocaleData(locales) {
    // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
    const locale = self.lookupLocale(locales);
    // If the locale is en-US, no need to fetch locale data.
    if (locale === 'en-US' || locale === 'en') {
        return;
    }
    // Try to load the locale data.
    try {
        const remoteBase = Root.Runtime.getRemoteBase();
        let localeUrl;
        if (remoteBase && remoteBase.base) {
            localeUrl = `${remoteBase.base}third_party/lighthouse/locales/${locale}.json`;
        }
        else {
            localeUrl = new URL(`../../third_party/lighthouse/locales/${locale}.json`, import.meta.url).toString();
        }
        const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(new Error('timed out fetching locale')), 5000));
        const localeData = await Promise.race([timeoutPromise, fetch(localeUrl).then(result => result.json())]);
        // @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
        self.registerLocaleData(locale, localeData);
        return locale;
    }
    catch (err) {
        console.error(err);
    }
    return;
}
/**
 * `notifyFrontendViaWorkerMessage` and `onFrontendMessage` work with the FE's ProtocolService.
 *
 * onFrontendMessage takes action-wrapped messages and either invoking lighthouse or delivering it CDP traffic.
 * notifyFrontendViaWorkerMessage posts action-wrapped messages to the FE.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function notifyFrontendViaWorkerMessage(action, args) {
    self.postMessage(JSON.stringify({ action, args }));
}
async function onFrontendMessage(event) {
    const messageFromFrontend = JSON.parse(event.data);
    switch (messageFromFrontend.action) {
        case 'startTimespan':
        case 'endTimespan':
        case 'snapshot':
        case 'navigation': {
            const result = await invokeLH(messageFromFrontend.action, messageFromFrontend.args);
            self.postMessage(JSON.stringify({ id: messageFromFrontend.id, result }));
            break;
        }
        case 'dispatchProtocolMessage': {
            cdpConnection?.onMessage?.(JSON.parse(messageFromFrontend.args.message));
            legacyPort.onMessage?.(messageFromFrontend.args.message);
            break;
        }
        default: {
            throw new Error(`Unknown event: ${event.data}`);
        }
    }
}
self.onmessage = onFrontendMessage;
// Make lighthouse and traceviewer happy.
// @ts-ignore https://github.com/GoogleChrome/lighthouse/issues/11628
globalThis.global = self;
// @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
globalThis.global.isVinn = true;
// @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
globalThis.global.document = {};
// @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
globalThis.global.document.documentElement = {};
// @ts-expect-error https://github.com/GoogleChrome/lighthouse/issues/11628
globalThis.global.document.documentElement.style = {
    WebkitAppearance: 'WebkitAppearance',
};
//# sourceMappingURL=LighthouseWorkerService.js.map