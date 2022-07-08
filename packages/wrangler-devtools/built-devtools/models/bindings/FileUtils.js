/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Workspace from '../workspace/workspace.js';
export class ChunkedFileReader {
    #file;
    #fileSizeInternal;
    #loadedSizeInternal;
    #streamReader;
    #chunkSize;
    #chunkTransferredCallback;
    #decoder;
    #isCanceled;
    #errorInternal;
    #transferFinished;
    #output;
    #reader;
    constructor(file, chunkSize, chunkTransferredCallback) {
        this.#file = file;
        this.#fileSizeInternal = file.size;
        this.#loadedSizeInternal = 0;
        this.#chunkSize = chunkSize;
        this.#chunkTransferredCallback = chunkTransferredCallback;
        this.#decoder = new TextDecoder();
        this.#isCanceled = false;
        this.#errorInternal = null;
        this.#streamReader = null;
    }
    async read(output) {
        if (this.#chunkTransferredCallback) {
            this.#chunkTransferredCallback(this);
        }
        if (this.#file?.type.endsWith('gzip')) {
            const stream = this.decompressStream(this.#file.stream());
            this.#streamReader = stream.getReader();
        }
        else {
            this.#reader = new FileReader();
            this.#reader.onload = this.onChunkLoaded.bind(this);
            this.#reader.onerror = this.onError.bind(this);
        }
        this.#output = output;
        void this.loadChunk();
        return new Promise(resolve => {
            this.#transferFinished = resolve;
        });
    }
    cancel() {
        this.#isCanceled = true;
    }
    loadedSize() {
        return this.#loadedSizeInternal;
    }
    fileSize() {
        return this.#fileSizeInternal;
    }
    fileName() {
        if (!this.#file) {
            return '';
        }
        return this.#file.name;
    }
    error() {
        return this.#errorInternal;
    }
    // Decompress gzip natively thanks to https://wicg.github.io/compression/
    decompressStream(stream) {
        const ds = new DecompressionStream('gzip');
        const decompressionStream = stream.pipeThrough(ds);
        return decompressionStream;
    }
    onChunkLoaded(event) {
        if (this.#isCanceled) {
            return;
        }
        const eventTarget = event.target;
        if (eventTarget.readyState !== FileReader.DONE) {
            return;
        }
        if (!this.#reader) {
            return;
        }
        const buffer = this.#reader.result;
        this.#loadedSizeInternal += buffer.byteLength;
        const endOfFile = this.#loadedSizeInternal === this.#fileSizeInternal;
        void this.decodeChunkBuffer(buffer, endOfFile);
    }
    async decodeChunkBuffer(buffer, endOfFile) {
        if (!this.#output) {
            return;
        }
        const decodedString = this.#decoder.decode(buffer, { stream: !endOfFile });
        await this.#output.write(decodedString);
        if (this.#isCanceled) {
            return;
        }
        if (this.#chunkTransferredCallback) {
            this.#chunkTransferredCallback(this);
        }
        if (endOfFile) {
            this.finishRead();
            return;
        }
        void this.loadChunk();
    }
    finishRead() {
        if (!this.#output) {
            return;
        }
        this.#file = null;
        this.#reader = null;
        void this.#output.close();
        this.#transferFinished(!this.#errorInternal);
    }
    async loadChunk() {
        if (!this.#output || !this.#file) {
            return;
        }
        if (this.#streamReader) {
            const { value, done } = await this.#streamReader.read();
            if (done || !value) {
                return this.finishRead();
            }
            void this.decodeChunkBuffer(value.buffer, false);
        }
        if (this.#reader) {
            const chunkStart = this.#loadedSizeInternal;
            const chunkEnd = Math.min(this.#fileSizeInternal, chunkStart + this.#chunkSize);
            const nextPart = this.#file.slice(chunkStart, chunkEnd);
            this.#reader.readAsArrayBuffer(nextPart);
        }
    }
    onError(event) {
        const eventTarget = event.target;
        this.#errorInternal = eventTarget.error;
        this.#transferFinished(false);
    }
}
export class FileOutputStream {
    #writeCallbacks;
    #fileName;
    #closed;
    constructor() {
        this.#writeCallbacks = [];
    }
    async open(fileName) {
        this.#closed = false;
        this.#writeCallbacks = [];
        this.#fileName = fileName;
        const saveResponse = await Workspace.FileManager.FileManager.instance().save(this.#fileName, '', true);
        if (saveResponse) {
            Workspace.FileManager.FileManager.instance().addEventListener(Workspace.FileManager.Events.AppendedToURL, this.onAppendDone, this);
        }
        return Boolean(saveResponse);
    }
    write(data) {
        return new Promise(resolve => {
            this.#writeCallbacks.push(resolve);
            Workspace.FileManager.FileManager.instance().append(this.#fileName, data);
        });
    }
    async close() {
        this.#closed = true;
        if (this.#writeCallbacks.length) {
            return;
        }
        Workspace.FileManager.FileManager.instance().removeEventListener(Workspace.FileManager.Events.AppendedToURL, this.onAppendDone, this);
        Workspace.FileManager.FileManager.instance().close(this.#fileName);
    }
    onAppendDone(event) {
        if (event.data !== this.#fileName) {
            return;
        }
        const writeCallback = this.#writeCallbacks.shift();
        if (writeCallback) {
            writeCallback();
        }
        if (this.#writeCallbacks.length) {
            return;
        }
        if (!this.#closed) {
            return;
        }
        Workspace.FileManager.FileManager.instance().removeEventListener(Workspace.FileManager.Events.AppendedToURL, this.onAppendDone, this);
        Workspace.FileManager.FileManager.instance().close(this.#fileName);
    }
}
//# sourceMappingURL=FileUtils.js.map