import { DataGridNode } from './DataGrid.js';
declare type ShowMoreDataGridNodeCallback = (arg0: number, arg1: number) => Promise<void>;
export declare class ShowMoreDataGridNode extends DataGridNode<ShowMoreDataGridNode> {
    private readonly callback;
    private startPosition;
    private endPosition;
    private readonly chunkSize;
    showNext: HTMLButtonElement;
    showAll: HTMLButtonElement;
    showLast: HTMLButtonElement;
    selectable: boolean;
    private hasCells?;
    constructor(callback: ShowMoreDataGridNodeCallback, startPosition: number, endPosition: number, chunkSize: number);
    private showNextChunk;
    private showAllInternal;
    private showLastChunk;
    private updateLabels;
    createCells(element: Element): void;
    createCell(columnIdentifier: string): HTMLElement;
    setStartPosition(from: number): void;
    setEndPosition(to: number): void;
    nodeSelfHeight(): number;
    dispose(): void;
}
export {};
