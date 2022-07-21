// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { GraphView } from './GraphView.js';
// A class that maps each context to its corresponding graph.
// It controls which graph to render when the context is switched or updated.
export class GraphManager {
    graphMapByContextId = new Map();
    createContext(contextId) {
        const graph = new GraphView(contextId);
        this.graphMapByContextId.set(contextId, graph);
    }
    destroyContext(contextId) {
        if (!this.graphMapByContextId.has(contextId)) {
            return;
        }
        const graph = this.graphMapByContextId.get(contextId);
        if (!graph) {
            return;
        }
        this.graphMapByContextId.delete(contextId);
    }
    hasContext(contextId) {
        return this.graphMapByContextId.has(contextId);
    }
    clearGraphs() {
        this.graphMapByContextId.clear();
    }
    /**
     * Get graph by contextId.
     * If the user starts listening for WebAudio events after the page has been running a context for awhile,
     * the graph might be undefined.
     */
    getGraph(contextId) {
        return this.graphMapByContextId.get(contextId) || null;
    }
}
//# sourceMappingURL=GraphManager.js.map