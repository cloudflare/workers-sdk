// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// VGA color palette
const ANSI_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'gray'];
const ANSI_BRIGHT_COLORS = ['darkgray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'white'];
/**
 * This is the front-end part of the Formatter function specified in the
 * Console Standard (https://console.spec.whatwg.org/#formatter). Here we
 * assume that all type conversions have already happened in V8 before and
 * are only concerned with performing the actual substitutions and dealing
 * with generic and optimal object formatting as well as styling.
 *
 * @param fmt the format string.
 * @param args the substitution arguments for `fmt`.
 * @returns a list of `FormatToken`s as well as the unused arguments.
 */
export const format = (fmt, args) => {
    const tokens = [];
    // Current maintained style for ANSI color codes.
    const currentStyle = new Map();
    function addTextDecoration(value) {
        const textDecoration = currentStyle.get('text-decoration') ?? '';
        if (!textDecoration.includes(value)) {
            currentStyle.set('text-decoration', `${textDecoration} ${value}`);
        }
    }
    function removeTextDecoration(value) {
        const textDecoration = currentStyle.get('text-decoration')?.replace(` ${value}`, '');
        if (textDecoration) {
            currentStyle.set('text-decoration', textDecoration);
        }
        else {
            currentStyle.delete('text-decoration');
        }
    }
    function addStringToken(value) {
        if (!value) {
            return;
        }
        if (tokens.length && tokens[tokens.length - 1].type === 'string') {
            tokens[tokens.length - 1].value += value;
            return;
        }
        tokens.push({ type: 'string', value });
    }
    let argIndex = 0;
    const re = /%([%_Oocsdfi])|\x1B\[([\d;]*)m/;
    for (let match = re.exec(fmt); match !== null; match = re.exec(fmt)) {
        addStringToken(match.input.substring(0, match.index));
        let substitution = undefined;
        const specifier = match[1];
        switch (specifier) {
            case '%':
                addStringToken('%');
                substitution = '';
                break;
            case 's':
                if (argIndex < args.length) {
                    const { description } = args[argIndex++];
                    substitution = description ?? '';
                }
                break;
            case 'c':
                if (argIndex < args.length) {
                    const type = 'style';
                    const value = args[argIndex++].description ?? '';
                    tokens.push({ type, value });
                    substitution = '';
                }
                break;
            case 'o':
            case 'O':
                if (argIndex < args.length) {
                    const type = specifier === 'O' ? 'generic' : 'optimal';
                    const value = args[argIndex++];
                    tokens.push({ type, value });
                    substitution = '';
                }
                break;
            case '_':
                if (argIndex < args.length) {
                    argIndex++;
                    substitution = '';
                }
                break;
            case 'd':
            case 'f':
            case 'i':
                if (argIndex < args.length) {
                    const { value } = args[argIndex++];
                    substitution = typeof value !== 'number' ? NaN : value;
                    if (specifier !== 'f') {
                        substitution = Math.floor(substitution);
                    }
                }
                break;
            case undefined: {
                const codes = (match[2] || '0').split(';').map(code => code ? parseInt(code, 10) : 0);
                while (codes.length) {
                    const code = codes.shift();
                    switch (code) {
                        case 0:
                            currentStyle.clear();
                            break;
                        case 1:
                            currentStyle.set('font-weight', 'bold');
                            break;
                        case 2:
                            currentStyle.set('font-weight', 'lighter');
                            break;
                        case 3:
                            currentStyle.set('font-style', 'italic');
                            break;
                        case 4:
                            addTextDecoration('underline');
                            break;
                        case 9:
                            addTextDecoration('line-through');
                            break;
                        case 22:
                            currentStyle.delete('font-weight');
                            break;
                        case 23:
                            currentStyle.delete('font-style');
                            break;
                        case 24:
                            removeTextDecoration('underline');
                            break;
                        case 29:
                            removeTextDecoration('line-through');
                            break;
                        case 38:
                        case 48:
                            if (codes.shift() === 2) {
                                const r = codes.shift() ?? 0, g = codes.shift() ?? 0, b = codes.shift() ?? 0;
                                currentStyle.set(code === 38 ? 'color' : 'background', `rgb(${r},${g},${b})`);
                            }
                            break;
                        case 39:
                        case 49:
                            currentStyle.delete(code === 39 ? 'color' : 'background');
                            break;
                        case 53:
                            addTextDecoration('overline');
                            break;
                        case 55:
                            removeTextDecoration('overline');
                            break;
                        default: {
                            const color = ANSI_COLORS[code - 30] ?? ANSI_BRIGHT_COLORS[code - 90];
                            if (color !== undefined) {
                                currentStyle.set('color', `var(--console-color-${color})`);
                            }
                            else {
                                const background = ANSI_COLORS[code - 40] ?? ANSI_BRIGHT_COLORS[code - 100];
                                if (background !== undefined) {
                                    currentStyle.set('background-color', `var(--console-color-${background})`);
                                }
                            }
                            break;
                        }
                    }
                }
                const value = [...currentStyle.entries()].map(([key, val]) => `${key}:${val.trimStart()}`).join(';');
                const type = 'style';
                tokens.push({ type, value });
                substitution = '';
                break;
            }
        }
        if (substitution === undefined) {
            // If there's no substitution, emit the original specifier / sequence verbatim.
            addStringToken(match[0]);
            substitution = '';
        }
        fmt = substitution + match.input.substring(match.index + match[0].length);
    }
    addStringToken(fmt);
    return { tokens, args: args.slice(argIndex) };
};
export const updateStyle = (currentStyle, styleToAdd) => {
    const ALLOWED_PROPERTY_PREFIXES = ['background', 'border', 'color', 'font', 'line', 'margin', 'padding', 'text'];
    const BLOCKED_URL_SCHEMES = ['chrome', 'resource', 'about', 'app', 'http', 'https', 'ftp', 'file'];
    currentStyle.clear();
    const buffer = document.createElement('span');
    buffer.setAttribute('style', styleToAdd);
    for (const property of buffer.style) {
        if (!ALLOWED_PROPERTY_PREFIXES.some(prefix => property.startsWith(prefix) || property.startsWith(`-webkit-${prefix}`))) {
            continue;
        }
        const value = buffer.style.getPropertyValue(property);
        if (BLOCKED_URL_SCHEMES.some(scheme => value.includes(scheme + ':'))) {
            continue;
        }
        currentStyle.set(property, {
            value,
            priority: buffer.style.getPropertyPriority(property),
        });
    }
};
//# sourceMappingURL=ConsoleFormat.js.map