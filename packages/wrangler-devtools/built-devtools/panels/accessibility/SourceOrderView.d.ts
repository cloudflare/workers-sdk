import type * as SDK from '../../core/sdk/sdk.js';
import { AccessibilitySubPane } from './AccessibilitySubPane.js';
export declare class SourceOrderPane extends AccessibilitySubPane {
    private readonly noNodeInfo;
    private readonly warning;
    private checked;
    private checkboxLabel;
    private checkboxElement;
    private overlayModel;
    constructor();
    setNodeAsync(node: SDK.DOMModel.DOMNode | null): Promise<void>;
    private checkboxClicked;
}
