// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import * as FormatterWorker from './formatter_worker.js';
self.onmessage = function (event) {
    const method = event.data.method;
    const params = event.data.params;
    if (!method) {
        return;
    }
    switch (method) {
        case "format" /* FORMAT */:
            self.postMessage(FormatterWorker.FormatterWorker.format(params.mimeType, params.content, params.indentString));
            break;
        case "parseCSS" /* PARSE_CSS */:
            FormatterWorker.CSSRuleParser.parseCSS(params.content, self.postMessage);
            break;
        case "htmlOutline" /* HTML_OUTLINE */:
            FormatterWorker.HTMLOutline.htmlOutline(params.content, self.postMessage);
            break;
        case "javaScriptOutline" /* JAVASCRIPT_OUTLINE */:
            FormatterWorker.JavaScriptOutline.javaScriptOutline(params.content, self.postMessage);
            break;
        case "javaScriptIdentifiers" /* JAVASCRIPT_IDENTIFIERS */:
            self.postMessage(FormatterWorker.FormatterWorker.javaScriptIdentifiers(params.content));
            break;
        case "javaScriptSubstitute" /* JAVASCRIPT_SUBSTITUTE */: {
            const mapping = new Map(params.mapping);
            self.postMessage(FormatterWorker.Substitute.substituteExpression(params.content, mapping));
            break;
        }
        case "javaScriptScopeTree" /* JAVASCRIPT_SCOPE_TREE */: {
            self.postMessage(FormatterWorker.ScopeParser.parseScopes(params.content)?.export());
            break;
        }
        case "evaluatableJavaScriptSubstring" /* EVALUATE_JAVASCRIPT_SUBSTRING */:
            self.postMessage(FormatterWorker.FormatterWorker.evaluatableJavaScriptSubstring(params.content));
            break;
        case "argumentsList" /* ARGUMENTS_LIST */:
            self.postMessage(FormatterWorker.FormatterWorker.argumentsList(params.content));
            break;
        default:
            Platform.assertNever(method, `Unsupport method name: ${method}`);
    }
};
self.postMessage('workerReady');
//# sourceMappingURL=formatter_worker-entrypoint.js.map