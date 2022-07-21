import type { AnimationGroup } from './AnimationModel.js';
export declare class AnimationGroupPreviewUI {
    #private;
    element: HTMLDivElement;
    constructor(model: AnimationGroup);
    private groupDuration;
    removeButton(): Element;
    replay(): void;
    private render;
}
