import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Bindings from '../../models/bindings/bindings.js';
import * as Protocol from '../../generated/protocol.js';
export declare class DebuggerPausedMessage {
    private readonly elementInternal;
    private contentElement;
    constructor();
    element(): Element;
    private static descriptionWithoutStack;
    private static createDOMBreakpointHitMessage;
    render(details: SDK.DebuggerModel.DebuggerPausedDetails | null, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, breakpointManager: Bindings.BreakpointManager.BreakpointManager): Promise<void>;
}
export declare const BreakpointTypeNouns: Map<Protocol.DOMDebugger.DOMBreakpointType, () => Common.UIString.LocalizedString>;
