// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
const UIStrings = {
    /**
    *@description Message in Database Model of the Application panel
    */
    databaseNoLongerHasExpected: 'Database no longer has expected version.',
    /**
    *@description Message in Database Model of the Application panel
    *@example {-197} PH1
    */
    anUnexpectedErrorSOccurred: 'An unexpected error {PH1} occurred.',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/DatabaseModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class Database {
    model;
    idInternal;
    domainInternal;
    nameInternal;
    versionInternal;
    constructor(model, id, domain, name, version) {
        this.model = model;
        this.idInternal = id;
        this.domainInternal = domain;
        this.nameInternal = name;
        this.versionInternal = version;
    }
    get id() {
        return this.idInternal;
    }
    get name() {
        return this.nameInternal;
    }
    set name(x) {
        this.nameInternal = x;
    }
    get version() {
        return this.versionInternal;
    }
    set version(x) {
        this.versionInternal = x;
    }
    get domain() {
        return this.domainInternal;
    }
    set domain(x) {
        this.domainInternal = x;
    }
    async tableNames() {
        const { tableNames } = await this.model.agent.invoke_getDatabaseTableNames({ databaseId: this.idInternal }) || [];
        return tableNames.sort();
    }
    async executeSql(
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query, onSuccess, onError) {
        const response = await this.model.agent.invoke_executeSQL({ 'databaseId': this.idInternal, 'query': query });
        const error = response.getError() || null;
        if (error) {
            onError(error);
            return;
        }
        const sqlError = response.sqlError;
        if (!sqlError) {
            // We know from the back-end that if there is no error, neither columnNames nor values can be undefined.
            onSuccess(response.columnNames || [], response.values || []);
            return;
        }
        let message;
        if (sqlError.message) {
            message = sqlError.message;
        }
        else if (sqlError.code === 2) {
            message = i18nString(UIStrings.databaseNoLongerHasExpected);
        }
        else {
            message = i18nString(UIStrings.anUnexpectedErrorSOccurred, { PH1: sqlError.code });
        }
        onError(message);
    }
}
export class DatabaseModel extends SDK.SDKModel.SDKModel {
    databasesInternal;
    agent;
    enabled;
    constructor(target) {
        super(target);
        this.databasesInternal = [];
        this.agent = target.databaseAgent();
        this.target().registerDatabaseDispatcher(new DatabaseDispatcher(this));
    }
    enable() {
        if (this.enabled) {
            return;
        }
        void this.agent.invoke_enable();
        this.enabled = true;
    }
    disable() {
        if (!this.enabled) {
            return;
        }
        this.enabled = false;
        this.databasesInternal = [];
        void this.agent.invoke_disable();
        this.dispatchEventToListeners(Events.DatabasesRemoved);
    }
    databases() {
        const result = [];
        for (const database of this.databasesInternal) {
            result.push(database);
        }
        return result;
    }
    addDatabase(database) {
        this.databasesInternal.push(database);
        this.dispatchEventToListeners(Events.DatabaseAdded, database);
    }
}
SDK.SDKModel.SDKModel.register(DatabaseModel, { capabilities: SDK.Target.Capability.DOM, autostart: false });
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["DatabaseAdded"] = "DatabaseAdded";
    Events["DatabasesRemoved"] = "DatabasesRemoved";
})(Events || (Events = {}));
export class DatabaseDispatcher {
    model;
    constructor(model) {
        this.model = model;
    }
    addDatabase({ database }) {
        this.model.addDatabase(new Database(this.model, database.id, database.domain, database.name, database.version));
    }
}
//# sourceMappingURL=DatabaseModel.js.map