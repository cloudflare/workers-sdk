import type * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
export interface ChunkedReader {
    fileSize(): number;
    loadedSize(): number;
    fileName(): string;
    cancel(): void;
    error(): DOMError | null;
}
export declare class ChunkedFileReader implements ChunkedReader {
    #private;
    constructor(file: File, chunkSize: number, chunkTransferredCallback?: ((arg0: ChunkedReader) => void));
    read(output: Common.StringOutputStream.OutputStream): Promise<boolean>;
    cancel(): void;
    loadedSize(): number;
    fileSize(): number;
    fileName(): string;
    error(): DOMException | null;
    private decompressStream;
    private onChunkLoaded;
    private decodeChunkBuffer;
    private finishRead;
    private loadChunk;
    private onError;
}
export declare class FileOutputStream implements Common.StringOutputStream.OutputStream {
    #private;
    constructor();
    open(fileName: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString): Promise<boolean>;
    write(data: string): Promise<void>;
    close(): Promise<void>;
    private onAppendDone;
}
