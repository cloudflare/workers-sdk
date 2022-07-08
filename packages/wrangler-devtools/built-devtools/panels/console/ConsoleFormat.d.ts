import type * as SDK from '../../core/sdk/sdk.js';
export declare type FormatToken = {
    type: 'generic' | 'optimal';
    value: SDK.RemoteObject.RemoteObject;
} | {
    type: 'string' | 'style';
    value: string;
};
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
export declare const format: (fmt: string, args: SDK.RemoteObject.RemoteObject[]) => {
    tokens: FormatToken[];
    args: SDK.RemoteObject.RemoteObject[];
};
export declare const updateStyle: (currentStyle: Map<string, {
    value: string;
    priority: string;
}>, styleToAdd: string) => void;
