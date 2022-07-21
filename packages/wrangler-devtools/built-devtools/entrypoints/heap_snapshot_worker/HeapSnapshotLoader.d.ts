import { JSHeapSnapshot } from './HeapSnapshot.js';
import type { HeapSnapshotWorkerDispatcher } from './HeapSnapshotWorkerDispatcher.js';
export declare class HeapSnapshotLoader {
    #private;
    constructor(dispatcher: HeapSnapshotWorkerDispatcher);
    dispose(): void;
    close(): void;
    buildSnapshot(): JSHeapSnapshot;
    write(chunk: string): void;
}
