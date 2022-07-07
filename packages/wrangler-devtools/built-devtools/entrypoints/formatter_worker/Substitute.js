// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Acorn from '../../third_party/acorn/acorn.js';
import { ECMA_VERSION } from './AcornTokenizer.js';
import { ScopeVariableAnalysis } from './ScopeParser.js';
export function substituteExpression(expression, nameMap) {
    const replacements = computeSubstitution(expression, nameMap);
    return applySubstitution(expression, replacements);
}
// Given an |expression| and a mapping from names to new names, the |computeSubstitution|
// function returns a list of replacements sorted by the offset. The function throws if
// it cannot parse the expression or the substitution is impossible to perform (for example
// if the substitution target is 'this' within a function, it would become bound there).
function computeSubstitution(expression, nameMap) {
    // Parse the expression and find variables and scopes.
    const root = Acorn.parse(expression, { ecmaVersion: ECMA_VERSION, allowAwaitOutsideFunction: true, ranges: false });
    const scopeVariables = new ScopeVariableAnalysis(root);
    scopeVariables.run();
    const freeVariables = scopeVariables.getFreeVariables();
    const result = [];
    // Prepare the machinery for generating fresh names (to avoid variable captures).
    const allNames = scopeVariables.getAllNames();
    for (const rename of nameMap.values()) {
        allNames.add(rename);
    }
    function getNewName(base) {
        let i = 1;
        while (allNames.has(`${base}_${i}`)) {
            i++;
        }
        const newName = `${base}_${i}`;
        allNames.add(newName);
        return newName;
    }
    // Perform the substitutions.
    for (const [name, rename] of nameMap.entries()) {
        const defUse = freeVariables.get(name);
        if (!defUse) {
            continue;
        }
        const binders = [];
        for (const use of defUse) {
            result.push({
                from: name,
                to: rename,
                offset: use.offset,
                isShorthandAssignmentProperty: use.isShorthandAssignmentProperty,
            });
            binders.push(...use.scope.findBinders(rename));
        }
        // If there is a capturing binder, rename the bound variable.
        for (const binder of binders) {
            if (binder.definitionKind === 3 /* Fixed */) {
                // If the identifier is bound to a fixed name, such as 'this',
                // then refuse to do the substitution.
                throw new Error(`Cannot avoid capture of '${rename}'`);
            }
            const newName = getNewName(rename);
            for (const use of binder.uses) {
                result.push({
                    from: rename,
                    to: newName,
                    offset: use.offset,
                    isShorthandAssignmentProperty: use.isShorthandAssignmentProperty,
                });
            }
        }
    }
    result.sort((l, r) => l.offset - r.offset);
    return result;
}
function applySubstitution(expression, replacements) {
    const accumulator = [];
    let last = 0;
    for (const r of replacements) {
        accumulator.push(expression.slice(last, r.offset));
        let replacement = r.to;
        if (r.isShorthandAssignmentProperty) {
            // Let us expand the shorthand to full assignment.
            replacement = `${r.from}: ${r.to}`;
        }
        accumulator.push(replacement);
        last = r.offset + r.from.length;
    }
    accumulator.push(expression.slice(last));
    return accumulator.join('');
}
//# sourceMappingURL=Substitute.js.map