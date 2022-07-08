// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export function getCssDeclarationAsJavascriptProperty(declaration) {
    const { name, value } = declaration;
    const declarationNameAsJs = name.startsWith('--') ? `'${name}'` : name.replace(/-([a-z])/gi, (_str, group) => group.toUpperCase());
    const declarationAsJs = `'${value.replaceAll('\'', '\\\'')}'`;
    return `${declarationNameAsJs}: ${declarationAsJs}`;
}
//# sourceMappingURL=StylePropertyUtils.js.map