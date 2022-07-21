// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as ProtocolClient from '../protocol_client/protocol_client.js';
import * as Root from '../root/root.js';
import { TargetManager } from './TargetManager.js';
export class MainConnection {
    onMessage;
    #onDisconnect;
    #messageBuffer;
    #messageSize;
    #eventListeners;
    constructor() {
        this.onMessage = null;
        this.#onDisconnect = null;
        this.#messageBuffer = '';
        this.#messageSize = 0;
        this.#eventListeners = [
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.DispatchMessage, this.dispatchMessage, this),
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.DispatchMessageChunk, this.dispatchMessageChunk, this),
        ];
    }
    setOnMessage(onMessage) {
        this.onMessage = onMessage;
    }
    setOnDisconnect(onDisconnect) {
        this.#onDisconnect = onDisconnect;
    }
    sendRawMessage(message) {
        if (this.onMessage) {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.sendMessageToBackend(message);
        }
    }
    dispatchMessage(event) {
        if (this.onMessage) {
            this.onMessage.call(null, event.data);
        }
    }
    dispatchMessageChunk(event) {
        const { messageChunk, messageSize } = event.data;
        if (messageSize) {
            this.#messageBuffer = '';
            this.#messageSize = messageSize;
        }
        this.#messageBuffer += messageChunk;
        if (this.#messageBuffer.length === this.#messageSize && this.onMessage) {
            this.onMessage.call(null, this.#messageBuffer);
            this.#messageBuffer = '';
            this.#messageSize = 0;
        }
    }
    async disconnect() {
        const onDisconnect = this.#onDisconnect;
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.#onDisconnect = null;
        this.onMessage = null;
        if (onDisconnect) {
            onDisconnect.call(null, 'force disconnect');
        }
    }
}
export class WebSocketConnection {
    #socket;
    onMessage;
    #onDisconnect;
    #onWebSocketDisconnect;
    #connected;
    #messages;
    constructor(url, onWebSocketDisconnect) {
        this.#socket = new WebSocket(url);
        this.#socket.onerror = this.onError.bind(this);
        this.#socket.onopen = this.onOpen.bind(this);
        this.#socket.onmessage = (messageEvent) => {
            if (this.onMessage) {
                this.onMessage.call(null, messageEvent.data);
            }
        };
        this.#socket.onclose = this.onClose.bind(this);
        this.onMessage = null;
        this.#onDisconnect = null;
        this.#onWebSocketDisconnect = onWebSocketDisconnect;
        this.#connected = false;
        this.#messages = [];
    }
    setOnMessage(onMessage) {
        this.onMessage = onMessage;
    }
    setOnDisconnect(onDisconnect) {
        this.#onDisconnect = onDisconnect;
    }
    onError() {
        if (this.#onWebSocketDisconnect) {
            this.#onWebSocketDisconnect.call(null);
        }
        if (this.#onDisconnect) {
            // This is called if error occurred while connecting.
            this.#onDisconnect.call(null, 'connection failed');
        }
        this.close();
    }
    onOpen() {
        this.#connected = true;
        if (this.#socket) {
            this.#socket.onerror = console.error;
            for (const message of this.#messages) {
                this.#socket.send(message);
            }
        }
        this.#messages = [];
    }
    onClose() {
        if (this.#onWebSocketDisconnect) {
            this.#onWebSocketDisconnect.call(null);
        }
        if (this.#onDisconnect) {
            this.#onDisconnect.call(null, 'websocket closed');
        }
        this.close();
    }
    close(callback) {
        if (this.#socket) {
            this.#socket.onerror = null;
            this.#socket.onopen = null;
            this.#socket.onclose = callback || null;
            this.#socket.onmessage = null;
            this.#socket.close();
            this.#socket = null;
        }
        this.#onWebSocketDisconnect = null;
    }
    sendRawMessage(message) {
        if (this.#connected && this.#socket) {
            this.#socket.send(message);
        }
        else {
            this.#messages.push(message);
        }
    }
    disconnect() {
        return new Promise(fulfill => {
            this.close(() => {
                if (this.#onDisconnect) {
                    this.#onDisconnect.call(null, 'force disconnect');
                }
                fulfill();
            });
        });
    }
}
export class StubConnection {
    onMessage;
    #onDisconnect;
    constructor() {
        this.onMessage = null;
        this.#onDisconnect = null;
    }
    setOnMessage(onMessage) {
        this.onMessage = onMessage;
    }
    setOnDisconnect(onDisconnect) {
        this.#onDisconnect = onDisconnect;
    }
    sendRawMessage(message) {
        window.setTimeout(this.respondWithError.bind(this, message), 0);
    }
    respondWithError(message) {
        const messageObject = JSON.parse(message);
        const error = {
            message: 'This is a stub connection, can\'t dispatch message.',
            code: ProtocolClient.InspectorBackend.DevToolsStubErrorCode,
            data: messageObject,
        };
        if (this.onMessage) {
            this.onMessage.call(null, { id: messageObject.id, error: error });
        }
    }
    async disconnect() {
        if (this.#onDisconnect) {
            this.#onDisconnect.call(null, 'force disconnect');
        }
        this.#onDisconnect = null;
        this.onMessage = null;
    }
}
export class ParallelConnection {
    #connection;
    #sessionId;
    onMessage;
    #onDisconnect;
    constructor(connection, sessionId) {
        this.#connection = connection;
        this.#sessionId = sessionId;
        this.onMessage = null;
        this.#onDisconnect = null;
    }
    setOnMessage(onMessage) {
        this.onMessage = onMessage;
    }
    setOnDisconnect(onDisconnect) {
        this.#onDisconnect = onDisconnect;
    }
    getOnDisconnect() {
        return this.#onDisconnect;
    }
    sendRawMessage(message) {
        const messageObject = JSON.parse(message);
        // If the message isn't for a specific session, it must be for the root session.
        if (!messageObject.sessionId) {
            messageObject.sessionId = this.#sessionId;
        }
        this.#connection.sendRawMessage(JSON.stringify(messageObject));
    }
    getSessionId() {
        return this.#sessionId;
    }
    async disconnect() {
        if (this.#onDisconnect) {
            this.#onDisconnect.call(null, 'force disconnect');
        }
        this.#onDisconnect = null;
        this.onMessage = null;
    }
}
export async function initMainConnection(createMainTarget, websocketConnectionLost) {
    ProtocolClient.InspectorBackend.Connection.setFactory(createMainConnection.bind(null, websocketConnectionLost));
    await createMainTarget();
    Host.InspectorFrontendHost.InspectorFrontendHostInstance.connectionReady();
    Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.ReattachMainTarget, () => {
        const target = TargetManager.instance().mainTarget();
        if (target) {
            const router = target.router();
            if (router) {
                void router.connection().disconnect();
            }
        }
        void createMainTarget();
    });
}
function createMainConnection(websocketConnectionLost) {
    const wsParam = Root.Runtime.Runtime.queryParam('ws');
    const wssParam = Root.Runtime.Runtime.queryParam('wss');
    if (wsParam || wssParam) {
        const ws = (wsParam ? `ws://${wsParam}` : `wss://${wssParam}`);
        return new WebSocketConnection(ws, websocketConnectionLost);
    }
    if (Host.InspectorFrontendHost.InspectorFrontendHostInstance.isHostedMode()) {
        return new StubConnection();
    }
    return new MainConnection();
}
//# sourceMappingURL=Connections.js.map