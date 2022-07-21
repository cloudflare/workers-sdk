export class ColumnHeaderClickEvent extends Event {
    static eventName = 'columnheaderclick';
    data;
    constructor(column, columnIndex) {
        super(ColumnHeaderClickEvent.eventName);
        this.data = {
            column,
            columnIndex,
        };
    }
}
export class ContextMenuColumnSortClickEvent extends Event {
    static eventName = 'contextmenucolumnsortclick';
    data;
    constructor(column) {
        super(ContextMenuColumnSortClickEvent.eventName);
        this.data = {
            column,
        };
    }
}
export class ContextMenuHeaderResetClickEvent extends Event {
    static eventName = 'contextmenuheaderresetclick';
    constructor() {
        super(ContextMenuHeaderResetClickEvent.eventName);
    }
}
export class NewUserFilterTextEvent extends Event {
    static eventName = 'newuserfiltertext';
    data;
    constructor(filterText) {
        super(NewUserFilterTextEvent.eventName, {
            composed: true,
        });
        this.data = {
            filterText,
        };
    }
}
export class BodyCellFocusedEvent extends Event {
    static eventName = 'cellfocused';
    /**
     * Although the DataGrid cares only about the focused cell, and has no concept
     * of a focused row, many components that render a data grid want to know what
     * row is active, so on the cell focused event we also send the row that the
     * cell is part of.
     */
    data;
    constructor(cell, row) {
        super(BodyCellFocusedEvent.eventName, {
            composed: true,
        });
        this.data = {
            cell,
            row,
        };
    }
}
//# sourceMappingURL=DataGridEvents.js.map