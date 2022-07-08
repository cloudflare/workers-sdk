import type * as Workspace from '../../models/workspace/workspace.js';
import * as UI from '../../ui/legacy/legacy.js';
import { Plugin } from './Plugin.js';
export declare class SnippetsPlugin extends Plugin {
    static accepts(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    rightToolbarItems(): Promise<UI.Toolbar.ToolbarItem[]>;
}
