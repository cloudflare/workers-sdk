export declare type FinishCallback = (err: Error) => void;
export declare class Throttler {
    #private;
    constructor(timeout: number);
    private processCompleted;
    private processCompletedForTests;
    get process(): (() => (Promise<unknown>)) | null;
    private onTimeout;
    schedule(process: () => (Promise<unknown>), asSoonAsPossible?: boolean): Promise<void>;
    private innerSchedule;
    private clearTimeout;
    private setTimeout;
    private getTime;
}
