import * as SDK from '../../core/sdk/sdk.js';
import type * as Workspace from '../../models/workspace/workspace.js';
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import type * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import { Plugin } from './Plugin.js';
export declare function cssBindings(): CodeMirror.Extension;
export declare class CSSPlugin extends Plugin implements SDK.TargetManager.SDKModelObserver<SDK.CSSModel.CSSModel> {
    #private;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode, _transformer?: SourceFrame.SourceFrame.Transformer);
    static accepts(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    modelAdded(cssModel: SDK.CSSModel.CSSModel): void;
    modelRemoved(cssModel: SDK.CSSModel.CSSModel): void;
    editorExtension(): CodeMirror.Extension;
}
