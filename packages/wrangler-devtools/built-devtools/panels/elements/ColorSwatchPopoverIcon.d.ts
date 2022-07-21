import * as ColorPicker from '../../ui/legacy/components/color_picker/color_picker.js';
import * as InlineEditor from '../../ui/legacy/components/inline_editor/inline_editor.js';
import type { StylePropertiesSection } from './StylePropertiesSection.js';
import type { StylePropertyTreeElement } from './StylePropertyTreeElement.js';
import type { StylesSidebarPane } from './StylesSidebarPane.js';
export declare class BezierPopoverIcon {
    private treeElement;
    private readonly swatchPopoverHelper;
    private swatch;
    private readonly boundBezierChanged;
    private readonly boundOnScroll;
    private bezierEditor?;
    private scrollerElement?;
    private originalPropertyText?;
    constructor(treeElement: StylePropertyTreeElement, swatchPopoverHelper: InlineEditor.SwatchPopoverHelper.SwatchPopoverHelper, swatch: InlineEditor.Swatches.BezierSwatch);
    private iconClick;
    private bezierChanged;
    private onScroll;
    private onPopoverHidden;
}
export declare class ColorSwatchPopoverIcon {
    private treeElement;
    private readonly swatchPopoverHelper;
    private swatch;
    private contrastInfo;
    private readonly boundSpectrumChanged;
    private readonly boundOnScroll;
    private spectrum?;
    private scrollerElement?;
    private originalPropertyText?;
    constructor(treeElement: StylePropertyTreeElement, swatchPopoverHelper: InlineEditor.SwatchPopoverHelper.SwatchPopoverHelper, swatch: InlineEditor.ColorSwatch.ColorSwatch);
    private generateCSSVariablesPalette;
    setContrastInfo(contrastInfo: ColorPicker.ContrastInfo.ContrastInfo): void;
    private iconClick;
    showPopover(): void;
    private spectrumResized;
    private spectrumChanged;
    private onScroll;
    private onPopoverHidden;
}
export declare class ShadowSwatchPopoverHelper {
    private treeElement;
    private readonly swatchPopoverHelper;
    private readonly shadowSwatch;
    private iconElement;
    private readonly boundShadowChanged;
    private readonly boundOnScroll;
    private cssShadowEditor?;
    private scrollerElement?;
    private originalPropertyText?;
    constructor(treeElement: StylePropertyTreeElement, swatchPopoverHelper: InlineEditor.SwatchPopoverHelper.SwatchPopoverHelper, shadowSwatch: InlineEditor.Swatches.CSSShadowSwatch);
    private iconClick;
    showPopover(): void;
    private shadowChanged;
    private onScroll;
    private onPopoverHidden;
}
export declare class FontEditorSectionManager {
    private readonly treeElementMap;
    private readonly swatchPopoverHelper;
    private readonly section;
    private parentPane;
    private fontEditor;
    private scrollerElement;
    private readonly boundFontChanged;
    private readonly boundOnScroll;
    private readonly boundResized;
    constructor(swatchPopoverHelper: InlineEditor.SwatchPopoverHelper.SwatchPopoverHelper, section: StylePropertiesSection);
    private fontChanged;
    private updateFontProperty;
    private fontEditorResized;
    private fixIndex;
    private createPropertyValueMap;
    registerFontProperty(treeElement: StylePropertyTreeElement): void;
    showPopover(iconElement: Element, parentPane: StylesSidebarPane): Promise<void>;
    private onScroll;
    private onPopoverHidden;
    private static readonly treeElementSymbol;
}
