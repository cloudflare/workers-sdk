// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const escapeCharacters = (inputString, charsToEscape) => {
    let foundChar = false;
    for (let i = 0; i < charsToEscape.length; ++i) {
        if (inputString.indexOf(charsToEscape.charAt(i)) !== -1) {
            foundChar = true;
            break;
        }
    }
    if (!foundChar) {
        return String(inputString);
    }
    let result = '';
    for (let i = 0; i < inputString.length; ++i) {
        if (charsToEscape.indexOf(inputString.charAt(i)) !== -1) {
            result += '\\';
        }
        result += inputString.charAt(i);
    }
    return result;
};
const toHexadecimal = (charCode, padToLength) => {
    return charCode.toString(16).toUpperCase().padStart(padToLength, '0');
};
// Remember to update the third group in the regexps patternsToEscape and
// patternsToEscapePlusSingleQuote when adding new entries in this map.
const escapedReplacements = new Map([
    ['\b', '\\b'],
    ['\f', '\\f'],
    ['\n', '\\n'],
    ['\r', '\\r'],
    ['\t', '\\t'],
    ['\v', '\\v'],
    ['\'', '\\\''],
    ['\\', '\\\\'],
    ['<!--', '\\x3C!--'],
    ['<script', '\\x3Cscript'],
    ['</script', '\\x3C/script'],
]);
export const formatAsJSLiteral = (content) => {
    const patternsToEscape = /(\\|<(?:!--|\/?script))|(\p{Control})|(\p{Surrogate})/gu;
    const patternsToEscapePlusSingleQuote = /(\\|'|<(?:!--|\/?script))|(\p{Control})|(\p{Surrogate})/gu;
    const escapePattern = (match, pattern, controlChar, loneSurrogate) => {
        if (controlChar) {
            if (escapedReplacements.has(controlChar)) {
                // @ts-ignore https://github.com/microsoft/TypeScript/issues/13086
                return escapedReplacements.get(controlChar);
            }
            const twoDigitHex = toHexadecimal(controlChar.charCodeAt(0), 2);
            return '\\x' + twoDigitHex;
        }
        if (loneSurrogate) {
            const fourDigitHex = toHexadecimal(loneSurrogate.charCodeAt(0), 4);
            return '\\u' + fourDigitHex;
        }
        if (pattern) {
            return escapedReplacements.get(pattern) || '';
        }
        return match;
    };
    let escapedContent = '';
    let quote = '';
    if (!content.includes('\'')) {
        quote = '\'';
        escapedContent = content.replaceAll(patternsToEscape, escapePattern);
    }
    else if (!content.includes('"')) {
        quote = '"';
        escapedContent = content.replaceAll(patternsToEscape, escapePattern);
    }
    else if (!content.includes('`') && !content.includes('${')) {
        quote = '`';
        escapedContent = content.replaceAll(patternsToEscape, escapePattern);
    }
    else {
        quote = '\'';
        escapedContent = content.replaceAll(patternsToEscapePlusSingleQuote, escapePattern);
    }
    return `${quote}${escapedContent}${quote}`;
};
/**
 * This implements a subset of the sprintf() function described in the Single UNIX
 * Specification. It supports the %s, %f, %d, and %% formatting specifiers, and
 * understands the %m$d notation to select the m-th parameter for this substitution,
 * as well as the optional precision for %s, %f, and %d.
 *
 * @param fmt format string.
 * @param args parameters to the format string.
 * @returns the formatted output string.
 */
export const sprintf = (fmt, ...args) => {
    let argIndex = 0;
    const RE = /%(?:(\d+)\$)?(?:\.(\d*))?([%dfs])/g;
    return fmt.replaceAll(RE, (_, index, precision, specifier) => {
        if (specifier === '%') {
            return '%';
        }
        if (index !== undefined) {
            argIndex = parseInt(index, 10) - 1;
            if (argIndex < 0) {
                throw new RangeError(`Invalid parameter index ${argIndex + 1}`);
            }
        }
        if (argIndex >= args.length) {
            throw new RangeError(`Expected at least ${argIndex + 1} format parameters, but only ${args.length} where given.`);
        }
        if (specifier === 's') {
            const argValue = String(args[argIndex++]);
            if (precision !== undefined) {
                return argValue.substring(0, Number(precision));
            }
            return argValue;
        }
        let argValue = Number(args[argIndex++]);
        if (isNaN(argValue)) {
            argValue = 0;
        }
        if (specifier === 'd') {
            return String(Math.floor(argValue)).padStart(Number(precision), '0');
        }
        if (precision !== undefined) {
            return argValue.toFixed(Number(precision));
        }
        return String(argValue);
    });
};
export const toBase64 = (inputString) => {
    /* note to the reader: we can't use btoa here because we need to
     * support Unicode correctly. See the test cases for this function and
     * also
     * https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
     */
    function encodeBits(b) {
        return b < 26 ? b + 65 : b < 52 ? b + 71 : b < 62 ? b - 4 : b === 62 ? 43 : b === 63 ? 47 : 65;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(inputString.toString());
    const n = data.length;
    let encoded = '';
    if (n === 0) {
        return encoded;
    }
    let shift;
    let v = 0;
    for (let i = 0; i < n; i++) {
        shift = i % 3;
        v |= data[i] << (16 >>> shift & 24);
        if (shift === 2) {
            encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), encodeBits(v >>> 6 & 63), encodeBits(v & 63));
            v = 0;
        }
    }
    if (shift === 0) {
        encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), 61, 61);
    }
    else if (shift === 1) {
        encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), encodeBits(v >>> 6 & 63), 61);
    }
    return encoded;
};
export const findIndexesOfSubString = (inputString, searchString) => {
    const matches = [];
    let i = inputString.indexOf(searchString);
    while (i !== -1) {
        matches.push(i);
        i = inputString.indexOf(searchString, i + searchString.length);
    }
    return matches;
};
export const findLineEndingIndexes = (inputString) => {
    const endings = findIndexesOfSubString(inputString, '\n');
    endings.push(inputString.length);
    return endings;
};
export const isWhitespace = (inputString) => {
    return /^\s*$/.test(inputString);
};
export const trimURL = (url, baseURLDomain) => {
    let result = url.replace(/^(https|http|file):\/\//i, '');
    if (baseURLDomain) {
        if (result.toLowerCase().startsWith(baseURLDomain.toLowerCase())) {
            result = result.substr(baseURLDomain.length);
        }
    }
    return result;
};
export const collapseWhitespace = (inputString) => {
    return inputString.replace(/[\s\xA0]+/g, ' ');
};
export const reverse = (inputString) => {
    return inputString.split('').reverse().join('');
};
export const replaceControlCharacters = (inputString) => {
    // Replace C0 and C1 control character sets with replacement character.
    // Do not replace '\t', \n' and '\r'.
    return inputString.replace(/[\0-\x08\x0B\f\x0E-\x1F\x80-\x9F]/g, '\uFFFD');
};
export const countWtf8Bytes = (inputString) => {
    let count = 0;
    for (let i = 0; i < inputString.length; i++) {
        const c = inputString.charCodeAt(i);
        if (c <= 0x7F) {
            count++;
        }
        else if (c <= 0x07FF) {
            count += 2;
        }
        else if (c < 0xD800 || 0xDFFF < c) {
            count += 3;
        }
        else {
            if (c <= 0xDBFF && i + 1 < inputString.length) {
                // The current character is a leading surrogate, and there is a
                // next character.
                const next = inputString.charCodeAt(i + 1);
                if (0xDC00 <= next && next <= 0xDFFF) {
                    // The next character is a trailing surrogate, meaning this
                    // is a surrogate pair.
                    count += 4;
                    i++;
                    continue;
                }
            }
            count += 3;
        }
    }
    return count;
};
export const stripLineBreaks = (inputStr) => {
    return inputStr.replace(/(\r)?\n/g, '');
};
export const toTitleCase = (inputStr) => {
    return inputStr.substring(0, 1).toUpperCase() + inputStr.substring(1);
};
export const removeURLFragment = (inputStr) => {
    const url = new URL(inputStr);
    url.hash = '';
    return url.toString();
};
const SPECIAL_REGEX_CHARACTERS = '^[]{}()\\.^$*+?|-,';
export const regexSpecialCharacters = function () {
    return SPECIAL_REGEX_CHARACTERS;
};
export const filterRegex = function (query) {
    let regexString = '';
    for (let i = 0; i < query.length; ++i) {
        let c = query.charAt(i);
        if (SPECIAL_REGEX_CHARACTERS.indexOf(c) !== -1) {
            c = '\\' + c;
        }
        if (i) {
            regexString += '[^\\0' + c + ']*';
        }
        regexString += c;
    }
    return new RegExp(regexString, 'i');
};
export const createSearchRegex = function (query, caseSensitive, isRegex) {
    const regexFlags = caseSensitive ? 'g' : 'gi';
    let regexObject;
    if (isRegex) {
        try {
            regexObject = new RegExp(query, regexFlags);
        }
        catch (e) {
            // Silent catch.
        }
    }
    if (!regexObject) {
        regexObject = createPlainTextSearchRegex(query, regexFlags);
    }
    return regexObject;
};
export const caseInsensetiveComparator = function (a, b) {
    a = a.toUpperCase();
    b = b.toUpperCase();
    if (a === b) {
        return 0;
    }
    return a > b ? 1 : -1;
};
export const hashCode = function (string) {
    if (!string) {
        return 0;
    }
    // Hash algorithm for substrings is described in "Über die Komplexität der Multiplikation in
    // eingeschränkten Branchingprogrammmodellen" by Woelfe.
    // http://opendatastructures.org/versions/edition-0.1d/ods-java/node33.html#SECTION00832000000000000000
    const p = ((1 << 30) * 4 - 5); // prime: 2^32 - 5
    const z = 0x5033d967; // 32 bits from random.org
    const z2 = 0x59d2f15d; // random odd 32 bit number
    let s = 0;
    let zi = 1;
    for (let i = 0; i < string.length; i++) {
        const xi = string.charCodeAt(i) * z2;
        s = (s + zi * xi) % p;
        zi = (zi * z) % p;
    }
    s = (s + zi * (p - 1)) % p;
    return Math.abs(s | 0);
};
export const compare = (a, b) => {
    if (a > b) {
        return 1;
    }
    if (a < b) {
        return -1;
    }
    return 0;
};
export const trimMiddle = (str, maxLength) => {
    if (str.length <= maxLength) {
        return String(str);
    }
    let leftHalf = maxLength >> 1;
    let rightHalf = maxLength - leftHalf - 1;
    if (str.codePointAt(str.length - rightHalf - 1) >= 0x10000) {
        --rightHalf;
        ++leftHalf;
    }
    if (leftHalf > 0 && str.codePointAt(leftHalf - 1) >= 0x10000) {
        --leftHalf;
    }
    return str.substr(0, leftHalf) + '…' + str.substr(str.length - rightHalf, rightHalf);
};
export const trimEndWithMaxLength = (str, maxLength) => {
    if (str.length <= maxLength) {
        return String(str);
    }
    return str.substr(0, maxLength - 1) + '…';
};
export const escapeForRegExp = (str) => {
    return escapeCharacters(str, SPECIAL_REGEX_CHARACTERS);
};
export const naturalOrderComparator = (a, b) => {
    const chunk = /^\d+|^\D+/;
    let chunka, chunkb, anum, bnum;
    while (true) {
        if (a) {
            if (!b) {
                return 1;
            }
        }
        else {
            if (b) {
                return -1;
            }
            return 0;
        }
        chunka = a.match(chunk)[0];
        chunkb = b.match(chunk)[0];
        anum = !Number.isNaN(Number(chunka));
        bnum = !Number.isNaN(Number(chunkb));
        if (anum && !bnum) {
            return -1;
        }
        if (bnum && !anum) {
            return 1;
        }
        if (anum && bnum) {
            const diff = Number(chunka) - Number(chunkb);
            if (diff) {
                return diff;
            }
            if (chunka.length !== chunkb.length) {
                if (!Number(chunka) && !Number(chunkb)) { // chunks are strings of all 0s (special case)
                    return chunka.length - chunkb.length;
                }
                return chunkb.length - chunka.length;
            }
        }
        else if (chunka !== chunkb) {
            return (chunka < chunkb) ? -1 : 1;
        }
        a = a.substring(chunka.length);
        b = b.substring(chunkb.length);
    }
};
export const base64ToSize = function (content) {
    if (!content) {
        return 0;
    }
    let size = content.length * 3 / 4;
    if (content[content.length - 1] === '=') {
        size--;
    }
    if (content.length > 1 && content[content.length - 2] === '=') {
        size--;
    }
    return size;
};
export const SINGLE_QUOTE = '\'';
export const DOUBLE_QUOTE = '"';
const BACKSLASH = '\\';
export const findUnclosedCssQuote = function (str) {
    let unmatchedQuote = '';
    for (let i = 0; i < str.length; ++i) {
        const char = str[i];
        if (char === BACKSLASH) {
            i++;
            continue;
        }
        if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
            if (unmatchedQuote === char) {
                unmatchedQuote = '';
            }
            else if (unmatchedQuote === '') {
                unmatchedQuote = char;
            }
        }
    }
    return unmatchedQuote;
};
export const createPlainTextSearchRegex = function (query, flags) {
    // This should be kept the same as the one in StringUtil.cpp.
    let regex = '';
    for (let i = 0; i < query.length; ++i) {
        const c = query.charAt(i);
        if (regexSpecialCharacters().indexOf(c) !== -1) {
            regex += '\\';
        }
        regex += c;
    }
    return new RegExp(regex, flags || '');
};
//# sourceMappingURL=string-utilities.js.map