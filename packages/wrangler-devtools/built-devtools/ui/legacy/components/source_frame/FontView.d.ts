import * as TextUtils from '../../../../models/text_utils/text_utils.js';
import * as UI from '../../legacy.js';
export declare class FontView extends UI.View.SimpleView {
    private readonly url;
    private readonly mimeType;
    private readonly contentProvider;
    private readonly mimeTypeLabel;
    fontPreviewElement: HTMLElement | null;
    private dummyElement;
    fontStyleElement: HTMLStyleElement | null;
    private inResize;
    constructor(mimeType: string, contentProvider: TextUtils.ContentProvider.ContentProvider);
    toolbarItems(): Promise<UI.Toolbar.ToolbarItem[]>;
    private onFontContentLoaded;
    private createContentIfNeeded;
    wasShown(): void;
    onResize(): void;
    private measureElement;
    updateFontPreviewSize(): void;
}
