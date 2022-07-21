import type * as HeapSnapshotModel from '../../models/heap_snapshot_model/heap_snapshot_model.js';
export declare class HeapSnapshotWorkerDispatcher {
    #private;
    constructor(globalObject: Worker, postMessage: Function);
    sendEvent(name: string, data: any): void;
    dispatchMessage({ data }: {
        data: HeapSnapshotModel.HeapSnapshotModel.WorkerCommand;
    }): void;
}
