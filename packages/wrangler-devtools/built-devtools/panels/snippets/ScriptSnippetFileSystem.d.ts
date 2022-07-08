import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as Persistence from '../../models/persistence/persistence.js';
import type * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Workspace from '../../models/workspace/workspace.js';
export declare class SnippetFileSystem extends Persistence.PlatformFileSystem.PlatformFileSystem {
    private readonly lastSnippetIdentifierSetting;
    private readonly snippetsSetting;
    constructor();
    initialFilePaths(): Platform.DevToolsPath.EncodedPathString[];
    createFile(_path: Platform.DevToolsPath.EncodedPathString, _name: Platform.DevToolsPath.RawPathString | null): Promise<Platform.DevToolsPath.EncodedPathString | null>;
    deleteFile(path: Platform.DevToolsPath.EncodedPathString): Promise<boolean>;
    requestFileContent(path: Platform.DevToolsPath.EncodedPathString): Promise<TextUtils.ContentProvider.DeferredContent>;
    setFileContent(path: Platform.DevToolsPath.EncodedPathString, content: string, _isBase64: boolean): Promise<boolean>;
    renameFile(path: Platform.DevToolsPath.EncodedPathString, newName: Platform.DevToolsPath.RawPathString, callback: (arg0: boolean, arg1?: string | undefined) => void): void;
    searchInPath(query: string, _progress: Common.Progress.Progress): Promise<string[]>;
    mimeFromPath(_path: Platform.DevToolsPath.UrlString): string;
    contentType(_path: string): Common.ResourceType.ResourceType;
    tooltipForURL(url: Platform.DevToolsPath.UrlString): string;
    supportsAutomapping(): boolean;
}
export declare function evaluateScriptSnippet(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
export declare function isSnippetsUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
export declare function isSnippetsProject(project: Workspace.Workspace.Project): boolean;
export declare function findSnippetsProject(): Workspace.Workspace.Project;
export interface Snippet {
    name: Platform.DevToolsPath.RawPathString;
    content: string;
}
