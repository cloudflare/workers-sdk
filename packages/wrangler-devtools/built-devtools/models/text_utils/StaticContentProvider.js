// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { performSearchInContent } from './TextUtils.js';
export class StaticContentProvider {
    contentURLInternal;
    contentTypeInternal;
    lazyContent;
    constructor(contentURL, contentType, lazyContent) {
        this.contentURLInternal = contentURL;
        this.contentTypeInternal = contentType;
        this.lazyContent = lazyContent;
    }
    static fromString(contentURL, contentType, content) {
        const lazyContent = () => Promise.resolve({ content, isEncoded: false });
        return new StaticContentProvider(contentURL, contentType, lazyContent);
    }
    contentURL() {
        return this.contentURLInternal;
    }
    contentType() {
        return this.contentTypeInternal;
    }
    contentEncoded() {
        return Promise.resolve(false);
    }
    requestContent() {
        return this.lazyContent();
    }
    async searchInContent(query, caseSensitive, isRegex) {
        const { content } = await this.lazyContent();
        return content ? performSearchInContent(content, query, caseSensitive, isRegex) : [];
    }
}
//# sourceMappingURL=StaticContentProvider.js.map