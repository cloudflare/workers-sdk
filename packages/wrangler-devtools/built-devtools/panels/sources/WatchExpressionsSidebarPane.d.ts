import * as Common from '../../core/common/common.js';
import * as ObjectUI from '../../ui/legacy/components/object_ui/object_ui.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class WatchExpressionsSidebarPane extends UI.ThrottledWidget.ThrottledWidget implements UI.ActionRegistration.ActionDelegate, UI.Toolbar.ItemsProvider, UI.ContextMenu.Provider {
    private watchExpressions;
    private emptyElement;
    private readonly watchExpressionsSetting;
    private readonly addButton;
    private readonly refreshButton;
    private readonly treeOutline;
    private readonly expandController;
    private readonly linkifier;
    private constructor();
    static instance(): WatchExpressionsSidebarPane;
    toolbarItems(): UI.Toolbar.ToolbarItem[];
    focus(): void;
    hasExpressions(): boolean;
    private saveExpressions;
    private addButtonClicked;
    doUpdate(): Promise<void>;
    private createWatchExpression;
    private watchExpressionUpdated;
    private contextMenu;
    private populateContextMenu;
    private deleteAllButtonClicked;
    private focusAndAddExpressionToWatch;
    handleAction(_context: UI.Context.Context, _actionId: string): boolean;
    appendApplicableItems(event: Event, contextMenu: UI.ContextMenu.ContextMenu, target: Object): void;
    wasShown(): void;
}
export declare class WatchExpression extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private treeElementInternal;
    private nameElement;
    private valueElement;
    private expressionInternal;
    private readonly expandController;
    private element;
    private editing;
    private linkifier;
    private textPrompt?;
    private result?;
    private preventClickTimeout?;
    private resizeObserver?;
    constructor(expression: string | null, expandController: ObjectUI.ObjectPropertiesSection.ObjectPropertiesSectionsTreeExpandController, linkifier: Components.Linkifier.Linkifier);
    treeElement(): UI.TreeOutline.TreeElement;
    expression(): string | null;
    update(): void;
    startEditing(): void;
    isEditing(): boolean;
    private finishEditing;
    private dblClickOnWatchExpression;
    private updateExpression;
    private deleteWatchExpression;
    private createWatchExpression;
    private createWatchExpressionHeader;
    private createWatchExpressionTreeElement;
    private onSectionClick;
    private promptKeyDown;
    populateContextMenu(contextMenu: UI.ContextMenu.ContextMenu, event: Event): void;
    private copyValueButtonClicked;
    private static readonly watchObjectGroupId;
}
declare const enum Events {
    ExpressionUpdated = "ExpressionUpdated"
}
declare type EventTypes = {
    [Events.ExpressionUpdated]: WatchExpression;
};
export {};
