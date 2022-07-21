import * as TextUtils from '../../../../models/text_utils/text_utils.js';
import * as UI from '../../legacy.js';
export declare class ImageView extends UI.View.SimpleView {
    private url;
    private parsedURL;
    private readonly mimeType;
    private readonly contentProvider;
    private uiSourceCode;
    private readonly sizeLabel;
    private readonly dimensionsLabel;
    private readonly aspectRatioLabel;
    private readonly mimeTypeLabel;
    private readonly container;
    private imagePreviewElement;
    private cachedContent?;
    constructor(mimeType: string, contentProvider: TextUtils.ContentProvider.ContentProvider);
    toolbarItems(): Promise<UI.Toolbar.ToolbarItem[]>;
    wasShown(): void;
    disposeView(): void;
    private workingCopyCommitted;
    private updateContentIfNeeded;
    private contextMenu;
    private copyImageAsDataURL;
    private copyImageURL;
    private saveImage;
    private openInNewTab;
    private handleDrop;
}
