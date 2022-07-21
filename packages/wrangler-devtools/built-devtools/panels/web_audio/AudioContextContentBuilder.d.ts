import type * as Protocol from '../../generated/protocol.js';
export declare class ContextDetailBuilder {
    private readonly fragment;
    private readonly container;
    constructor(context: Protocol.WebAudio.BaseAudioContext);
    private build;
    private addTitle;
    private addEntry;
    getFragment(): DocumentFragment;
}
export declare class ContextSummaryBuilder {
    private readonly fragment;
    constructor(contextId: string, contextRealtimeData: Protocol.WebAudio.ContextRealtimeData);
    getFragment(): DocumentFragment;
}
