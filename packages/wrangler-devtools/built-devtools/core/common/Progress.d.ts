export declare class Progress {
    setTotalWork(totalWork: number): void;
    setTitle(title: string): void;
    setWorked(worked: number, title?: string): void;
    incrementWorked(worked?: number): void;
    done(): void;
    isCanceled(): boolean;
}
export declare class CompositeProgress {
    #private;
    readonly parent: Progress;
    constructor(parent: Progress);
    childDone(): void;
    createSubProgress(weight?: number): SubProgress;
    update(): void;
}
export declare class SubProgress implements Progress {
    #private;
    constructor(composite: CompositeProgress, weight?: number);
    isCanceled(): boolean;
    setTitle(title: string): void;
    done(): void;
    setTotalWork(totalWork: number): void;
    setWorked(worked: number, title?: string): void;
    incrementWorked(worked?: number): void;
    getWeight(): number;
    getWorked(): number;
    getTotalWork(): number;
}
export declare class ProgressProxy implements Progress {
    #private;
    constructor(delegate?: Progress | null, doneCallback?: (() => void));
    isCanceled(): boolean;
    setTitle(title: string): void;
    done(): void;
    setTotalWork(totalWork: number): void;
    setWorked(worked: number, title?: string): void;
    incrementWorked(worked?: number): void;
}
