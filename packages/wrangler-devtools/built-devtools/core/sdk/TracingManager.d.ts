import * as Protocol from '../../generated/protocol.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
import type { ObjectSnapshot } from './TracingModel.js';
export declare class TracingManager extends SDKModel<void> {
    #private;
    constructor(target: Target);
    bufferUsage(usage?: number, eventCount?: number, percentFull?: number): void;
    eventsCollected(events: EventPayload[]): void;
    tracingComplete(): void;
    start(client: TracingManagerClient, categoryFilter: string, options: string): Promise<Protocol.ProtocolResponseWithError>;
    stop(): void;
}
export interface TracingManagerClient {
    traceEventsCollected(events: EventPayload[]): void;
    tracingComplete(): void;
    tracingBufferUsage(usage: number): void;
    eventsRetrievalProgress(progress: number): void;
}
export interface EventPayload {
    cat?: string;
    pid: number;
    tid: number;
    ts: number;
    ph: string;
    name: string;
    args: {
        sort_index: number;
        name: string;
        snapshot: ObjectSnapshot;
        data: Object | null;
    };
    dur: number;
    id: string;
    id2?: {
        global: (string | undefined);
        local: (string | undefined);
    };
    scope: string;
    bind_id: string;
    s: string;
}
