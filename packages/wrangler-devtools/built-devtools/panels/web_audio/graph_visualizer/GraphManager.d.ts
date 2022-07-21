import { GraphView } from './GraphView.js';
export declare class GraphManager {
    private readonly graphMapByContextId;
    createContext(contextId: string): void;
    destroyContext(contextId: string): void;
    hasContext(contextId: string): boolean;
    clearGraphs(): void;
    /**
     * Get graph by contextId.
     * If the user starts listening for WebAudio events after the page has been running a context for awhile,
     * the graph might be undefined.
     */
    getGraph(contextId: string): GraphView | null;
}
