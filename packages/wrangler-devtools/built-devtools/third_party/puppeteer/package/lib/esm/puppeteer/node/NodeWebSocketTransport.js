var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _NodeWebSocketTransport_ws;
/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import NodeWebSocket from 'ws';
import { packageVersion } from '../generated/version.js';
import { promises as dns } from 'dns';
/**
 * @internal
 */
export class NodeWebSocketTransport {
    constructor(ws) {
        _NodeWebSocketTransport_ws.set(this, void 0);
        __classPrivateFieldSet(this, _NodeWebSocketTransport_ws, ws, "f");
        __classPrivateFieldGet(this, _NodeWebSocketTransport_ws, "f").addEventListener('message', event => {
            if (this.onmessage) {
                this.onmessage.call(null, event.data);
            }
        });
        __classPrivateFieldGet(this, _NodeWebSocketTransport_ws, "f").addEventListener('close', () => {
            if (this.onclose) {
                this.onclose.call(null);
            }
        });
        // Silently ignore all errors - we don't know what to do with them.
        __classPrivateFieldGet(this, _NodeWebSocketTransport_ws, "f").addEventListener('error', () => { });
    }
    static async create(urlString) {
        // TODO(jrandolf): Starting in Node 17, IPv6 is favoured over IPv4 due to a change
        // in a default option:
        // - https://github.com/nodejs/node/issues/40537,
        // Due to this, for Firefox, we must parse and resolve the `localhost` hostname
        // manually with the previous behavior according to:
        // - https://nodejs.org/api/dns.html#dnslookuphostname-options-callback
        // because of https://bugzilla.mozilla.org/show_bug.cgi?id=1769994.
        const url = new URL(urlString);
        if (url.hostname === 'localhost') {
            const { address } = await dns.lookup(url.hostname, { verbatim: false });
            url.hostname = address;
        }
        return new Promise((resolve, reject) => {
            const ws = new NodeWebSocket(url, [], {
                followRedirects: true,
                perMessageDeflate: false,
                maxPayload: 256 * 1024 * 1024,
                headers: {
                    'User-Agent': `Puppeteer ${packageVersion}`,
                },
            });
            ws.addEventListener('open', () => {
                return resolve(new NodeWebSocketTransport(ws));
            });
            ws.addEventListener('error', reject);
        });
    }
    send(message) {
        __classPrivateFieldGet(this, _NodeWebSocketTransport_ws, "f").send(message);
    }
    close() {
        __classPrivateFieldGet(this, _NodeWebSocketTransport_ws, "f").close();
    }
}
_NodeWebSocketTransport_ws = new WeakMap();
//# sourceMappingURL=NodeWebSocketTransport.js.map