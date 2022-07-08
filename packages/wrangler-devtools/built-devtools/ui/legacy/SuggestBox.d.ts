import type * as TextUtils from '../../models/text_utils/text_utils.js';
import { AnchorBehavior } from './GlassPane.js';
import type { ListDelegate } from './ListControl.js';
export interface SuggestBoxDelegate {
    applySuggestion(suggestion: Suggestion | null, isIntermediateSuggestion?: boolean): void;
    /**
     * acceptSuggestion will be always called after call to applySuggestion with isIntermediateSuggestion being equal to false.
     */
    acceptSuggestion(): void;
    /**
     * Called to obtain the element whose aria-controls property should reference this SuggestBox.
     */
    ariaControlledBy(): Element;
}
export declare class SuggestBox implements ListDelegate<Suggestion> {
    private readonly suggestBoxDelegate;
    private readonly maxItemsHeight;
    private rowHeight;
    private userEnteredText;
    private readonly defaultSelectionIsDimmed;
    private onlyCompletion;
    private readonly items;
    private readonly list;
    element: HTMLDivElement;
    private readonly glassPane;
    constructor(suggestBoxDelegate: SuggestBoxDelegate, maxItemsHeight?: number);
    visible(): boolean;
    setPosition(anchorBox: AnchorBox): void;
    setAnchorBehavior(behavior: AnchorBehavior): void;
    private updateMaxSize;
    private maxWidth;
    private show;
    hide(): void;
    private applySuggestion;
    acceptSuggestion(): boolean;
    createElementForItem(item: Suggestion): Element;
    heightForItem(_item: Suggestion): number;
    isItemSelectable(_item: Suggestion): boolean;
    selectedItemChanged(from: Suggestion | null, to: Suggestion | null, fromElement: Element | null, toElement: Element | null): void;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    private onClick;
    private canShowBox;
    updateSuggestions(anchorBox: AnchorBox, completions: Suggestion[], selectHighestPriority: boolean, canShowForSingleItem: boolean, userEnteredText: string): void;
    keyPressed(event: KeyboardEvent): boolean;
    enterKeyPressed(): boolean;
}
export interface Suggestion {
    text: string;
    title?: string;
    subtitle?: string;
    iconType?: string;
    priority?: number;
    isSecondary?: boolean;
    subtitleRenderer?: (() => Element);
    selectionRange?: {
        startColumn: number;
        endColumn: number;
    };
    hideGhostText?: boolean;
    iconElement?: HTMLElement;
}
export declare type Suggestions = Suggestion[];
export interface AutocompleteConfig {
    substituteRangeCallback?: ((arg0: number, arg1: number) => TextUtils.TextRange.TextRange | null);
    tooltipCallback?: ((arg0: number, arg1: number) => Promise<Element | null>);
    suggestionsCallback?: ((arg0: TextUtils.TextRange.TextRange, arg1: TextUtils.TextRange.TextRange, arg2?: boolean | undefined) => Promise<Suggestion[]> | null);
    isWordChar?: ((arg0: string) => boolean);
    anchorBehavior?: AnchorBehavior;
}
