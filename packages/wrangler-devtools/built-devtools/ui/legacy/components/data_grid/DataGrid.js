/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *        notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *        notice, this list of conditions and the following disclaimer in the
 *        documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.         IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable rulesdir/check_license_header */
import * as Common from '../../../../core/common/common.js';
import * as i18n from '../../../../core/i18n/i18n.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as UI from '../../legacy.js';
import dataGridStyles from './dataGrid.css.js';
const UIStrings = {
    /**
    *@description Accessible text label for expandible nodes in datagrids
    */
    expanded: 'expanded',
    /**
    *@description accessible name for expandible nodes in datagrids
    */
    collapsed: 'collapsed',
    /**
    *@description Accessible text for datagrid
    *@example {Coverage grid} PH1
    *@example {expanded} PH2
    */
    sRowS: '{PH1} Row {PH2}',
    /**
    *@description Number of rows in a grid
    *@example {1} PH1
    */
    rowsS: 'Rows: {PH1}',
    /**
    * @description Default Accessible Text for a Datagrid. This text is read to the user by a
    * screenreader when they navigate to a table structure. The placeholders tell the user something
    * brief about the table contents i.e. the topic and how much data is in it.
    * @example {Network} PH1
    * @example {Rows: 27} PH2
    */
    sSUseTheUpAndDownArrowKeysTo: '{PH1} {PH2}, use the up and down arrow keys to navigate and interact with the rows of the table; Use browse mode to read cell by cell.',
    /**
    *@description A context menu item in the Data Grid of a data grid
    */
    sortByString: 'Sort By',
    /**
    *@description A context menu item in data grids to reset the columns to their default weight
    */
    resetColumns: 'Reset Columns',
    /**
    *@description A context menu item in data grids to list header options.
    */
    headerOptions: 'Header Options',
    /**
    *@description Text to refresh the page
    */
    refresh: 'Refresh',
    /**
    *@description A context menu item in the Data Grid of a data grid
    */
    addNew: 'Add new',
    /**
    *@description A context menu item in the Data Grid of a data grid
    *@example {pattern} PH1
    */
    editS: 'Edit "{PH1}"',
    /**
    *@description Text to delete something
    */
    delete: 'Delete',
    /**
    *@description Depth of a node in the datagrid
    *@example {1} PH1
    */
    levelS: 'level {PH1}',
    /**
    *@description Text exposed to screen readers on checked items.
    */
    checked: 'checked',
    /**
     *@description Accessible text indicating an empty row is created.
     */
    emptyRowCreated: 'An empty table row has been created. You may double click or use context menu to edit.',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/components/data_grid/DataGrid.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const elementToLongTextMap = new WeakMap();
const nodeToColumnIdMap = new WeakMap();
const elementToSortIconMap = new WeakMap();
const elementToPreferedWidthMap = new WeakMap();
const elementToPositionMap = new WeakMap();
const elementToIndexMap = new WeakMap();
export class DataGridImpl extends Common.ObjectWrapper.ObjectWrapper {
    element;
    displayName;
    editCallback;
    deleteCallback;
    refreshCallback;
    dataTableHeaders;
    scrollContainerInternal;
    dataContainerInternal;
    dataTable;
    inline;
    columnsArray;
    columns;
    visibleColumnsArray;
    cellClass;
    dataTableHeadInternal;
    headerRow;
    dataTableColumnGroup;
    dataTableBody;
    topFillerRow;
    bottomFillerRow;
    editing;
    selectedNode;
    expandNodesWhenArrowing;
    indentWidth;
    resizers;
    columnWidthsInitialized;
    cornerWidth;
    resizeMethod;
    headerContextMenuCallback;
    rowContextMenuCallback;
    elementToDataGridNode;
    disclosureColumnId;
    sortColumnCell;
    rootNodeInternal;
    editingNode;
    columnWeightsSetting;
    creationNode;
    currentResizer;
    dataGridWidget;
    constructor(dataGridParameters) {
        super();
        const { displayName, columns: columnsArray, editCallback, deleteCallback, refreshCallback } = dataGridParameters;
        this.element = document.createElement('div');
        this.element.classList.add('data-grid');
        this.element.tabIndex = 0;
        this.element.addEventListener('keydown', this.keyDown.bind(this), false);
        this.element.addEventListener('contextmenu', this.contextMenu.bind(this), true);
        this.element.addEventListener('focusin', event => {
            this.updateGridAccessibleNameOnFocus();
            event.consume(true);
        });
        this.element.addEventListener('focusout', event => {
            this.updateGridAccessibleName(/* text */ '');
            event.consume(true);
        });
        UI.ARIAUtils.markAsApplication(this.element);
        this.displayName = displayName;
        this.editCallback = editCallback;
        this.deleteCallback = deleteCallback;
        this.refreshCallback = refreshCallback;
        this.dataTableHeaders = {};
        this.dataContainerInternal = this.element.createChild('div', 'data-container');
        this.dataTable = this.dataContainerInternal.createChild('table', 'data');
        this.scrollContainerInternal = this.dataContainerInternal;
        // FIXME: Add a createCallback which is different from editCallback and has different
        // behavior when creating a new node.
        if (editCallback) {
            this.dataTable.addEventListener('dblclick', this.ondblclick.bind(this), false);
        }
        this.dataTable.addEventListener('mousedown', this.mouseDownInDataTable.bind(this));
        this.dataTable.addEventListener('click', this.clickInDataTable.bind(this), true);
        this.inline = false;
        this.columnsArray = [];
        this.columns = {};
        this.visibleColumnsArray = columnsArray;
        columnsArray.forEach(column => this.innerAddColumn(column));
        this.cellClass = null;
        this.dataTableColumnGroup = this.dataTable.createChild('colgroup');
        this.dataTableHeadInternal = this.dataTable.createChild('thead');
        this.headerRow = this.dataTableHeadInternal.createChild('tr');
        this.dataTableBody = this.dataTable.createChild('tbody');
        this.topFillerRow = this.dataTableBody.createChild('tr', 'data-grid-filler-row revealed');
        UI.ARIAUtils.setHidden(this.topFillerRow, true);
        this.bottomFillerRow = this.dataTableBody.createChild('tr', 'data-grid-filler-row revealed');
        UI.ARIAUtils.setHidden(this.bottomFillerRow, true);
        this.setVerticalPadding(0, 0, true);
        this.refreshHeader();
        this.editing = false;
        this.selectedNode = null;
        this.expandNodesWhenArrowing = false;
        this.setRootNode(new DataGridNode());
        this.setHasSelection(false);
        this.indentWidth = 15;
        this.resizers = [];
        this.columnWidthsInitialized = false;
        this.cornerWidth = CornerWidth;
        this.resizeMethod = ResizeMethod.Nearest;
        this.headerContextMenuCallback = null;
        this.rowContextMenuCallback = null;
        this.elementToDataGridNode = new WeakMap();
    }
    firstSelectableNode() {
        let firstSelectableNode = this.rootNodeInternal;
        while (firstSelectableNode && !firstSelectableNode.selectable) {
            firstSelectableNode = firstSelectableNode.traverseNextNode(true) || undefined;
        }
        return firstSelectableNode;
    }
    lastSelectableNode() {
        let lastSelectableNode = this.rootNodeInternal;
        let iterator = this.rootNodeInternal;
        while (iterator) {
            if (iterator.selectable) {
                lastSelectableNode = iterator;
            }
            iterator = iterator.traverseNextNode(true) || undefined;
        }
        return lastSelectableNode;
    }
    setElementContent(element, value) {
        const columnId = this.columnIdFromNode(element);
        if (!columnId) {
            return;
        }
        const column = this.columns[columnId];
        const parentElement = element.parentElement;
        let gridNode;
        if (parentElement) {
            gridNode = this.elementToDataGridNode.get(parentElement);
        }
        if (column.dataType === DataType.Boolean) {
            DataGridImpl.setElementBoolean(element, Boolean(value), gridNode);
        }
        else if (value !== null) {
            DataGridImpl.setElementText(element, value, Boolean(column.longText), gridNode);
        }
    }
    static setElementText(element, newText, longText, gridNode) {
        if (longText && newText.length > 1000) {
            element.textContent = Platform.StringUtilities.trimEndWithMaxLength(newText, 1000);
            UI.Tooltip.Tooltip.install(element, newText);
            elementToLongTextMap.set(element, newText);
        }
        else {
            element.textContent = newText;
            UI.Tooltip.Tooltip.install(element, '');
            elementToLongTextMap.delete(element);
        }
        if (gridNode) {
            DataGridImpl.updateNodeAccessibleText(gridNode);
        }
    }
    static setElementBoolean(element, value, gridNode) {
        element.textContent = value ? '\u2713' : '';
        UI.Tooltip.Tooltip.install(element, '');
        if (gridNode) {
            DataGridImpl.updateNodeAccessibleText(gridNode);
        }
    }
    static updateNodeAccessibleText(gridNode) {
        let accessibleText = '';
        let colElement = gridNode.elementInternal?.children[0] || null;
        if (!colElement) {
            return;
        }
        while (colElement && !colElement.classList.contains('corner')) {
            let columnClass = null;
            for (const cssClass of colElement.classList) {
                if (cssClass.includes('-column')) {
                    columnClass = cssClass.substring(0, cssClass.indexOf('-column'));
                    break;
                }
            }
            if (columnClass && gridNode.dataGrid) {
                const colName = gridNode.dataGrid.columns[columnClass];
                if (colName) {
                    accessibleText += `${colName.title}: ${colElement.textContent}, `;
                }
            }
            colElement = colElement.nextElementSibling;
        }
        if (accessibleText.length > 0) {
            // Trim off comma and space at the end.
            accessibleText = accessibleText.substring(0, accessibleText.length - 2);
        }
        gridNode.nodeAccessibleText = accessibleText;
    }
    setStriped(isStriped) {
        this.element.classList.toggle('striped-data-grid', isStriped);
    }
    setFocusable(focusable) {
        this.element.tabIndex = focusable ? 0 : -1;
        if (focusable === false) {
            UI.ARIAUtils.removeRole(this.element);
        }
    }
    setHasSelection(hasSelected) {
        // 'no-selection' class causes datagrid to have a focus-indicator border
        this.element.classList.toggle('no-selection', !hasSelected);
    }
    updateGridAccessibleName(text) {
        // Update the label with the provided text or the current selected node
        const accessibleText = (this.selectedNode && this.selectedNode.existingElement()) ? this.selectedNode.nodeAccessibleText : '';
        if (this.element === Platform.DOMUtilities.deepActiveElement(this.element.ownerDocument)) {
            // Only alert if the datagrid has focus
            UI.ARIAUtils.alert(text ? text : accessibleText);
        }
    }
    updateGridAccessibleNameOnFocus() {
        // When a grid gets focus
        // 1) If an item is selected - Read the content of the row
        let accessibleText;
        if (this.selectedNode && this.selectedNode.existingElement()) {
            // TODO(l10n): Don't concatenate strings.
            let expandText = '';
            if (this.selectedNode.hasChildren()) {
                expandText = this.selectedNode.expanded ? i18nString(UIStrings.expanded) : i18nString(UIStrings.collapsed);
            }
            const rowHeader = i18nString(UIStrings.sRowS, { PH1: this.displayName, PH2: expandText });
            accessibleText = `${rowHeader} ${this.selectedNode.nodeAccessibleText}`;
        }
        else {
            // 2) If there is no selected item - Read the name of the grid and give instructions
            if (!this.rootNodeInternal) {
                return;
            }
            const children = this.enumerateChildren(this.rootNodeInternal, [], 1);
            const items = i18nString(UIStrings.rowsS, { PH1: children.length });
            accessibleText = i18nString(UIStrings.sSUseTheUpAndDownArrowKeysTo, { PH1: this.displayName, PH2: items });
        }
        UI.ARIAUtils.alert(accessibleText);
    }
    innerAddColumn(column, position) {
        column.defaultWeight = column.weight;
        const columnId = column.id;
        if (columnId in this.columns) {
            this.innerRemoveColumn(columnId);
        }
        if (position === undefined) {
            position = this.columnsArray.length;
        }
        this.columnsArray.splice(position, 0, column);
        this.columns[columnId] = column;
        if (column.disclosure) {
            this.disclosureColumnId = columnId;
        }
        const cell = document.createElement('th');
        cell.className = columnId + '-column';
        nodeToColumnIdMap.set(cell, columnId);
        this.dataTableHeaders[columnId] = cell;
        const div = document.createElement('div');
        if (column.titleDOMFragment) {
            div.appendChild(column.titleDOMFragment);
        }
        else {
            div.textContent = column.title || null;
        }
        cell.appendChild(div);
        if (column.sort) {
            cell.classList.add(column.sort);
            this.sortColumnCell = cell;
        }
        if (column.sortable) {
            cell.addEventListener('click', this.clickInHeaderCell.bind(this), false);
            cell.classList.add('sortable');
            const icon = UI.Icon.Icon.create('', 'sort-order-icon');
            cell.createChild('div', 'sort-order-icon-container').appendChild(icon);
            elementToSortIconMap.set(cell, icon);
        }
    }
    addColumn(column, position) {
        this.innerAddColumn(column, position);
    }
    innerRemoveColumn(columnId) {
        const column = this.columns[columnId];
        if (!column) {
            return;
        }
        delete this.columns[columnId];
        const index = this.columnsArray.findIndex(columnConfig => columnConfig.id === columnId);
        this.columnsArray.splice(index, 1);
        const cell = this.dataTableHeaders[columnId];
        if (cell.parentElement) {
            cell.parentElement.removeChild(cell);
        }
        delete this.dataTableHeaders[columnId];
    }
    removeColumn(columnId) {
        this.innerRemoveColumn(columnId);
    }
    setCellClass(cellClass) {
        this.cellClass = cellClass;
    }
    refreshHeader() {
        this.dataTableColumnGroup.removeChildren();
        this.headerRow.removeChildren();
        this.topFillerRow.removeChildren();
        this.bottomFillerRow.removeChildren();
        for (let i = 0; i < this.visibleColumnsArray.length; ++i) {
            const column = this.visibleColumnsArray[i];
            const columnId = column.id;
            const dataColumn = this.dataTableColumnGroup.createChild('col');
            if (column.width) {
                dataColumn.style.width = column.width;
            }
            this.headerRow.appendChild(this.dataTableHeaders[columnId]);
            const topFillerRowCell = this.topFillerRow.createChild('th', 'top-filler-td');
            topFillerRowCell.textContent = column.title || null;
            topFillerRowCell.scope = 'col';
            const bottomFillerRowChild = this.bottomFillerRow.createChild('td', 'bottom-filler-td');
            nodeToColumnIdMap.set(bottomFillerRowChild, columnId);
        }
        const headerCorner = this.headerRow.createChild('th', 'corner');
        UI.ARIAUtils.setHidden(headerCorner, true);
        const topFillerRowCornerCell = this.topFillerRow.createChild('th', 'corner');
        topFillerRowCornerCell.classList.add('top-filler-td');
        topFillerRowCornerCell.scope = 'col';
        this.bottomFillerRow.createChild('td', 'corner').classList.add('bottom-filler-td');
        this.dataTableColumnGroup.createChild('col', 'corner');
    }
    setVerticalPadding(top, bottom, isConstructorTime = false) {
        const topPx = top + 'px';
        const bottomPx = (top || bottom) ? bottom + 'px' : 'auto';
        if (this.topFillerRow.style.height === topPx && this.bottomFillerRow.style.height === bottomPx) {
            return;
        }
        this.topFillerRow.style.height = topPx;
        this.bottomFillerRow.style.height = bottomPx;
        if (!isConstructorTime) {
            this.dispatchEventToListeners(Events.PaddingChanged);
        }
    }
    setRootNode(rootNode) {
        if (this.rootNodeInternal) {
            this.rootNodeInternal.removeChildren();
            this.rootNodeInternal.dataGrid = null;
            this.rootNodeInternal.isRoot = false;
        }
        this.rootNodeInternal = rootNode;
        rootNode.isRoot = true;
        rootNode.setHasChildren(false);
        rootNode.expandedInternal = true;
        rootNode.revealedInternal = true;
        rootNode.selectable = false;
        rootNode.dataGrid = this;
    }
    rootNode() {
        let rootNode = this.rootNodeInternal;
        if (!rootNode) {
            rootNode = new DataGridNode();
            this.setRootNode(rootNode);
        }
        return rootNode;
    }
    ondblclick(event) {
        if (this.editing || this.editingNode) {
            return;
        }
        const columnId = this.columnIdFromNode(event.target);
        if (!columnId || !this.columns[columnId].editable) {
            return;
        }
        this.startEditing(event.target);
    }
    startEditingColumnOfDataGridNode(node, cellIndex) {
        this.editing = true;
        this.editingNode = node;
        this.editingNode.select();
        const editingNodeElement = this.editingNode.element();
        if (!editingNodeElement) {
            return;
        }
        const element = editingNodeElement.children[cellIndex];
        const elementLongText = elementToLongTextMap.get(element);
        if (elementLongText) {
            element.textContent = elementLongText;
        }
        const column = this.visibleColumnsArray[cellIndex];
        if (column.dataType === DataType.Boolean) {
            const checkboxLabel = UI.UIUtils.CheckboxLabel.create(undefined, node.data[column.id]);
            UI.ARIAUtils.setAccessibleName(checkboxLabel, column.title || '');
            let hasChanged = false;
            checkboxLabel.style.height = '100%';
            const checkboxElement = checkboxLabel.checkboxElement;
            checkboxElement.classList.add('inside-datagrid');
            const initialValue = checkboxElement.checked;
            checkboxElement.addEventListener('change', () => {
                hasChanged = true;
                this.editingCommitted(element, checkboxElement.checked, initialValue, undefined, 'forward');
            }, false);
            checkboxElement.addEventListener('keydown', event => {
                if (event.key === 'Tab') {
                    event.consume(true);
                    hasChanged = true;
                    return this.editingCommitted(element, checkboxElement.checked, initialValue, undefined, event.shiftKey ? 'backward' : 'forward');
                }
                if (event.key === ' ') {
                    event.consume(true);
                    checkboxElement.checked = !checkboxElement.checked;
                }
                else if (event.key === 'Enter') {
                    event.consume(true);
                    hasChanged = true;
                    this.editingCommitted(element, checkboxElement.checked, initialValue, undefined, 'forward');
                }
            }, false);
            checkboxElement.addEventListener('blur', () => {
                if (hasChanged) {
                    return;
                }
                this.editingCommitted(element, checkboxElement.checked, checkboxElement.checked, undefined, 'next');
            }, false);
            element.innerHTML = '';
            element.appendChild(checkboxLabel);
            checkboxElement.focus();
        }
        else {
            UI.InplaceEditor.InplaceEditor.startEditing(element, this.startEditingConfig(element));
            const componentSelection = element.getComponentSelection();
            if (componentSelection) {
                componentSelection.selectAllChildren(element);
            }
        }
    }
    startEditingNextEditableColumnOfDataGridNode(node, columnIdentifier) {
        const column = this.columns[columnIdentifier];
        const cellIndex = this.visibleColumnsArray.indexOf(column);
        const nextEditableColumn = this.nextEditableColumn(cellIndex);
        if (nextEditableColumn !== -1) {
            this.startEditingColumnOfDataGridNode(node, nextEditableColumn);
        }
    }
    startEditing(target) {
        const element = UI.UIUtils.enclosingNodeOrSelfWithNodeName(target, 'td');
        if (!element) {
            return;
        }
        this.editingNode = this.dataGridNodeFromNode(target);
        if (!this.editingNode) {
            if (!this.creationNode) {
                return;
            }
            this.editingNode = this.creationNode;
        }
        // Force editing the 1st column when editing the creation node
        if (this.editingNode instanceof CreationDataGridNode && this.editingNode.isCreationNode) {
            this.startEditingColumnOfDataGridNode(this.editingNode, this.nextEditableColumn(-1));
            return;
        }
        const columnId = this.columnIdFromNode(target);
        if (!columnId) {
            return;
        }
        const column = this.columns[columnId];
        const cellIndex = this.visibleColumnsArray.indexOf(column);
        if (this.editingNode) {
            this.startEditingColumnOfDataGridNode(this.editingNode, cellIndex);
        }
    }
    renderInline() {
        this.element.classList.add('inline');
        this.cornerWidth = 0;
        this.inline = true;
        this.updateWidths();
    }
    startEditingConfig(_element) {
        return new UI.InplaceEditor.Config(this.editingCommitted.bind(this), this.editingCancelled.bind(this));
    }
    editingCommitted(element, newText, oldText, context, moveDirection) {
        const columnId = this.columnIdFromNode(element);
        if (!columnId) {
            this.editingCancelled(element);
            return;
        }
        const column = this.columns[columnId];
        const cellIndex = this.visibleColumnsArray.indexOf(column);
        if (!this.editingNode) {
            return;
        }
        const valueBeforeEditing = (this.editingNode.data[columnId] === null ? '' : this.editingNode.data[columnId]);
        const currentEditingNode = this.editingNode;
        function moveToNextIfNeeded(wasChange) {
            if (!moveDirection) {
                return;
            }
            if (moveDirection === 'forward') {
                const firstEditableColumn = this.nextEditableColumn(-1);
                const isCreationNode = currentEditingNode instanceof CreationDataGridNode && currentEditingNode.isCreationNode;
                if (isCreationNode && cellIndex === firstEditableColumn && !wasChange) {
                    return;
                }
                const nextEditableColumn = this.nextEditableColumn(cellIndex);
                if (nextEditableColumn !== -1) {
                    this.startEditingColumnOfDataGridNode(currentEditingNode, nextEditableColumn);
                    return;
                }
                const nextDataGridNode = currentEditingNode.traverseNextNode(true, null, true);
                if (nextDataGridNode) {
                    this.startEditingColumnOfDataGridNode(nextDataGridNode, firstEditableColumn);
                    return;
                }
                if (isCreationNode && wasChange && this.creationNode) {
                    this.addCreationNode(false);
                    this.startEditingColumnOfDataGridNode(this.creationNode, firstEditableColumn);
                    return;
                }
                return;
            }
            if (moveDirection === 'backward') {
                const prevEditableColumn = this.nextEditableColumn(cellIndex, true);
                if (prevEditableColumn !== -1) {
                    this.startEditingColumnOfDataGridNode(currentEditingNode, prevEditableColumn);
                    return;
                }
                const lastEditableColumn = this.nextEditableColumn(this.visibleColumnsArray.length, true);
                const nextDataGridNode = currentEditingNode.traversePreviousNode(true, true);
                if (nextDataGridNode) {
                    this.startEditingColumnOfDataGridNode(nextDataGridNode, lastEditableColumn);
                }
                return;
            }
        }
        // Show trimmed text after editing.
        this.setElementContent(element, newText);
        if (valueBeforeEditing === newText) {
            this.editingCancelled(element);
            moveToNextIfNeeded.call(this, false);
            return;
        }
        // Update the text in the datagrid that we typed
        this.editingNode.data[columnId] = newText;
        if (!this.editCallback) {
            return;
        }
        // Make the callback - expects an editing node (table row), the column number that is being edited,
        // the text that used to be there, and the new text.
        this.editCallback(this.editingNode, columnId, valueBeforeEditing, newText);
        if (this.editingNode instanceof CreationDataGridNode && this.editingNode.isCreationNode) {
            this.addCreationNode(false);
        }
        this.editingCancelled(element);
        moveToNextIfNeeded.call(this, true);
    }
    editingCancelled(_element) {
        this.editing = false;
        this.editingNode = null;
    }
    nextEditableColumn(cellIndex, moveBackward) {
        const increment = moveBackward ? -1 : 1;
        const columns = this.visibleColumnsArray;
        for (let i = cellIndex + increment; (i >= 0) && (i < columns.length); i += increment) {
            if (columns[i].editable) {
                return i;
            }
        }
        return -1;
    }
    sortColumnId() {
        if (!this.sortColumnCell) {
            return null;
        }
        return nodeToColumnIdMap.get(this.sortColumnCell) || null;
    }
    sortOrder() {
        if (!this.sortColumnCell || this.sortColumnCell.classList.contains(Order.Ascending)) {
            return Order.Ascending;
        }
        if (this.sortColumnCell.classList.contains(Order.Descending)) {
            return Order.Descending;
        }
        return null;
    }
    isSortOrderAscending() {
        return !this.sortColumnCell || this.sortColumnCell.classList.contains(Order.Ascending);
    }
    autoSizeWidths(widths, minPercent, maxPercent) {
        if (minPercent) {
            minPercent = Math.min(minPercent, Math.floor(100 / widths.length));
        }
        let totalWidth = 0;
        for (let i = 0; i < widths.length; ++i) {
            totalWidth += widths[i];
        }
        let totalPercentWidth = 0;
        for (let i = 0; i < widths.length; ++i) {
            let width = Math.round(100 * widths[i] / totalWidth);
            if (minPercent && width < minPercent) {
                width = minPercent;
            }
            else if (maxPercent && width > maxPercent) {
                width = maxPercent;
            }
            totalPercentWidth += width;
            widths[i] = width;
        }
        let recoupPercent = totalPercentWidth - 100;
        while (minPercent && recoupPercent > 0) {
            for (let i = 0; i < widths.length; ++i) {
                if (widths[i] > minPercent) {
                    --widths[i];
                    --recoupPercent;
                    if (!recoupPercent) {
                        break;
                    }
                }
            }
        }
        while (maxPercent && recoupPercent < 0) {
            for (let i = 0; i < widths.length; ++i) {
                if (widths[i] < maxPercent) {
                    ++widths[i];
                    ++recoupPercent;
                    if (!recoupPercent) {
                        break;
                    }
                }
            }
        }
        return widths;
    }
    /**
     * The range of |minPercent| and |maxPercent| is [0, 100].
     */
    autoSizeColumns(minPercent, maxPercent, maxDescentLevel) {
        let widths = [];
        for (let i = 0; i < this.columnsArray.length; ++i) {
            widths.push((this.columnsArray[i].title || '').length);
        }
        maxDescentLevel = maxDescentLevel || 0;
        if (!this.rootNodeInternal) {
            return;
        }
        const children = this.enumerateChildren(this.rootNodeInternal, [], maxDescentLevel + 1);
        for (let i = 0; i < children.length; ++i) {
            const node = children[i];
            for (let j = 0; j < this.columnsArray.length; ++j) {
                const text = String(node.data[this.columnsArray[j].id]);
                if (text.length > widths[j]) {
                    widths[j] = text.length;
                }
            }
        }
        widths = this.autoSizeWidths(widths, minPercent, maxPercent);
        for (let i = 0; i < this.columnsArray.length; ++i) {
            this.columnsArray[i].weight = widths[i];
        }
        this.columnWidthsInitialized = false;
        this.updateWidths();
    }
    enumerateChildren(rootNode, result, maxLevel) {
        if (!rootNode.isRoot) {
            result.push(rootNode);
        }
        if (!maxLevel) {
            return [];
        }
        for (let i = 0; i < rootNode.children.length; ++i) {
            this.enumerateChildren(rootNode.children[i], result, maxLevel - 1);
        }
        return result;
    }
    onResize() {
        this.updateWidths();
    }
    // Updates the widths of the table, including the positions of the column
    // resizers.
    //
    // IMPORTANT: This function MUST be called once after the element of the
    // DataGrid is attached to its parent element and every subsequent time the
    // width of the parent element is changed in order to make it possible to
    // resize the columns.
    //
    // If this function is not called after the DataGrid is attached to its
    // parent element, then the DataGrid's columns will not be resizable.
    updateWidths() {
        // Do not attempt to use offsetes if we're not attached to the document tree yet.
        if (!this.columnWidthsInitialized && this.element.offsetWidth) {
            // Give all the columns initial widths now so that during a resize,
            // when the two columns that get resized get a percent value for
            // their widths, all the other columns already have percent values
            // for their widths.
            // Use container size to avoid changes of table width caused by change of column widths.
            const tableWidth = this.element.offsetWidth - this.cornerWidth;
            const cells = this.dataTableHeadInternal.rows[0].cells;
            const numColumns = cells.length - 1; // Do not process corner column.
            for (let i = 0; i < numColumns; i++) {
                const column = this.visibleColumnsArray[i];
                if (!column.weight) {
                    column.weight = 100 * this.getPreferredWidth(i) / tableWidth || 10;
                }
            }
            this.columnWidthsInitialized = true;
        }
        this.applyColumnWeights();
    }
    indexOfVisibleColumn(columnId) {
        return this.visibleColumnsArray.findIndex(column => column.id === columnId);
    }
    setName(name) {
        this.columnWeightsSetting =
            Common.Settings.Settings.instance().createSetting('dataGrid-' + name + '-columnWeights', {});
        this.loadColumnWeights();
    }
    resetColumnWeights() {
        for (const column of this.columnsArray) {
            if (!column.defaultWeight) {
                continue;
            }
            column.weight = column.defaultWeight;
        }
        this.applyColumnWeights();
        this.saveColumnWeights();
    }
    loadColumnWeights() {
        if (!this.columnWeightsSetting) {
            return;
        }
        const weights = this.columnWeightsSetting.get();
        for (let i = 0; i < this.columnsArray.length; ++i) {
            const column = this.columnsArray[i];
            const weight = weights[column.id];
            if (weight) {
                column.weight = weight;
            }
        }
        this.applyColumnWeights();
    }
    saveColumnWeights() {
        if (!this.columnWeightsSetting) {
            return;
        }
        const weights = {};
        for (let i = 0; i < this.columnsArray.length; ++i) {
            const column = this.columnsArray[i];
            weights[column.id] = column.weight;
        }
        this.columnWeightsSetting.set(weights);
    }
    wasShown() {
        this.loadColumnWeights();
    }
    willHide() {
    }
    getPreferredWidth(columnIndex) {
        return elementToPreferedWidthMap.get(this.dataTableColumnGroup.children[columnIndex]) ||
            this.dataTableHeadInternal.rows[0].cells[columnIndex].offsetWidth;
    }
    applyColumnWeights() {
        let tableWidth = this.element.offsetWidth - this.cornerWidth;
        if (tableWidth <= 0) {
            return;
        }
        let sumOfWeights = 0.0;
        const fixedColumnWidths = [];
        for (let i = 0; i < this.visibleColumnsArray.length; ++i) {
            const column = this.visibleColumnsArray[i];
            if (column.fixedWidth) {
                const width = this.getPreferredWidth(i);
                fixedColumnWidths[i] = width;
                tableWidth -= width;
            }
            else {
                sumOfWeights += (this.visibleColumnsArray[i].weight || 0);
            }
        }
        let sum = 0;
        let lastOffset = 0;
        const minColumnWidth = 14; // px
        for (let i = 0; i < this.visibleColumnsArray.length; ++i) {
            const column = this.visibleColumnsArray[i];
            let width;
            if (column.fixedWidth) {
                width = fixedColumnWidths[i];
            }
            else {
                sum += (column.weight || 0);
                const offset = (sum * tableWidth / sumOfWeights) | 0;
                width = Math.max(offset - lastOffset, minColumnWidth);
                lastOffset = offset;
            }
            this.setPreferredWidth(i, width);
        }
        this.positionResizers();
    }
    setColumnsVisiblity(columnsVisibility) {
        this.visibleColumnsArray = [];
        for (const column of this.columnsArray) {
            if (columnsVisibility.has(column.id)) {
                this.visibleColumnsArray.push(column);
            }
        }
        this.refreshHeader();
        this.applyColumnWeights();
        const nodes = this.enumerateChildren(this.rootNode(), [], -1);
        for (const node of nodes) {
            node.refresh();
        }
    }
    get scrollContainer() {
        return this.scrollContainerInternal;
    }
    positionResizers() {
        const headerTableColumns = this.dataTableColumnGroup.children;
        const numColumns = headerTableColumns.length - 1; // Do not process corner column.
        const left = [];
        const resizers = this.resizers;
        while (resizers.length > numColumns - 1) {
            const resizer = resizers.pop();
            if (resizer) {
                resizer.remove();
            }
        }
        for (let i = 0; i < numColumns - 1; i++) {
            // Get the width of the cell in the first (and only) row of the
            // header table in order to determine the width of the column, since
            // it is not possible to query a column for its width.
            left[i] = (left[i - 1] || 0) + this.dataTableHeadInternal.rows[0].cells[i].offsetWidth;
        }
        // Make n - 1 resizers for n columns.
        for (let i = 0; i < numColumns - 1; i++) {
            let resizer = resizers[i];
            if (!resizer) {
                // This is the first call to updateWidth, so the resizers need
                // to be created.
                resizer = document.createElement('div');
                elementToIndexMap.set(resizer, i);
                resizer.classList.add('data-grid-resizer');
                // This resizer is associated with the column to its right.
                UI.UIUtils.installDragHandle(resizer, this.startResizerDragging.bind(this), this.resizerDragging.bind(this), this.endResizerDragging.bind(this), 'col-resize');
                this.element.appendChild(resizer);
                resizers.push(resizer);
            }
            if (elementToPositionMap.get(resizer) !== left[i]) {
                elementToPositionMap.set(resizer, left[i]);
                resizer.style.left = left[i] + 'px';
            }
        }
    }
    addCreationNode(hasChildren) {
        if (this.creationNode) {
            this.creationNode.makeNormal();
        }
        const emptyData = {};
        for (const column in this.columns) {
            emptyData[column] = null;
        }
        this.creationNode = new CreationDataGridNode(emptyData, hasChildren);
        UI.ARIAUtils.alert(i18nString(UIStrings.emptyRowCreated));
        this.rootNode().appendChild(this.creationNode);
    }
    keyDown(event) {
        if (!(event instanceof KeyboardEvent)) {
            return;
        }
        if (event.shiftKey || event.metaKey || event.ctrlKey || this.editing || UI.UIUtils.isEditing()) {
            return;
        }
        let handled = false;
        let nextSelectedNode;
        if (!this.selectedNode) {
            // Select the first or last node based on the arrow key direction
            if (event.key === 'ArrowUp' && !event.altKey) {
                nextSelectedNode = this.lastSelectableNode();
            }
            else if (event.key === 'ArrowDown' && !event.altKey) {
                nextSelectedNode = this.firstSelectableNode();
            }
            handled = nextSelectedNode ? true : false;
        }
        else if (event.key === 'ArrowUp' && !event.altKey) {
            nextSelectedNode = this.selectedNode.traversePreviousNode(true);
            while (nextSelectedNode && !nextSelectedNode.selectable) {
                nextSelectedNode = nextSelectedNode.traversePreviousNode(true);
            }
            handled = nextSelectedNode ? true : false;
        }
        else if (event.key === 'ArrowDown' && !event.altKey) {
            nextSelectedNode = this.selectedNode.traverseNextNode(true);
            while (nextSelectedNode && !nextSelectedNode.selectable) {
                nextSelectedNode = nextSelectedNode.traverseNextNode(true);
            }
            handled = nextSelectedNode ? true : false;
        }
        else if (event.key === 'ArrowLeft') {
            if (this.selectedNode.expanded) {
                if (event.altKey) {
                    this.selectedNode.collapseRecursively();
                }
                else {
                    this.selectedNode.collapse();
                }
                handled = true;
            }
            else if (this.selectedNode.parent && !this.selectedNode.parent.isRoot) {
                handled = true;
                if (this.selectedNode.parent.selectable) {
                    nextSelectedNode = this.selectedNode.parent;
                    handled = nextSelectedNode ? true : false;
                }
                else if (this.selectedNode.parent) {
                    this.selectedNode.parent.collapse();
                }
            }
        }
        else if (event.key === 'ArrowRight') {
            if (!this.selectedNode.revealed) {
                this.selectedNode.reveal();
                handled = true;
            }
            else if (this.selectedNode.hasChildren()) {
                handled = true;
                if (this.selectedNode.expanded) {
                    nextSelectedNode = this.selectedNode.children[0];
                    handled = nextSelectedNode ? true : false;
                }
                else {
                    if (event.altKey) {
                        this.selectedNode.expandRecursively();
                    }
                    else {
                        this.selectedNode.expand();
                    }
                }
            }
        }
        else if (event.keyCode === 8 || event.keyCode === 46) {
            if (this.deleteCallback) {
                handled = true;
                this.deleteCallback(this.selectedNode);
            }
        }
        else if (event.key === 'Enter') {
            if (this.editCallback) {
                handled = true;
                const selectedNodeElement = this.selectedNode.element();
                if (!selectedNodeElement) {
                    return;
                }
                this.startEditing(selectedNodeElement.children[this.nextEditableColumn(-1)]);
            }
            else {
                this.dispatchEventToListeners(Events.OpenedNode, this.selectedNode);
            }
        }
        if (nextSelectedNode) {
            nextSelectedNode.reveal();
            nextSelectedNode.select();
        }
        if (handled && document.activeElement !== this.element) {
            // crbug.com/1005449, crbug.com/1329956
            // navigational or delete keys pressed but current DataGrid panel has lost focus;
            // re-focus to ensure subsequent keydowns can be registered within this DataGrid
            this.element.focus();
        }
        if (handled) {
            event.consume(true);
        }
    }
    updateSelectionBeforeRemoval(root, _onlyAffectsSubtree) {
        let ancestor = this.selectedNode;
        while (ancestor && ancestor !== root) {
            ancestor = ancestor.parent;
        }
        // Selection is not in the subtree being deleted.
        if (!ancestor) {
            return;
        }
        let nextSelectedNode;
        // Skip subtree being deleted when looking for the next selectable node.
        for (ancestor = root; ancestor && !ancestor.nextSibling; ancestor = ancestor.parent) {
        }
        if (ancestor) {
            nextSelectedNode = ancestor.nextSibling;
        }
        while (nextSelectedNode && !nextSelectedNode.selectable) {
            nextSelectedNode = nextSelectedNode.traverseNextNode(true);
        }
        const isCreationNode = nextSelectedNode instanceof CreationDataGridNode && nextSelectedNode.isCreationNode;
        if (!nextSelectedNode || isCreationNode) {
            if (!root) {
                return;
            }
            nextSelectedNode = root.traversePreviousNode(true);
            while (nextSelectedNode && !nextSelectedNode.selectable) {
                nextSelectedNode = nextSelectedNode.traversePreviousNode(true);
            }
        }
        if (nextSelectedNode) {
            nextSelectedNode.reveal();
            nextSelectedNode.select();
        }
        else if (this.selectedNode) {
            this.selectedNode.deselect();
        }
    }
    dataGridNodeFromNode(target) {
        const rowElement = UI.UIUtils.enclosingNodeOrSelfWithNodeName(target, 'tr');
        return (rowElement && this.elementToDataGridNode.get(rowElement)) || null;
    }
    columnIdFromNode(target) {
        const cellElement = UI.UIUtils.enclosingNodeOrSelfWithNodeName(target, 'td');
        return (cellElement && nodeToColumnIdMap.get(cellElement)) || null;
    }
    clickInHeaderCell(event) {
        const cell = UI.UIUtils.enclosingNodeOrSelfWithNodeName(event.target, 'th');
        if (!cell) {
            return;
        }
        this.sortByColumnHeaderCell(cell);
    }
    sortByColumnHeaderCell(cell) {
        if (!nodeToColumnIdMap.has(cell) || !cell.classList.contains('sortable')) {
            return;
        }
        let sortOrder = Order.Ascending;
        if ((cell === this.sortColumnCell) && this.isSortOrderAscending()) {
            sortOrder = Order.Descending;
        }
        if (this.sortColumnCell) {
            this.sortColumnCell.classList.remove(Order.Ascending, Order.Descending);
        }
        this.sortColumnCell = cell;
        cell.classList.add(sortOrder);
        const icon = elementToSortIconMap.get(cell);
        if (!icon) {
            return;
        }
        icon.setIconType(sortOrder === Order.Ascending ? 'smallicon-triangle-up' : 'smallicon-triangle-down');
        this.dispatchEventToListeners(Events.SortingChanged);
    }
    markColumnAsSortedBy(columnId, sortOrder) {
        if (this.sortColumnCell) {
            this.sortColumnCell.classList.remove(Order.Ascending, Order.Descending);
        }
        this.sortColumnCell = this.dataTableHeaders[columnId];
        this.sortColumnCell.classList.add(sortOrder);
    }
    headerTableHeader(columnId) {
        return this.dataTableHeaders[columnId];
    }
    mouseDownInDataTable(event) {
        const target = event.target;
        const gridNode = this.dataGridNodeFromNode(target);
        if (!gridNode || !gridNode.selectable || gridNode.isEventWithinDisclosureTriangle(event)) {
            return;
        }
        const columnId = this.columnIdFromNode(target);
        if (columnId && this.columns[columnId].nonSelectable) {
            return;
        }
        if (event.metaKey) {
            if (gridNode.selected) {
                gridNode.deselect();
            }
            else {
                gridNode.select();
            }
        }
        else {
            gridNode.select();
            this.dispatchEventToListeners(Events.OpenedNode, gridNode);
        }
    }
    setHeaderContextMenuCallback(callback) {
        this.headerContextMenuCallback = callback;
    }
    setRowContextMenuCallback(callback) {
        this.rowContextMenuCallback = callback;
    }
    contextMenu(event) {
        if (!(event instanceof MouseEvent)) {
            return;
        }
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        const target = event.target;
        const sortableVisibleColumns = this.visibleColumnsArray.filter(column => {
            return (column.sortable && column.title);
        });
        const sortableHiddenColumns = this.columnsArray.filter(column => sortableVisibleColumns.indexOf(column) === -1 && column.allowInSortByEvenWhenHidden);
        const sortableColumns = [...sortableVisibleColumns, ...sortableHiddenColumns];
        if (sortableColumns.length > 0) {
            const sortMenu = contextMenu.defaultSection().appendSubMenuItem(i18nString(UIStrings.sortByString));
            for (const column of sortableColumns) {
                const headerCell = this.dataTableHeaders[column.id];
                sortMenu.defaultSection().appendItem(column.title, this.sortByColumnHeaderCell.bind(this, headerCell));
            }
        }
        if (target.isSelfOrDescendant(this.dataTableHeadInternal)) {
            if (this.headerContextMenuCallback) {
                this.headerContextMenuCallback(contextMenu);
            }
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.resetColumns), this.resetColumnWeights.bind(this));
            void contextMenu.show();
            return;
        }
        // Add header context menu to a subsection available from the body
        const headerSubMenu = contextMenu.defaultSection().appendSubMenuItem(i18nString(UIStrings.headerOptions));
        if (this.headerContextMenuCallback) {
            this.headerContextMenuCallback(headerSubMenu);
        }
        headerSubMenu.defaultSection().appendItem(i18nString(UIStrings.resetColumns), this.resetColumnWeights.bind(this));
        const isContextMenuKey = (event.button === 0);
        const gridNode = isContextMenuKey ? this.selectedNode : this.dataGridNodeFromNode(target);
        const selectedNodeElement = this.selectedNode && this.selectedNode.existingElement();
        if (isContextMenuKey && selectedNodeElement) {
            const boundingRowRect = selectedNodeElement.getBoundingClientRect();
            if (boundingRowRect) {
                const x = (boundingRowRect.right + boundingRowRect.left) / 2;
                const y = (boundingRowRect.bottom + boundingRowRect.top) / 2;
                contextMenu.setX(x);
                contextMenu.setY(y);
            }
        }
        if (this.refreshCallback && (!gridNode || gridNode !== this.creationNode)) {
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.refresh), this.refreshCallback.bind(this));
        }
        if (gridNode && gridNode.selectable && !gridNode.isEventWithinDisclosureTriangle(event)) {
            if (this.editCallback) {
                if (gridNode === this.creationNode) {
                    const firstEditColumnIndex = this.nextEditableColumn(-1);
                    const tableCellElement = gridNode.element().children[firstEditColumnIndex];
                    contextMenu.defaultSection().appendItem(i18nString(UIStrings.addNew), this.startEditing.bind(this, tableCellElement));
                }
                else if (isContextMenuKey) {
                    const firstEditColumnIndex = this.nextEditableColumn(-1);
                    if (firstEditColumnIndex > -1) {
                        const firstColumn = this.visibleColumnsArray[firstEditColumnIndex];
                        if (firstColumn && firstColumn.editable) {
                            contextMenu.defaultSection().appendItem(i18nString(UIStrings.editS, { PH1: String(firstColumn.title) }), this.startEditingColumnOfDataGridNode.bind(this, gridNode, firstEditColumnIndex));
                        }
                    }
                }
                else {
                    const columnId = this.columnIdFromNode(target);
                    if (columnId && this.columns[columnId].editable) {
                        contextMenu.defaultSection().appendItem(i18nString(UIStrings.editS, { PH1: String(this.columns[columnId].title) }), this.startEditing.bind(this, target));
                    }
                }
            }
            if (this.deleteCallback && gridNode !== this.creationNode) {
                contextMenu.defaultSection().appendItem(i18nString(UIStrings.delete), this.deleteCallback.bind(this, gridNode));
            }
            if (this.rowContextMenuCallback) {
                this.rowContextMenuCallback(contextMenu, gridNode);
            }
        }
        void contextMenu.show();
    }
    clickInDataTable(event) {
        const gridNode = this.dataGridNodeFromNode(event.target);
        if (!gridNode || !gridNode.hasChildren() || !gridNode.isEventWithinDisclosureTriangle(event)) {
            return;
        }
        if (gridNode.expanded) {
            if (event.altKey) {
                gridNode.collapseRecursively();
            }
            else {
                gridNode.collapse();
            }
        }
        else {
            if (event.altKey) {
                gridNode.expandRecursively();
            }
            else {
                gridNode.expand();
            }
        }
    }
    setResizeMethod(method) {
        this.resizeMethod = method;
    }
    startResizerDragging(event) {
        this.currentResizer = event.target;
        return true;
    }
    endResizerDragging() {
        this.currentResizer = null;
        this.saveColumnWeights();
    }
    resizerDragging(event) {
        const resizer = this.currentResizer;
        if (!resizer) {
            return;
        }
        // Constrain the dragpoint to be within the containing div of the
        // datagrid.
        let dragPoint = event.clientX - this.element.totalOffsetLeft();
        let leftEdgeOfPreviousColumn = 0;
        // Constrain the dragpoint to be within the space made up by the
        // column directly to the left and the column directly to the right.
        let leftCellIndex = elementToIndexMap.get(resizer);
        if (leftCellIndex === undefined) {
            return;
        }
        let rightCellIndex = leftCellIndex + 1;
        for (let i = 0; i < leftCellIndex; i++) {
            leftEdgeOfPreviousColumn += this.getPreferredWidth(i);
        }
        // Differences for other resize methods
        if (this.resizeMethod === ResizeMethod.Last) {
            rightCellIndex = this.resizers.length;
        }
        else if (this.resizeMethod === ResizeMethod.First) {
            leftEdgeOfPreviousColumn += this.getPreferredWidth(leftCellIndex) - this.getPreferredWidth(0);
            leftCellIndex = 0;
        }
        const rightEdgeOfNextColumn = leftEdgeOfPreviousColumn + this.getPreferredWidth(leftCellIndex) + this.getPreferredWidth(rightCellIndex);
        // Give each column some padding so that they don't disappear.
        const leftMinimum = leftEdgeOfPreviousColumn + ColumnResizePadding;
        const rightMaximum = rightEdgeOfNextColumn - ColumnResizePadding;
        if (leftMinimum > rightMaximum) {
            return;
        }
        dragPoint = Platform.NumberUtilities.clamp(dragPoint, leftMinimum, rightMaximum);
        const position = (dragPoint - CenterResizerOverBorderAdjustment);
        elementToPositionMap.set(resizer, position);
        resizer.style.left = position + 'px';
        this.setPreferredWidth(leftCellIndex, dragPoint - leftEdgeOfPreviousColumn);
        this.setPreferredWidth(rightCellIndex, rightEdgeOfNextColumn - dragPoint);
        const leftColumn = this.visibleColumnsArray[leftCellIndex];
        const rightColumn = this.visibleColumnsArray[rightCellIndex];
        if (leftColumn.weight && rightColumn.weight) {
            const sumOfWeights = leftColumn.weight + rightColumn.weight;
            const delta = rightEdgeOfNextColumn - leftEdgeOfPreviousColumn;
            leftColumn.weight = (dragPoint - leftEdgeOfPreviousColumn) * sumOfWeights / delta;
            rightColumn.weight = (rightEdgeOfNextColumn - dragPoint) * sumOfWeights / delta;
        }
        this.positionResizers();
        this.updateWidths();
        event.preventDefault();
    }
    setPreferredWidth(columnIndex, width) {
        const dataTableChildElement = this.dataTableColumnGroup.children[columnIndex];
        elementToPreferedWidthMap.set(dataTableChildElement, width);
        dataTableChildElement.style.width = width + 'px';
    }
    columnOffset(columnId) {
        if (!this.element.offsetWidth) {
            return 0;
        }
        for (let i = 1; i < this.visibleColumnsArray.length; ++i) {
            if (columnId === this.visibleColumnsArray[i].id) {
                if (this.resizers[i - 1]) {
                    return elementToPositionMap.get(this.resizers[i - 1]) || 0;
                }
            }
        }
        return 0;
    }
    asWidget() {
        if (!this.dataGridWidget) {
            this.dataGridWidget = new DataGridWidget(this);
        }
        return this.dataGridWidget;
    }
    topFillerRowElement() {
        return this.topFillerRow;
    }
    // Note on the following methods:
    // The header row is a child of the scrollable container, and uses position: sticky
    // so it can visually obscure other elements below it in the grid. We need to manually
    // subtract the header's height when calculating the actual client area in which
    // data rows are visible. However, if a caller has set a different scroll container
    // then we report 0 height and the caller is expected to ensure their chosen scroll
    // container's height matches the visible scrollable data area as seen by the user.
    headerHeightInScroller() {
        return this.scrollContainer === this.dataContainerInternal ? this.headerHeight() : 0;
    }
    headerHeight() {
        return this.dataTableHeadInternal.offsetHeight;
    }
    revealNode(element) {
        element.scrollIntoViewIfNeeded(false);
        // The header row is a child of the scrollable container, and uses position: sticky
        // so scrollIntoViewIfNeeded may place the element behind it. If the element is
        // obscured by the header, adjust the scrollTop so that the element is fully revealed.
        if (element.offsetTop - this.scrollContainer.scrollTop < this.headerHeight()) {
            this.scrollContainer.scrollTop = element.offsetTop - this.headerHeight();
        }
    }
}
// Keep in sync with .data-grid col.corner style rule.
export const CornerWidth = 14;
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["SelectedNode"] = "SelectedNode";
    Events["DeselectedNode"] = "DeselectedNode";
    Events["OpenedNode"] = "OpenedNode";
    Events["SortingChanged"] = "SortingChanged";
    Events["PaddingChanged"] = "PaddingChanged";
})(Events || (Events = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Order;
(function (Order) {
    Order["Ascending"] = "sort-ascending";
    Order["Descending"] = "sort-descending";
})(Order || (Order = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Align;
(function (Align) {
    Align["Center"] = "center";
    Align["Right"] = "right";
})(Align || (Align = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var DataType;
(function (DataType) {
    DataType["String"] = "String";
    DataType["Boolean"] = "Boolean";
})(DataType || (DataType = {}));
export const ColumnResizePadding = 24;
export const CenterResizerOverBorderAdjustment = 3;
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var ResizeMethod;
(function (ResizeMethod) {
    ResizeMethod["Nearest"] = "nearest";
    ResizeMethod["First"] = "first";
    ResizeMethod["Last"] = "last";
})(ResizeMethod || (ResizeMethod = {}));
export class DataGridNode {
    elementInternal;
    expandedInternal;
    selectedInternal;
    dirty;
    inactive;
    key;
    depthInternal;
    revealedInternal;
    attachedInternal;
    savedPosition;
    shouldRefreshChildrenInternal;
    dataInternal;
    hasChildrenInternal;
    children;
    dataGrid;
    parent;
    previousSibling;
    nextSibling;
    disclosureToggleWidth;
    selectable;
    isRoot;
    nodeAccessibleText;
    cellAccessibleTextMap;
    isCreationNode;
    constructor(data, hasChildren) {
        this.elementInternal = null;
        this.expandedInternal = false;
        this.selectedInternal = false;
        this.dirty = false;
        this.inactive = false;
        this.attachedInternal = false;
        this.savedPosition = null;
        this.shouldRefreshChildrenInternal = true;
        this.dataInternal = data || {};
        this.hasChildrenInternal = hasChildren || false;
        this.children = [];
        this.dataGrid = null;
        this.parent = null;
        this.previousSibling = null;
        this.nextSibling = null;
        this.disclosureToggleWidth = 10;
        this.selectable = true;
        this.isRoot = false;
        this.nodeAccessibleText = '';
        this.cellAccessibleTextMap = new Map();
        this.isCreationNode = false;
    }
    element() {
        if (!this.elementInternal) {
            const element = this.createElement();
            this.createCells(element);
        }
        return this.elementInternal;
    }
    createElement() {
        this.elementInternal = document.createElement('tr');
        this.elementInternal.classList.add('data-grid-data-grid-node');
        if (this.dataGrid) {
            this.dataGrid.elementToDataGridNode.set(this.elementInternal, this);
        }
        if (this.hasChildrenInternal) {
            this.elementInternal.classList.add('parent');
        }
        if (this.expanded) {
            this.elementInternal.classList.add('expanded');
        }
        if (this.selected) {
            this.elementInternal.classList.add('selected');
        }
        if (this.revealed) {
            this.elementInternal.classList.add('revealed');
        }
        if (this.dirty) {
            this.elementInternal.classList.add('dirty');
        }
        if (this.inactive) {
            this.elementInternal.classList.add('inactive');
        }
        if (this.isCreationNode) {
            this.elementInternal.classList.add('creation-node');
        }
        return this.elementInternal;
    }
    existingElement() {
        return this.elementInternal || null;
    }
    resetElement() {
        this.elementInternal = null;
    }
    createCells(element) {
        element.removeChildren();
        if (!this.dataGrid || !this.parent) {
            return;
        }
        const columnsArray = this.dataGrid.visibleColumnsArray;
        const accessibleTextArray = [];
        // Add depth if node is part of a tree
        if (this.hasChildrenInternal || !this.parent.isRoot) {
            accessibleTextArray.push(i18nString(UIStrings.levelS, { PH1: this.depth + 1 }));
        }
        for (let i = 0; i < columnsArray.length; ++i) {
            const column = columnsArray[i];
            const cell = element.appendChild(this.createCell(column.id));
            // Add each visibile cell to the node's accessible text by gathering 'Column Title: content'
            if (column.dataType === DataType.Boolean && this.data[column.id] === true) {
                this.setCellAccessibleName(i18nString(UIStrings.checked), cell, column.id);
            }
            accessibleTextArray.push(`${column.title}: ${this.cellAccessibleTextMap.get(column.id) || cell.textContent}`);
        }
        this.nodeAccessibleText = accessibleTextArray.join(', ');
        const cornerCell = this.createTDWithClass('corner');
        UI.ARIAUtils.setHidden(cornerCell, true);
        element.appendChild(cornerCell);
    }
    get data() {
        return this.dataInternal;
    }
    set data(x) {
        this.dataInternal = x || {};
        this.refresh();
    }
    get revealed() {
        if (this.revealedInternal !== undefined) {
            return this.revealedInternal;
        }
        let currentAncestor = this.parent;
        while (currentAncestor && !currentAncestor.isRoot) {
            if (!currentAncestor.expanded) {
                this.revealedInternal = false;
                return false;
            }
            currentAncestor = currentAncestor.parent;
        }
        this.revealed = true;
        return true;
    }
    set revealed(x) {
        if (this.revealedInternal === x) {
            return;
        }
        this.revealedInternal = x;
        if (this.elementInternal) {
            this.elementInternal.classList.toggle('revealed', this.revealedInternal);
        }
        for (let i = 0; i < this.children.length; ++i) {
            this.children[i].revealed = x && this.expanded;
        }
    }
    isDirty() {
        return this.dirty;
    }
    setDirty(dirty) {
        if (this.dirty === dirty) {
            return;
        }
        this.dirty = dirty;
        if (!this.elementInternal) {
            return;
        }
        if (dirty) {
            this.elementInternal.classList.add('dirty');
        }
        else {
            this.elementInternal.classList.remove('dirty');
        }
    }
    isInactive() {
        return this.inactive;
    }
    setInactive(inactive) {
        if (this.inactive === inactive) {
            return;
        }
        this.inactive = inactive;
        if (!this.elementInternal) {
            return;
        }
        if (inactive) {
            this.elementInternal.classList.add('inactive');
        }
        else {
            this.elementInternal.classList.remove('inactive');
        }
    }
    hasChildren() {
        return this.hasChildrenInternal;
    }
    setHasChildren(x) {
        if (this.hasChildrenInternal === x) {
            return;
        }
        this.hasChildrenInternal = x;
        if (!this.elementInternal) {
            return;
        }
        this.elementInternal.classList.toggle('parent', this.hasChildrenInternal);
        this.elementInternal.classList.toggle('expanded', this.hasChildrenInternal && this.expanded);
    }
    get depth() {
        if (this.depthInternal !== undefined) {
            return this.depthInternal;
        }
        if (this.parent && !this.parent.isRoot) {
            this.depthInternal = this.parent.depth + 1;
        }
        else {
            this.depthInternal = 0;
        }
        return this.depthInternal;
    }
    get leftPadding() {
        return this.depth * (this.dataGrid ? this.dataGrid.indentWidth : 1);
    }
    get shouldRefreshChildren() {
        return this.shouldRefreshChildrenInternal;
    }
    set shouldRefreshChildren(x) {
        this.shouldRefreshChildrenInternal = x;
        if (x && this.expanded) {
            this.expand();
        }
    }
    get selected() {
        return this.selectedInternal;
    }
    set selected(x) {
        if (x) {
            this.select();
        }
        else {
            this.deselect();
        }
    }
    get expanded() {
        return this.expandedInternal;
    }
    set expanded(x) {
        if (x) {
            this.expand();
        }
        else {
            this.collapse();
        }
    }
    refresh() {
        if (!this.dataGrid) {
            this.elementInternal = null;
        }
        if (!this.elementInternal) {
            return;
        }
        this.createCells(this.elementInternal);
    }
    createTDWithClass(className) {
        const cell = document.createElement('td');
        if (className) {
            cell.className = className;
        }
        const cellClass = this.dataGrid ? this.dataGrid.cellClass : null;
        if (cellClass) {
            cell.classList.add(cellClass);
        }
        return cell;
    }
    createTD(columnId) {
        const cell = this.createTDWithClass(columnId + '-column');
        nodeToColumnIdMap.set(cell, columnId);
        if (this.dataGrid) {
            const alignment = this.dataGrid.columns[columnId].align;
            if (alignment) {
                cell.classList.add(alignment);
            }
            if (columnId === this.dataGrid.disclosureColumnId) {
                cell.classList.add('disclosure');
                if (this.leftPadding) {
                    cell.style.setProperty('padding-left', this.leftPadding + 'px');
                }
            }
        }
        return cell;
    }
    createCell(columnId) {
        const cell = this.createTD(columnId);
        const data = this.data[columnId];
        if (data instanceof Node) {
            cell.appendChild(data);
        }
        else if (data !== null && this.dataGrid) {
            this.dataGrid.setElementContent(cell, data);
        }
        return cell;
    }
    setCellAccessibleName(name, cell, columnId) {
        this.cellAccessibleTextMap.set(columnId, name);
        // Mark all direct children of cell as hidden so cell name is properly announced
        for (let i = 0; i < cell.children.length; i++) {
            UI.ARIAUtils.markAsHidden(cell.children[i]);
        }
        UI.ARIAUtils.setAccessibleName(cell, name);
    }
    nodeSelfHeight() {
        return 20;
    }
    appendChild(child) {
        this.insertChild(child, this.children.length);
    }
    resetNode(onlyCaches) {
        // @TODO(allada) This is a hack to make sure ViewportDataGrid can clean up these caches. Try Not To Use.
        delete this.depthInternal;
        delete this.revealedInternal;
        if (onlyCaches) {
            return;
        }
        if (this.previousSibling) {
            this.previousSibling.nextSibling = this.nextSibling;
        }
        if (this.nextSibling) {
            this.nextSibling.previousSibling = this.previousSibling;
        }
        this.dataGrid = null;
        this.parent = null;
        this.nextSibling = null;
        this.previousSibling = null;
        this.attachedInternal = false;
    }
    insertChild(child, index) {
        if (!child) {
            throw 'insertChild: Node can\'t be undefined or null.';
        }
        if (child.parent === this) {
            const currentIndex = this.children.indexOf(child);
            if (currentIndex < 0) {
                console.assert(false, 'Inconsistent DataGrid state');
            }
            if (currentIndex === index) {
                return;
            }
            if (currentIndex < index) {
                --index;
            }
        }
        child.remove();
        this.children.splice(index, 0, child);
        this.setHasChildren(true);
        child.parent = this;
        child.dataGrid = this.dataGrid;
        child.recalculateSiblings(index);
        child.shouldRefreshChildrenInternal = true;
        let current = child.children[0];
        while (current) {
            current.resetNode(true);
            current.dataGrid = this.dataGrid;
            current.attachedInternal = false;
            current.shouldRefreshChildrenInternal = true;
            current = current.traverseNextNode(false, child, true);
        }
        if (this.expanded) {
            child.attach();
        }
        if (!this.revealed) {
            child.revealed = false;
        }
    }
    remove() {
        if (this.parent) {
            this.parent.removeChild(this);
        }
    }
    removeChild(child) {
        if (!child) {
            throw 'removeChild: Node can\'t be undefined or null.';
        }
        if (child.parent !== this) {
            throw 'removeChild: Node is not a child of this node.';
        }
        if (this.dataGrid) {
            this.dataGrid.updateSelectionBeforeRemoval(child, false);
        }
        child.detach();
        child.resetNode();
        Platform.ArrayUtilities.removeElement(this.children, child, true);
        if (this.children.length <= 0) {
            this.setHasChildren(false);
        }
    }
    removeChildren() {
        if (this.dataGrid) {
            this.dataGrid.updateSelectionBeforeRemoval(this, true);
        }
        for (let i = 0; i < this.children.length; ++i) {
            const child = this.children[i];
            child.detach();
            child.resetNode();
        }
        this.children = [];
        this.setHasChildren(false);
    }
    recalculateSiblings(myIndex) {
        if (!this.parent) {
            return;
        }
        const previousChild = this.parent.children[myIndex - 1] || null;
        if (previousChild) {
            previousChild.nextSibling = this;
        }
        this.previousSibling = previousChild;
        const nextChild = this.parent.children[myIndex + 1] || null;
        if (nextChild) {
            nextChild.previousSibling = this;
        }
        this.nextSibling = nextChild;
    }
    collapse() {
        if (this.isRoot) {
            return;
        }
        if (this.elementInternal) {
            this.elementInternal.classList.remove('expanded');
        }
        this.expandedInternal = false;
        if (this.selected && this.dataGrid) {
            this.dataGrid.updateGridAccessibleName(/* text */ i18nString(UIStrings.collapsed));
        }
        for (let i = 0; i < this.children.length; ++i) {
            this.children[i].revealed = false;
        }
    }
    collapseRecursively() {
        let item = this;
        while (item) {
            if (item.expanded) {
                item.collapse();
            }
            item = item.traverseNextNode(false, this, true);
        }
    }
    populate() {
    }
    expand() {
        if (!this.hasChildrenInternal || this.expandedInternal) {
            return;
        }
        if (this.isRoot) {
            return;
        }
        if (this.revealed && !this.shouldRefreshChildrenInternal) {
            for (let i = 0; i < this.children.length; ++i) {
                this.children[i].revealed = true;
            }
        }
        if (this.shouldRefreshChildrenInternal) {
            for (let i = 0; i < this.children.length; ++i) {
                this.children[i].detach();
            }
            this.populate();
            if (this.attachedInternal) {
                for (let i = 0; i < this.children.length; ++i) {
                    const child = this.children[i];
                    if (this.revealed) {
                        child.revealed = true;
                    }
                    child.attach();
                }
            }
            this.shouldRefreshChildrenInternal = false;
        }
        if (this.elementInternal) {
            this.elementInternal.classList.add('expanded');
        }
        if (this.selected && this.dataGrid) {
            this.dataGrid.updateGridAccessibleName(/* text */ i18nString(UIStrings.expanded));
        }
        this.expandedInternal = true;
    }
    expandRecursively() {
        let item = this;
        while (item) {
            item.expand();
            item = item.traverseNextNode(false, this);
        }
    }
    reveal() {
        if (this.isRoot || !this.dataGrid) {
            return;
        }
        let currentAncestor = this.parent;
        while (currentAncestor && !currentAncestor.isRoot) {
            if (!currentAncestor.expanded) {
                currentAncestor.expand();
            }
            currentAncestor = currentAncestor.parent;
        }
        this.dataGrid.revealNode(this.element());
    }
    select(supressSelectedEvent) {
        if (!this.dataGrid || !this.selectable || this.selected) {
            return;
        }
        if (this.dataGrid.selectedNode) {
            this.dataGrid.selectedNode.deselect();
        }
        this.selectedInternal = true;
        this.dataGrid.selectedNode = this;
        if (this.elementInternal) {
            this.elementInternal.classList.add('selected');
            this.dataGrid.setHasSelection(true);
            this.dataGrid.updateGridAccessibleName();
        }
        if (!supressSelectedEvent) {
            this.dataGrid.dispatchEventToListeners(Events.SelectedNode, this);
        }
    }
    revealAndSelect() {
        if (this.isRoot) {
            return;
        }
        this.reveal();
        this.select();
    }
    deselect(supressDeselectedEvent) {
        if (!this.dataGrid || this.dataGrid.selectedNode !== this || !this.selected) {
            return;
        }
        this.selectedInternal = false;
        this.dataGrid.selectedNode = null;
        if (this.elementInternal) {
            this.elementInternal.classList.remove('selected');
            this.dataGrid.setHasSelection(false);
            this.dataGrid.updateGridAccessibleName('');
        }
        if (!supressDeselectedEvent) {
            this.dataGrid.dispatchEventToListeners(Events.DeselectedNode);
        }
    }
    traverseNextNode(skipHidden, stayWithin, dontPopulate, info) {
        if (!dontPopulate && this.hasChildrenInternal) {
            this.populate();
        }
        if (info) {
            info.depthChange = 0;
        }
        let node = (!skipHidden || this.revealed) ? this.children[0] : null;
        if (node && (!skipHidden || this.expanded)) {
            if (info) {
                info.depthChange = 1;
            }
            return node;
        }
        if (this === stayWithin) {
            return null;
        }
        node = (!skipHidden || this.revealed) ? this.nextSibling : null;
        if (node) {
            return node;
        }
        node = this;
        while (node && !node.isRoot && !((!skipHidden || node.revealed) ? node.nextSibling : null) &&
            node.parent !== stayWithin) {
            if (info) {
                info.depthChange -= 1;
            }
            node = node.parent;
        }
        if (!node) {
            return null;
        }
        return (!skipHidden || node.revealed) ? node.nextSibling : null;
    }
    traversePreviousNode(skipHidden, dontPopulate) {
        let node = (!skipHidden || this.revealed) ? this.previousSibling : null;
        if (!dontPopulate && node && node.hasChildrenInternal) {
            node.populate();
        }
        while (node &&
            ((!skipHidden || (node.revealed && node.expanded)) ? node.children[node.children.length - 1] : null)) {
            if (!dontPopulate && node.hasChildrenInternal) {
                node.populate();
            }
            node = ((!skipHidden || (node.revealed && node.expanded)) ? node.children[node.children.length - 1] : null);
        }
        if (node) {
            return node;
        }
        if (!this.parent || this.parent.isRoot) {
            return null;
        }
        return this.parent;
    }
    isEventWithinDisclosureTriangle(event) {
        if (!this.hasChildrenInternal) {
            return false;
        }
        const cell = UI.UIUtils.enclosingNodeOrSelfWithNodeName(event.target, 'td');
        if (!cell || !(cell instanceof HTMLElement) || !cell.classList.contains('disclosure')) {
            return false;
        }
        const left = cell.totalOffsetLeft() + this.leftPadding;
        return event.pageX >= left && event.pageX <= left + this.disclosureToggleWidth;
    }
    attach() {
        if (!this.dataGrid || this.attachedInternal) {
            return;
        }
        this.attachedInternal = true;
        const previousNode = this.traversePreviousNode(true, true);
        const previousElement = previousNode ? previousNode.element() : this.dataGrid.topFillerRow;
        this.dataGrid.dataTableBody.insertBefore(this.element(), previousElement.nextSibling);
        if (this.expandedInternal) {
            for (let i = 0; i < this.children.length; ++i) {
                this.children[i].attach();
            }
        }
    }
    detach() {
        if (!this.attachedInternal) {
            return;
        }
        this.attachedInternal = false;
        if (this.elementInternal) {
            this.elementInternal.remove();
        }
        for (let i = 0; i < this.children.length; ++i) {
            this.children[i].detach();
        }
    }
    savePosition() {
        if (this.savedPosition) {
            return;
        }
        if (!this.parent) {
            throw 'savePosition: Node must have a parent.';
        }
        this.savedPosition = { parent: this.parent, index: this.parent.children.indexOf(this) };
    }
    restorePosition() {
        if (!this.savedPosition) {
            return;
        }
        if (this.parent !== this.savedPosition.parent) {
            this.savedPosition.parent.insertChild(this, this.savedPosition.index);
        }
        this.savedPosition = null;
    }
}
export class CreationDataGridNode extends DataGridNode {
    isCreationNode;
    constructor(data, hasChildren) {
        super(data, hasChildren);
        this.isCreationNode = true;
    }
    makeNormal() {
        this.isCreationNode = false;
    }
}
export class DataGridWidget extends UI.Widget.VBox {
    dataGrid;
    constructor(dataGrid) {
        super();
        this.dataGrid = dataGrid;
        this.element.appendChild(dataGrid.element);
        this.setDefaultFocusedElement(dataGrid.element);
    }
    wasShown() {
        this.registerCSSFiles([dataGridStyles]);
        this.dataGrid.wasShown();
    }
    willHide() {
        this.dataGrid.willHide();
    }
    onResize() {
        this.dataGrid.onResize();
    }
    elementsToRestoreScrollPositionsFor() {
        return [this.dataGrid.scrollContainer];
    }
}
//# sourceMappingURL=DataGrid.js.map