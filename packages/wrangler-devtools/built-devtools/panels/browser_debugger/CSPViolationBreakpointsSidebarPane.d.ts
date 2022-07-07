import * as SDK from '../../core/sdk/sdk.js';
import { CategorizedBreakpointsSidebarPane } from './CategorizedBreakpointsSidebarPane.js';
export declare class CSPViolationBreakpointsSidebarPane extends CategorizedBreakpointsSidebarPane {
    private constructor();
    static instance(): CSPViolationBreakpointsSidebarPane;
    protected getBreakpointFromPausedDetails(details: SDK.DebuggerModel.DebuggerPausedDetails): SDK.CategorizedBreakpoint.CategorizedBreakpoint | null;
    protected toggleBreakpoint(breakpoint: SDK.CategorizedBreakpoint.CategorizedBreakpoint, enabled: boolean): void;
}
