// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
let instance = null;
export class RecorderPluginManager {
    #plugins = new Set();
    static instance() {
        if (!instance) {
            instance = new RecorderPluginManager();
        }
        return instance;
    }
    addPlugin(plugin) {
        this.#plugins.add(plugin);
    }
    removePlugin(plugin) {
        this.#plugins.delete(plugin);
    }
    plugins() {
        return Array.from(this.#plugins.values());
    }
}
//# sourceMappingURL=RecorderPluginManager.js.map