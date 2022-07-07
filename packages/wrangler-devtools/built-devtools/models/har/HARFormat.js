// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable @typescript-eslint/no-explicit-any */
class HARBase {
    custom;
    constructor(data) {
        if (!data || typeof data !== 'object') {
            throw 'First parameter is expected to be an object';
        }
        this.custom = new Map();
    }
    static safeDate(data) {
        const date = new Date(data);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }
        throw 'Invalid date format';
    }
    static safeNumber(data) {
        const result = Number(data);
        if (!Number.isNaN(result)) {
            return result;
        }
        throw 'Casting to number results in NaN';
    }
    static optionalNumber(data) {
        return data !== undefined ? HARBase.safeNumber(data) : undefined;
    }
    static optionalString(data) {
        return data !== undefined ? String(data) : undefined;
    }
    customAsString(name) {
        const value = this.custom.get(name);
        if (!value) {
            return undefined;
        }
        return String(value);
    }
    customAsNumber(name) {
        const value = this.custom.get(name);
        if (!value) {
            return undefined;
        }
        const numberValue = Number(value);
        if (Number.isNaN(numberValue)) {
            return undefined;
        }
        return numberValue;
    }
    customAsArray(name) {
        const value = this.custom.get(name);
        if (!value) {
            return undefined;
        }
        return Array.isArray(value) ? value : undefined;
    }
    customInitiator() {
        return this.custom.get('initiator');
    }
}
export class HARRoot extends HARBase {
    log;
    constructor(data) {
        super(data);
        this.log = new HARLog(data['log']);
    }
}
export class HARLog extends HARBase {
    version;
    creator;
    browser;
    pages;
    entries;
    comment;
    constructor(data) {
        super(data);
        this.version = String(data['version']);
        this.creator = new HARCreator(data['creator']);
        this.browser = data['browser'] ? new HARCreator(data['browser']) : undefined;
        this.pages = Array.isArray(data['pages']) ? data['pages'].map(page => new HARPage(page)) : [];
        if (!Array.isArray(data['entries'])) {
            throw 'log.entries is expected to be an array';
        }
        this.entries = data['entries'].map(entry => new HAREntry(entry));
        this.comment = HARBase.optionalString(data['comment']);
    }
}
class HARCreator extends HARBase {
    name;
    version;
    comment;
    constructor(data) {
        super(data);
        this.name = String(data['name']);
        this.version = String(data['version']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
export class HARPage extends HARBase {
    startedDateTime;
    id;
    title;
    pageTimings;
    comment;
    constructor(data) {
        super(data);
        this.startedDateTime = HARBase.safeDate(data['startedDateTime']);
        this.id = String(data['id']);
        this.title = String(data['title']);
        this.pageTimings = new HARPageTimings(data['pageTimings']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
class HARPageTimings extends HARBase {
    onContentLoad;
    onLoad;
    comment;
    constructor(data) {
        super(data);
        this.onContentLoad = HARBase.optionalNumber(data['onContentLoad']);
        this.onLoad = HARBase.optionalNumber(data['onLoad']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
export class HAREntry extends HARBase {
    pageref;
    startedDateTime;
    time;
    request;
    response;
    cache;
    timings;
    serverIPAddress;
    connection;
    comment;
    constructor(data) {
        super(data);
        this.pageref = HARBase.optionalString(data['pageref']);
        this.startedDateTime = HARBase.safeDate(data['startedDateTime']);
        this.time = HARBase.safeNumber(data['time']);
        this.request = new HARRequest(data['request']);
        this.response = new HARResponse(data['response']);
        this.cache = {}; // Not yet implemented.
        this.timings = new HARTimings(data['timings']);
        this.serverIPAddress = HARBase.optionalString(data['serverIPAddress']);
        this.connection = HARBase.optionalString(data['connection']);
        this.comment = HARBase.optionalString(data['comment']);
        // Chrome specific.
        this.custom.set('fromCache', HARBase.optionalString(data['_fromCache']));
        this.custom.set('initiator', this.importInitiator(data['_initiator']));
        this.custom.set('priority', HARBase.optionalString(data['_priority']));
        this.custom.set('resourceType', HARBase.optionalString(data['_resourceType']));
        this.custom.set('webSocketMessages', this.importWebSocketMessages(data['_webSocketMessages']));
    }
    importInitiator(initiator) {
        if (typeof initiator !== 'object') {
            return;
        }
        return new HARInitiator(initiator);
    }
    importWebSocketMessages(inputMessages) {
        if (!Array.isArray(inputMessages)) {
            return;
        }
        const outputMessages = [];
        for (const message of inputMessages) {
            if (typeof message !== 'object') {
                return;
            }
            outputMessages.push(new HARWebSocketMessage(message));
        }
        return outputMessages;
    }
}
class HARRequest extends HARBase {
    method;
    url;
    httpVersion;
    cookies;
    headers;
    queryString;
    postData;
    headersSize;
    bodySize;
    comment;
    constructor(data) {
        super(data);
        this.method = String(data['method']);
        this.url = String(data['url']);
        this.httpVersion = String(data['httpVersion']);
        this.cookies = Array.isArray(data['cookies']) ? data['cookies'].map(cookie => new HARCookie(cookie)) : [];
        this.headers = Array.isArray(data['headers']) ? data['headers'].map(header => new HARHeader(header)) : [];
        this.queryString = Array.isArray(data['queryString']) ? data['queryString'].map(qs => new HARQueryString(qs)) : [];
        this.postData = data['postData'] ? new HARPostData(data['postData']) : undefined;
        this.headersSize = HARBase.safeNumber(data['headersSize']);
        this.bodySize = HARBase.safeNumber(data['bodySize']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
class HARResponse extends HARBase {
    status;
    statusText;
    httpVersion;
    cookies;
    headers;
    content;
    redirectURL;
    headersSize;
    bodySize;
    comment;
    constructor(data) {
        super(data);
        this.status = HARBase.safeNumber(data['status']);
        this.statusText = String(data['statusText']);
        this.httpVersion = String(data['httpVersion']);
        this.cookies = Array.isArray(data['cookies']) ? data['cookies'].map(cookie => new HARCookie(cookie)) : [];
        this.headers = Array.isArray(data['headers']) ? data['headers'].map(header => new HARHeader(header)) : [];
        this.content = new HARContent(data['content']);
        this.redirectURL = String(data['redirectURL']);
        this.headersSize = HARBase.safeNumber(data['headersSize']);
        this.bodySize = HARBase.safeNumber(data['bodySize']);
        this.comment = HARBase.optionalString(data['comment']);
        // Chrome specific.
        this.custom.set('transferSize', HARBase.optionalNumber(data['_transferSize']));
        this.custom.set('error', HARBase.optionalString(data['_error']));
    }
}
class HARCookie extends HARBase {
    name;
    value;
    path;
    domain;
    expires;
    httpOnly;
    secure;
    comment;
    constructor(data) {
        super(data);
        this.name = String(data['name']);
        this.value = String(data['value']);
        this.path = HARBase.optionalString(data['path']);
        this.domain = HARBase.optionalString(data['domain']);
        this.expires = data['expires'] ? HARBase.safeDate(data['expires']) : undefined;
        this.httpOnly = data['httpOnly'] !== undefined ? Boolean(data['httpOnly']) : undefined;
        this.secure = data['secure'] !== undefined ? Boolean(data['secure']) : undefined;
        this.comment = HARBase.optionalString(data['comment']);
    }
}
class HARHeader extends HARBase {
    name;
    value;
    comment;
    constructor(data) {
        super(data);
        this.name = String(data['name']);
        this.value = String(data['value']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
class HARQueryString extends HARBase {
    name;
    value;
    comment;
    constructor(data) {
        super(data);
        this.name = String(data['name']);
        this.value = String(data['value']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
class HARPostData extends HARBase {
    mimeType;
    params;
    text;
    comment;
    constructor(data) {
        super(data);
        this.mimeType = String(data['mimeType']);
        this.params = Array.isArray(data['params']) ? data['params'].map(param => new HARParam(param)) : [];
        this.text = String(data['text']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
export class HARParam extends HARBase {
    name;
    value;
    fileName;
    contentType;
    comment;
    constructor(data) {
        super(data);
        this.name = String(data['name']);
        this.value = HARBase.optionalString(data['value']);
        this.fileName = HARBase.optionalString(data['fileName']);
        this.contentType = HARBase.optionalString(data['contentType']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
class HARContent extends HARBase {
    size;
    compression;
    mimeType;
    text;
    encoding;
    comment;
    constructor(data) {
        super(data);
        this.size = HARBase.safeNumber(data['size']);
        this.compression = HARBase.optionalNumber(data['compression']);
        this.mimeType = String(data['mimeType']);
        this.text = HARBase.optionalString(data['text']);
        this.encoding = HARBase.optionalString(data['encoding']);
        this.comment = HARBase.optionalString(data['comment']);
    }
}
export class HARTimings extends HARBase {
    blocked;
    dns;
    connect;
    send;
    wait;
    receive;
    ssl;
    comment;
    constructor(data) {
        super(data);
        this.blocked = HARBase.optionalNumber(data['blocked']);
        this.dns = HARBase.optionalNumber(data['dns']);
        this.connect = HARBase.optionalNumber(data['connect']);
        this.send = HARBase.safeNumber(data['send']);
        this.wait = HARBase.safeNumber(data['wait']);
        this.receive = HARBase.safeNumber(data['receive']);
        this.ssl = HARBase.optionalNumber(data['ssl']);
        this.comment = HARBase.optionalString(data['comment']);
        // Chrome specific.
        this.custom.set('blocked_queueing', HARBase.optionalNumber(data['_blocked_queueing']));
        this.custom.set('blocked_proxy', HARBase.optionalNumber(data['_blocked_proxy']));
    }
}
export class HARInitiator extends HARBase {
    type;
    url;
    lineNumber;
    /**
     * Based on Initiator defined in browser_protocol.pdl
     */
    constructor(data) {
        super(data);
        this.type = HARBase.optionalString(data['type']);
        this.url = HARBase.optionalString(data['url']);
        this.lineNumber = HARBase.optionalNumber(data['lineNumber']);
    }
}
class HARWebSocketMessage extends HARBase {
    time;
    opcode;
    data;
    type;
    constructor(data) {
        super(data);
        this.time = HARBase.optionalNumber(data['time']);
        this.opcode = HARBase.optionalNumber(data['opcode']);
        this.data = HARBase.optionalString(data['data']);
        this.type = HARBase.optionalString(data['type']);
    }
}
//# sourceMappingURL=HARFormat.js.map