// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Formatter from '../../models/formatter/formatter.js';
import * as DiffView from '../../ui/components/diff_view/diff_view.js';
export function imageNameForResourceType(resourceType) {
    if (resourceType.isDocument()) {
        return 'ic_file_document';
    }
    if (resourceType.isImage()) {
        return 'ic_file_image';
    }
    if (resourceType.isFont()) {
        return 'ic_file_font';
    }
    if (resourceType.isScript()) {
        return 'ic_file_script';
    }
    if (resourceType.isStyleSheet()) {
        return 'ic_file_stylesheet';
    }
    if (resourceType.isWebbundle()) {
        return 'ic_file_webbundle';
    }
    return 'ic_file_default';
}
export async function formatCSSChangesFromDiff(diff) {
    const indent = '  ';
    const { originalLines, currentLines, rows } = DiffView.DiffView.buildDiffRows(diff);
    const originalRuleMaps = await buildStyleRuleMaps(originalLines.join('\n'));
    const currentRuleMaps = await buildStyleRuleMaps(currentLines.join('\n'));
    let changes = '';
    let recordedOriginalSelector, recordedCurrentSelector;
    let hasOpenDeclarationBlock = false;
    for (const { currentLineNumber, originalLineNumber, type } of rows) {
        if (type !== "deletion" /* Deletion */ && type !== "addition" /* Addition */) {
            continue;
        }
        const isDeletion = type === "deletion" /* Deletion */;
        const lines = isDeletion ? originalLines : currentLines;
        // Diff line arrays starts at 0, but line numbers start at 1.
        const lineIndex = isDeletion ? originalLineNumber - 1 : currentLineNumber - 1;
        const line = lines[lineIndex].trim();
        const { declarationIDToStyleRule, styleRuleIDToStyleRule } = isDeletion ? originalRuleMaps : currentRuleMaps;
        let styleRule;
        let prefix = '';
        if (declarationIDToStyleRule.has(lineIndex)) {
            styleRule = declarationIDToStyleRule.get(lineIndex);
            const selector = styleRule.selector;
            // Use the equality of selector strings as a best-effort check for the equality of style rules.
            if (selector !== recordedOriginalSelector && selector !== recordedCurrentSelector) {
                prefix += `${selector} {\n`;
            }
            prefix += indent;
            hasOpenDeclarationBlock = true;
        }
        else {
            if (hasOpenDeclarationBlock) {
                prefix = '}\n\n';
                hasOpenDeclarationBlock = false;
            }
            if (styleRuleIDToStyleRule.has(lineIndex)) {
                styleRule = styleRuleIDToStyleRule.get(lineIndex);
            }
        }
        const processedLine = isDeletion ? `/* ${line} */` : line;
        changes += prefix + processedLine + '\n';
        if (isDeletion) {
            recordedOriginalSelector = styleRule?.selector;
        }
        else {
            recordedCurrentSelector = styleRule?.selector;
        }
    }
    if (changes.length > 0) {
        changes += '}';
    }
    return changes;
}
async function buildStyleRuleMaps(content) {
    const rules = await new Promise(res => {
        const rules = [];
        Formatter.FormatterWorkerPool.formatterWorkerPool().parseCSS(content, (isLastChunk, currentRules) => {
            rules.push(...currentRules);
            if (isLastChunk) {
                res(rules);
            }
        });
    });
    // We use line numbers as unique IDs for rules and declarations
    const declarationIDToStyleRule = new Map();
    const styleRuleIDToStyleRule = new Map();
    for (const rule of rules) {
        if ('styleRange' in rule) {
            const selector = rule.selectorText.split('\n').pop()?.trim();
            if (!selector) {
                continue;
            }
            const styleRule = { rule, selector };
            styleRuleIDToStyleRule.set(rule.styleRange.startLine, styleRule);
            for (const property of rule.properties) {
                declarationIDToStyleRule.set(property.range.startLine, styleRule);
            }
        }
    }
    return { declarationIDToStyleRule, styleRuleIDToStyleRule };
}
//# sourceMappingURL=utils.js.map