import type * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import type * as TextUtils from '../text_utils/text_utils.js';
export declare class PlatformFileSystem {
    private readonly pathInternal;
    private readonly typeInternal;
    constructor(path: Platform.DevToolsPath.UrlString, type: string);
    getMetadata(_path: Platform.DevToolsPath.EncodedPathString): Promise<{
        modificationTime: Date;
        size: number;
    } | null>;
    initialFilePaths(): Platform.DevToolsPath.EncodedPathString[];
    initialGitFolders(): Platform.DevToolsPath.EncodedPathString[];
    path(): Platform.DevToolsPath.UrlString;
    embedderPath(): Platform.DevToolsPath.RawPathString;
    type(): string;
    createFile(_path: Platform.DevToolsPath.EncodedPathString, _name: Platform.DevToolsPath.RawPathString | null): Promise<Platform.DevToolsPath.EncodedPathString | null>;
    deleteFile(_path: Platform.DevToolsPath.EncodedPathString): Promise<boolean>;
    requestFileBlob(_path: Platform.DevToolsPath.EncodedPathString): Promise<Blob | null>;
    requestFileContent(_path: Platform.DevToolsPath.EncodedPathString): Promise<TextUtils.ContentProvider.DeferredContent>;
    setFileContent(_path: Platform.DevToolsPath.EncodedPathString, _content: string, _isBase64: boolean): void;
    renameFile(_path: Platform.DevToolsPath.EncodedPathString, _newName: Platform.DevToolsPath.RawPathString, callback: (arg0: boolean, arg1?: string | undefined) => void): void;
    addExcludedFolder(_path: Platform.DevToolsPath.EncodedPathString): void;
    removeExcludedFolder(_path: Platform.DevToolsPath.EncodedPathString): void;
    fileSystemRemoved(): void;
    isFileExcluded(_folderPath: Platform.DevToolsPath.EncodedPathString): boolean;
    excludedFolders(): Set<Platform.DevToolsPath.EncodedPathString>;
    searchInPath(_query: string, _progress: Common.Progress.Progress): Promise<string[]>;
    indexContent(progress: Common.Progress.Progress): void;
    mimeFromPath(_path: Platform.DevToolsPath.UrlString): string;
    canExcludeFolder(_path: Platform.DevToolsPath.EncodedPathString): boolean;
    contentType(_path: string): Common.ResourceType.ResourceType;
    tooltipForURL(_url: Platform.DevToolsPath.UrlString): string;
    supportsAutomapping(): boolean;
}
