// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const LENGTH_UNITS = [
    "px" /* PIXEL */,
    "cm" /* CENTIMETER */,
    "mm" /* MILLIMETER */,
    "in" /* INCH */,
    "pc" /* PICA */,
    "pt" /* POINT */,
    "ch" /* CH */,
    "em" /* EM */,
    "rem" /* REM */,
    "vh" /* VH */,
    "vw" /* VW */,
    "vmin" /* VMIN */,
    "vmax" /* VMAX */,
];
export const CSSLengthRegex = new RegExp(`(?<value>[+-]?\\d*\\.?\\d+)(?<unit>${LENGTH_UNITS.join('|')})`);
export const parseText = (text) => {
    const result = text.match(CSSLengthRegex);
    if (!result || !result.groups) {
        return null;
    }
    return {
        value: Number(result.groups.value),
        unit: result.groups.unit,
    };
};
//# sourceMappingURL=CSSLengthUtils.js.map