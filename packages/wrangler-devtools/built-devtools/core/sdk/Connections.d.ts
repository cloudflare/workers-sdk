import type * as Platform from '../platform/platform.js';
import * as ProtocolClient from '../protocol_client/protocol_client.js';
export declare class MainConnection implements ProtocolClient.InspectorBackend.Connection {
    #private;
    onMessage: ((arg0: (Object | string)) => void) | null;
    constructor();
    setOnMessage(onMessage: (arg0: (Object | string)) => void): void;
    setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    sendRawMessage(message: string): void;
    private dispatchMessage;
    private dispatchMessageChunk;
    disconnect(): Promise<void>;
}
export declare class WebSocketConnection implements ProtocolClient.InspectorBackend.Connection {
    #private;
    onMessage: ((arg0: (Object | string)) => void) | null;
    constructor(url: Platform.DevToolsPath.UrlString, onWebSocketDisconnect: () => void);
    setOnMessage(onMessage: (arg0: (Object | string)) => void): void;
    setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    private onError;
    private onOpen;
    private onClose;
    private close;
    sendRawMessage(message: string): void;
    disconnect(): Promise<void>;
}
export declare class StubConnection implements ProtocolClient.InspectorBackend.Connection {
    #private;
    onMessage: ((arg0: (Object | string)) => void) | null;
    constructor();
    setOnMessage(onMessage: (arg0: (Object | string)) => void): void;
    setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    sendRawMessage(message: string): void;
    private respondWithError;
    disconnect(): Promise<void>;
}
export interface ParallelConnectionInterface extends ProtocolClient.InspectorBackend.Connection {
    getSessionId: () => string;
    getOnDisconnect: () => ((arg0: string) => void) | null;
}
export declare class ParallelConnection implements ParallelConnectionInterface {
    #private;
    onMessage: ((arg0: Object) => void) | null;
    constructor(connection: ProtocolClient.InspectorBackend.Connection, sessionId: string);
    setOnMessage(onMessage: (arg0: Object) => void): void;
    setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    getOnDisconnect(): ((arg0: string) => void) | null;
    sendRawMessage(message: string): void;
    getSessionId(): string;
    disconnect(): Promise<void>;
}
export declare function initMainConnection(createMainTarget: () => Promise<void>, websocketConnectionLost: () => void): Promise<void>;
