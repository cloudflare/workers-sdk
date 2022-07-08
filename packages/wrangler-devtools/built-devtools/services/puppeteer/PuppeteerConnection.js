// Copyright (c) 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as puppeteer from '../../third_party/puppeteer/puppeteer.js';
export class Transport {
    #connection;
    #knownIds = new Set();
    constructor(connection) {
        this.#connection = connection;
    }
    send(message) {
        const data = JSON.parse(message);
        this.#knownIds.add(data.id);
        this.#connection.sendRawMessage(JSON.stringify(data));
    }
    close() {
        void this.#connection.disconnect();
    }
    set onmessage(cb) {
        this.#connection.setOnMessage((message) => {
            if (!cb) {
                return;
            }
            const data = (message);
            if (data.id && !this.#knownIds.has(data.id)) {
                return;
            }
            this.#knownIds.delete(data.id);
            if (!data.sessionId) {
                return;
            }
            return cb(JSON.stringify({
                ...data,
                // Puppeteer is expecting to use the default session, but we give it a non-default session in #connection.
                // Replace that sessionId with undefined so Puppeteer treats it as default.
                sessionId: data.sessionId === this.#connection.getSessionId() ? undefined : data.sessionId,
            }));
        });
    }
    set onclose(cb) {
        const prev = this.#connection.getOnDisconnect();
        this.#connection.setOnDisconnect(reason => {
            if (prev) {
                prev(reason);
            }
            if (cb) {
                cb();
            }
        });
    }
}
export class PuppeteerConnection extends puppeteer.Connection {
    async onMessage(message) {
        const msgObj = JSON.parse(message);
        if (msgObj.sessionId && !this._sessions.has(msgObj.sessionId)) {
            return;
        }
        void super.onMessage(message);
    }
}
export async function getPuppeteerConnection(rawConnection, mainFrameId, mainTargetId) {
    const transport = new Transport(rawConnection);
    // url is an empty string in this case parallel to:
    // https://github.com/puppeteer/puppeteer/blob/f63a123ecef86693e6457b07437a96f108f3e3c5/src/common/BrowserConnector.ts#L72
    const connection = new PuppeteerConnection('', transport);
    const targetFilterCallback = (targetInfo) => {
        if (targetInfo.type !== 'page' && targetInfo.type !== 'iframe') {
            return false;
        }
        // TODO only connect to iframes that are related to the main target. This requires refactoring in Puppeteer: https://github.com/puppeteer/puppeteer/issues/3667.
        return targetInfo.targetId === mainTargetId || targetInfo.openerId === mainTargetId || targetInfo.type === 'iframe';
    };
    const browser = await puppeteer.Browser._create(connection, [] /* contextIds */, false /* ignoreHTTPSErrors */, undefined /* defaultViewport */, undefined /* process */, undefined /* closeCallback */, targetFilterCallback);
    const pages = await browser.pages();
    const page = pages.find(p => p.mainFrame()._id === mainFrameId) || null;
    return { page, browser };
}
//# sourceMappingURL=PuppeteerConnection.js.map