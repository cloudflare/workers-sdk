import type * as TextUtils from '../../../../models/text_utils/text_utils.js';
import * as UI from '../../legacy.js';
import type { SourceFrameOptions } from './SourceFrame.js';
import { SourceFrameImpl } from './SourceFrame.js';
export declare class ResourceSourceFrame extends SourceFrameImpl {
    private readonly givenContentType;
    private readonly resourceInternal;
    constructor(resource: TextUtils.ContentProvider.ContentProvider, givenContentType: string, options?: SourceFrameOptions);
    static createSearchableView(resource: TextUtils.ContentProvider.ContentProvider, contentType: string, autoPrettyPrint?: boolean): UI.Widget.Widget;
    protected getContentType(): string;
    get resource(): TextUtils.ContentProvider.ContentProvider;
    protected populateTextAreaContextMenu(contextMenu: UI.ContextMenu.ContextMenu, lineNumber: number, columnNumber: number): void;
}
export declare class SearchableContainer extends UI.Widget.VBox {
    private readonly sourceFrame;
    constructor(resource: TextUtils.ContentProvider.ContentProvider, contentType: string, autoPrettyPrint?: boolean);
    revealPosition(lineNumber: number, columnNumber?: number): Promise<void>;
}
