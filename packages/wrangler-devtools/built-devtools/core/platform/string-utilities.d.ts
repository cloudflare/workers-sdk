export declare const escapeCharacters: (inputString: string, charsToEscape: string) => string;
export declare const formatAsJSLiteral: (content: string) => string;
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
export declare const sprintf: (fmt: string, ...args: unknown[]) => string;
export declare const toBase64: (inputString: string) => string;
export declare const findIndexesOfSubString: (inputString: string, searchString: string) => number[];
export declare const findLineEndingIndexes: (inputString: string) => number[];
export declare const isWhitespace: (inputString: string) => boolean;
export declare const trimURL: (url: string, baseURLDomain?: string | undefined) => string;
export declare const collapseWhitespace: (inputString: string) => string;
export declare const reverse: (inputString: string) => string;
export declare const replaceControlCharacters: (inputString: string) => string;
export declare const countWtf8Bytes: (inputString: string) => number;
export declare const stripLineBreaks: (inputStr: string) => string;
export declare const toTitleCase: (inputStr: string) => string;
export declare const removeURLFragment: (inputStr: string) => string;
export declare const regexSpecialCharacters: () => string;
export declare const filterRegex: (query: string) => RegExp;
export declare const createSearchRegex: (query: string, caseSensitive: boolean, isRegex: boolean) => RegExp;
export declare const caseInsensetiveComparator: (a: string, b: string) => number;
export declare const hashCode: (string?: string | undefined) => number;
export declare const compare: (a: string, b: string) => number;
export declare const trimMiddle: (str: string, maxLength: number) => string;
export declare const trimEndWithMaxLength: (str: string, maxLength: number) => string;
export declare const escapeForRegExp: (str: string) => string;
export declare const naturalOrderComparator: (a: string, b: string) => number;
export declare const base64ToSize: (content: string | null) => number;
export declare const SINGLE_QUOTE = "'";
export declare const DOUBLE_QUOTE = "\"";
export declare const findUnclosedCssQuote: (str: string) => string;
export declare const createPlainTextSearchRegex: (query: string, flags?: string | undefined) => RegExp;
