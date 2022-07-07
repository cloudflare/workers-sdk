import type { Event, ObjectSnapshot } from './TracingModel.js';
import { TracingModel } from './TracingModel.js';
export declare class FilmStripModel {
    #private;
    constructor(tracingModel: TracingModel, zeroTime?: number);
    reset(tracingModel: TracingModel, zeroTime?: number): void;
    frames(): Frame[];
    zeroTime(): number;
    spanTime(): number;
    frameByTimestamp(timestamp: number): Frame | null;
}
export declare class Frame {
    #private;
    timestamp: number;
    index: number;
    constructor(model: FilmStripModel, timestamp: number, index: number);
    static fromEvent(model: FilmStripModel, event: Event, index: number): Frame;
    static fromSnapshot(model: FilmStripModel, snapshot: ObjectSnapshot, index: number): Frame;
    model(): FilmStripModel;
    imageDataPromise(): Promise<string | null>;
}
