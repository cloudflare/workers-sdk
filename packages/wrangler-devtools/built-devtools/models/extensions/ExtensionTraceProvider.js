// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { ExtensionServer } from './ExtensionServer.js';
export class ExtensionTraceProvider {
    extensionOrigin;
    id;
    categoryName;
    categoryTooltip;
    constructor(extensionOrigin, id, categoryName, categoryTooltip) {
        this.extensionOrigin = extensionOrigin;
        this.id = id;
        this.categoryName = categoryName;
        this.categoryTooltip = categoryTooltip;
    }
    start(session) {
        const sessionId = String(++_lastSessionId);
        ExtensionServer.instance().startTraceRecording(this.id, sessionId, session);
    }
    stop() {
        ExtensionServer.instance().stopTraceRecording(this.id);
    }
    shortDisplayName() {
        return this.categoryName;
    }
    longDisplayName() {
        return this.categoryTooltip;
    }
    persistentIdentifier() {
        return `${this.extensionOrigin}/${this.categoryName}`;
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
let _lastSessionId = 0;
//# sourceMappingURL=ExtensionTraceProvider.js.map