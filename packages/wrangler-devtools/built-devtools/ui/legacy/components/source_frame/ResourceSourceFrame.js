// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) IBM Corp. 2009  All rights reserved.
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
import * as i18n from '../../../../core/i18n/i18n.js';
import * as UI from '../../legacy.js';
import { SourceFrameImpl } from './SourceFrame.js';
import resourceSourceFrameStyles from './resourceSourceFrame.css.legacy.js';
const UIStrings = {
    /**
    *@description Text to find an item
    */
    find: 'Find',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/components/source_frame/ResourceSourceFrame.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ResourceSourceFrame extends SourceFrameImpl {
    givenContentType;
    resourceInternal;
    constructor(resource, givenContentType, options) {
        super(() => resource.requestContent(), options);
        this.givenContentType = givenContentType;
        this.resourceInternal = resource;
    }
    static createSearchableView(resource, contentType, autoPrettyPrint) {
        return new SearchableContainer(resource, contentType, autoPrettyPrint);
    }
    getContentType() {
        return this.givenContentType;
    }
    get resource() {
        return this.resourceInternal;
    }
    populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber) {
        super.populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber);
        contextMenu.appendApplicableItems(this.resourceInternal);
    }
}
export class SearchableContainer extends UI.Widget.VBox {
    sourceFrame;
    constructor(resource, contentType, autoPrettyPrint) {
        super(true);
        this.registerRequiredCSS(resourceSourceFrameStyles);
        const sourceFrame = new ResourceSourceFrame(resource, contentType);
        this.sourceFrame = sourceFrame;
        const canPrettyPrint = sourceFrame.resource.contentType().isDocumentOrScriptOrStyleSheet() || contentType === 'application/json';
        sourceFrame.setCanPrettyPrint(canPrettyPrint, autoPrettyPrint);
        const searchableView = new UI.SearchableView.SearchableView(sourceFrame, sourceFrame);
        searchableView.element.classList.add('searchable-view');
        searchableView.setPlaceholder(i18nString(UIStrings.find));
        sourceFrame.show(searchableView.element);
        sourceFrame.setSearchableView(searchableView);
        searchableView.show(this.contentElement);
        const toolbar = new UI.Toolbar.Toolbar('toolbar', this.contentElement);
        void sourceFrame.toolbarItems().then(items => {
            items.map(item => toolbar.appendToolbarItem(item));
        });
    }
    async revealPosition(lineNumber, columnNumber) {
        this.sourceFrame.revealPosition({ lineNumber, columnNumber }, true);
    }
}
//# sourceMappingURL=ResourceSourceFrame.js.map