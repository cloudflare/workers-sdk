import * as Common from '../../core/common/common.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type { ChunkedReader } from './FileUtils.js';
export declare class TempFile {
    #private;
    constructor();
    write(pieces: (string | Blob)[]): void;
    read(): Promise<string | null>;
    size(): number;
    readRange(startOffset?: number, endOffset?: number): Promise<string | null>;
    copyToOutputStream(outputStream: Common.StringOutputStream.OutputStream, progress?: ((arg0: ChunkedReader) => void)): Promise<DOMError | null>;
    remove(): void;
}
export declare class TempFileBackingStorage implements SDK.TracingModel.BackingStorage {
    #private;
    constructor();
    appendString(string: string): void;
    appendAccessibleString(string: string): () => Promise<string | null>;
    private flush;
    finishWriting(): void;
    reset(): void;
    writeToStream(outputStream: Common.StringOutputStream.OutputStream): Promise<DOMError | null>;
}
