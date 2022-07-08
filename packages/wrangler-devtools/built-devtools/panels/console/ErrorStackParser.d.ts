import type * as Platform from '../../core/platform/platform.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
export interface ParsedErrorFrame {
    line: string;
    link?: {
        url: Platform.DevToolsPath.UrlString;
        prefix: string;
        suffix: string;
        lineNumber?: number;
        columnNumber?: number;
        enclosedInBraces: boolean;
        scriptId?: Protocol.Runtime.ScriptId;
    };
}
/**
 * Takes a V8 Error#stack string and extracts source position information.
 *
 * The result includes the url, line and column number, as well as where
 * the url is found in the raw line.
 *
 * @returns Null if the provided string has an unexpected format. A
 *          populated `ParsedErrorFrame[]` otherwise.
 */
export declare function parseSourcePositionsFromErrorStack(runtimeModel: SDK.RuntimeModel.RuntimeModel, stack: string): ParsedErrorFrame[] | null;
/**
 * Error#stack output only contains script URLs. In some cases we are able to
 * retrieve additional exception details from V8 that we can use to augment
 * the parsed Error#stack with script IDs.
 * This function sets the `scriptId` field in `ParsedErrorFrame` when it finds
 * the corresponding info in `Protocol.Runtime.StackTrace`.
 */
export declare function augmentErrorStackWithScriptIds(parsedFrames: ParsedErrorFrame[], protocolStackTrace: Protocol.Runtime.StackTrace): void;
