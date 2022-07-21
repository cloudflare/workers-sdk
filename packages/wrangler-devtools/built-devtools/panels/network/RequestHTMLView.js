/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as UI from '../../ui/legacy/legacy.js';
import requestHTMLViewStyles from './requestHTMLView.css.js';
export class RequestHTMLView extends UI.Widget.VBox {
    dataURL;
    constructor(dataURL) {
        super(true);
        this.dataURL = encodeURI(dataURL).replace(/#/g, '%23');
        this.contentElement.classList.add('html', 'request-view');
    }
    wasShown() {
        this.createIFrame();
        this.registerCSSFiles([requestHTMLViewStyles]);
    }
    willHide() {
        this.contentElement.removeChildren();
    }
    createIFrame() {
        // We need to create iframe again each time because contentDocument
        // is deleted when iframe is removed from its parent.
        this.contentElement.removeChildren();
        const iframe = document.createElement('iframe');
        iframe.className = 'html-preview-frame';
        iframe.setAttribute('sandbox', ''); // Forbid to run JavaScript and set unique origin.
        iframe.setAttribute('csp', 'default-src \'none\'');
        iframe.setAttribute('src', this.dataURL);
        iframe.tabIndex = -1;
        UI.ARIAUtils.markAsPresentation(iframe);
        this.contentElement.appendChild(iframe);
    }
}
//# sourceMappingURL=RequestHTMLView.js.map