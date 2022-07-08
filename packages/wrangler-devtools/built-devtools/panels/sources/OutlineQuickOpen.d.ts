import * as QuickOpen from '../../ui/legacy/components/quick_open/quick_open.js';
export declare class OutlineQuickOpen extends QuickOpen.FilteredListWidget.Provider {
    private items;
    private active;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): OutlineQuickOpen;
    attach(): void;
    private didBuildOutlineChunk;
    itemCount(): number;
    itemKeyAt(itemIndex: number): string;
    itemScoreAt(itemIndex: number, query: string): number;
    renderItem(itemIndex: number, query: string, titleElement: Element, _subtitleElement: Element): void;
    selectItem(itemIndex: number | null, _promptValue: string): void;
    private currentUISourceCode;
    notFoundText(): string;
}
