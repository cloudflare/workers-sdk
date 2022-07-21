import * as Workspace from '../workspace/workspace.js';
import type { FormatterSourceMapping } from './ScriptFormatter.js';
export declare class SourceFormatData {
    originalSourceCode: Workspace.UISourceCode.UISourceCode;
    formattedSourceCode: Workspace.UISourceCode.UISourceCode;
    mapping: FormatterSourceMapping;
    constructor(originalSourceCode: Workspace.UISourceCode.UISourceCode, formattedSourceCode: Workspace.UISourceCode.UISourceCode, mapping: FormatterSourceMapping);
    originalPath(): string;
    static for(object: Object): SourceFormatData | null;
}
export declare class SourceFormatter {
    private readonly projectId;
    private readonly project;
    private readonly formattedSourceCodes;
    private readonly scriptMapping;
    private readonly styleMapping;
    constructor();
    static instance({ forceNew }?: {
        forceNew?: boolean;
    }): SourceFormatter;
    private onUISourceCodeRemoved;
    discardFormattedUISourceCode(formattedUISourceCode: Workspace.UISourceCode.UISourceCode): Promise<Workspace.UISourceCode.UISourceCode | null>;
    private discardFormatData;
    hasFormatted(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    getOriginalUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): Workspace.UISourceCode.UISourceCode;
    format(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<SourceFormatData>;
}
