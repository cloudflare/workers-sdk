import { isEqual } from "../../../../utils/is-equal";
import type { StudioTableCellEditorType } from "../Result/EditableCell";
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export class StudioTableState<HeaderMetadata = unknown> {
	protected focus: [number, number] | null = null;
	protected data = new Array<StudioTableStateRow>();

	// Selelection range will be replaced our old selected rows implementation
	// It offers better flexiblity and allow us to implement more features
	protected selectionRanges = new Array<TableSelectionRange>();

	// Gutter is a sticky column on the left side of the table
	// We primary use it to display row number at the moment
	public gutterColumnWidth = 40;
	public rowNumberOffset = 0;

	protected headers = new Array<StudioTableHeaderInput<HeaderMetadata>>();
	protected headerWidth = new Array<number>();

	protected forceEditorType?: {
		type: StudioTableCellEditorType;
		x: number;
		y: number;
	};

	protected editMode = false;
	protected readOnlyMode = false;
	protected container: HTMLDivElement | null = null;

	protected changeCounter = 1;
	protected changeLogs: Record<number, StudioTableStateRow> = {};

	constructor(
		headers: StudioTableHeaderInput<HeaderMetadata>[],
		data: Record<string, unknown>[]
	) {
		this.headers = headers;
		this.data = data.map((row) => ({ raw: row }));
		this.headerWidth = headers.map((h) => h.display.initialSize);
	}

	setReadOnlyMode(readOnly: boolean): void {
		this.readOnlyMode = readOnly;
	}

	getReadOnlyMode(): boolean {
		return this.readOnlyMode;
	}

	setContainer(div: HTMLDivElement | null): void {
		this.container = div;
	}

	// ------------------------------------------------
	// Event Handlers
	// ------------------------------------------------
	// This section contains methods and properties related to event handling,
	// such as managing listeners and broadcasting changes.
	protected changeListeners = new Array<TableStateChangeListener>();
	protected changeBroadcastDebounceTimer: NodeJS.Timeout | null = null;

	addChangeListener(cb: TableStateChangeListener) {
		this.changeListeners.push(cb);

		return () => {
			this.changeListeners = this.changeListeners.filter((c) => c !== cb);
		};
	}

	/**
	 * Broadcasts changes to registered callbacks, either instantly or with a debounce delay.
	 *
	 * @param instant If `true`, the changes are broadcasted immediately without any delay.
	 *                Otherwise, the changes are broadcasted after a debounce delay.
	 */
	protected broadcastChange(instant?: boolean): boolean {
		if (instant) {
			if (this.changeBroadcastDebounceTimer) {
				clearTimeout(this.changeBroadcastDebounceTimer);
			}

			for (const cb of [...this.changeListeners].reverse()) {
				cb(this);
			}
		}

		if (this.changeBroadcastDebounceTimer) {
			return false;
		}

		this.changeBroadcastDebounceTimer = setTimeout(() => {
			this.changeBroadcastDebounceTimer = null;
			for (const cb of [...this.changeListeners].reverse()) {
				cb(this);
			}
		}, 5);

		return true;
	}
	// End of Event Handlers

	protected mergeSelectionRanges(): void {
		// Sort ranges to simplify merging
		this.selectionRanges.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);

		const merged: TableSelectionRange[] = [];
		let isLastMoveMerged = false;

		for (const range of this.selectionRanges) {
			const last = merged[merged.length - 1];
			if (
				last &&
				((last.y1 === range.y1 &&
					last.y2 === range.y2 &&
					last.x2 + 1 === range.x1) ||
					(last.x1 === range.x1 &&
						last.x2 === range.x2 &&
						last.y2 + 1 === range.y1))
			) {
				last.x2 = Math.max(last.x2, range.x2);
				last.y2 = Math.max(last.y2, range.y2);
				isLastMoveMerged = true;
			} else {
				merged.push({ ...range });
				isLastMoveMerged = false;
			}
		}
		this.selectionRanges = merged;
		if (isLastMoveMerged) {
			this.mergeSelectionRanges();
		}
	}

	protected splitSelectionRange(
		selection: TableSelectionRange,
		deselection: TableSelectionRange
	): TableSelectionRange[] {
		const result = new Array<TableSelectionRange>();

		if (deselection.y1 > selection.y1) {
			result.push({
				x1: selection.x1,
				y1: selection.y1,
				x2: selection.x2,
				y2: deselection.y1 - 1,
			});
		}

		if (deselection.y2 < selection.y2) {
			result.push({
				x1: selection.x1,
				y1: deselection.y2 + 1,
				x2: selection.x2,
				y2: selection.y2,
			});
		}

		if (deselection.x1 > selection.x1) {
			result.push({
				x1: selection.x1,
				y1: Math.max(selection.y1, deselection.y1),
				x2: deselection.x1 - 1,
				y2: Math.min(selection.y2, deselection.y2),
			});
		}

		if (deselection.x2 < selection.x2) {
			result.push({
				x1: deselection.x2 + 1,
				y1: Math.max(selection.y1, deselection.y1),
				x2: selection.x2,
				y2: Math.min(selection.y2, deselection.y2),
			});
		}

		return result;
	}

	// ------------------------------------------------
	// Handle headers and data
	// ------------------------------------------------
	getHeaders(): StudioTableHeaderInput<HeaderMetadata>[] {
		return this.headers;
	}

	getValue(y: number, x: number): unknown {
		const rowChange = this.data[y]?.change;
		if (rowChange) {
			const currentHeaderName = this.headers[x]?.name ?? "";
			if (currentHeaderName in rowChange) {
				return rowChange[currentHeaderName];
			}

			return this.getOriginalValue(y, x);
		}
		return this.getOriginalValue(y, x);
	}

	hasCellChange(y: number, x: number): boolean {
		const changeLog = this.data[y]?.change;
		if (!changeLog) {
			return false;
		}

		const currentHeaderName = this.headers[x]?.name ?? "";
		return currentHeaderName in changeLog;
	}

	getOriginalValue(y: number, x: number): unknown {
		const currentHeaderName = this.headers[x]?.name ?? "";
		return this.data[y]?.raw[currentHeaderName];
	}

	changeValue(y: number, x: number, newValue: unknown): void {
		if (this.readOnlyMode || this.headers[x]?.setting.readonly) {
			return;
		}

		const oldValue = this.getOriginalValue(y, x);

		const row = this.data[y];
		if (!row) {
			return;
		}

		const headerName = this.headers[x]?.name ?? "";

		if (isEqual(oldValue, newValue)) {
			const rowChange = row.change;
			if (rowChange && headerName in rowChange) {
				delete rowChange[headerName];
				if (Object.entries(rowChange).length === 0) {
					if (row.changeKey) {
						delete this.changeLogs[row.changeKey];
						delete row.changeKey;
					}
					delete row.change;
				}
			}
		} else {
			const rowChange = row.change;
			if (rowChange) {
				rowChange[headerName] = newValue;
			} else {
				row.changeKey = ++this.changeCounter;
				row.change = { [headerName]: newValue };
				this.changeLogs[row.changeKey] = row;
			}
		}

		this.broadcastChange();
	}

	getChangedRows(): StudioTableStateRow[] {
		return Object.values(this.changeLogs);
	}

	getRowsCount(): number {
		return this.data.length;
	}

	getHeaderCount(): number {
		return this.headers.length;
	}

	discardAllChange(): void {
		const newRows = new Array<StudioTableStateRow>();

		for (const row of Object.values(this.changeLogs)) {
			if (row.isNewRow) {
				newRows.push(row);
				delete row.change;
				delete row.changeKey;
				delete row.isNewRow;
			} else {
				delete row.change;
				delete row.changeKey;
				delete row.isRemoved;
			}
		}

		// Remove all new rows
		this.data = this.data.filter((row) => !newRows.includes(row));
		this.changeLogs = {};

		this.broadcastChange(true);
	}

	applyChanges(
		updatedRows: {
			row: StudioTableStateRow;
			updated: Record<string, unknown>;
		}[]
	): void {
		const rowChanges = this.getChangedRows();

		const removedRows = rowChanges.filter((row) => row.isRemoved);
		for (const row of rowChanges) {
			const updated = updatedRows.find((updateRow) => updateRow.row === row);
			row.raw = { ...row.raw, ...row.change, ...updated?.updated };
			delete row.changeKey;
			delete row.change;
			delete row.isNewRow;
			delete row.isRemoved;
		}

		if (removedRows.length > 0) {
			this.data = this.data.filter((row) => !removedRows.includes(row));
			// after rows were removed, we need to deselect them
			this.selectionRanges = [];
		}

		this.changeLogs = {};
		this.broadcastChange();
	}

	insertNewRow(index = -1, initialData: Record<string, unknown> = {}): void {
		if (index === -1) {
			const focus = this.getFocus();
			if (focus) {
				index = focus.y;
			}
		}

		if (index < 0) {
			index = 0;
		}

		const newRow = {
			change: initialData,
			changeKey: ++this.changeCounter,
			isNewRow: true,
			raw: {},
		};

		this.data.splice(index, 0, newRow);
		this.changeLogs[newRow.changeKey] = newRow;
		this.broadcastChange();
	}

	isNewRow(index: number): boolean {
		return !!this.data[index]?.isNewRow;
	}

	removeRow(index = -1): void {
		if (index === -1) {
			// Remove the row at focus
			const focus = this.getFocus();
			if (focus) {
				index = focus.y;
			}
		}

		const row = this.data[index];

		if (row) {
			if (row.isNewRow && row.changeKey) {
				delete this.changeLogs[row.changeKey];
				this.data = this.data.filter((dataRow) => dataRow != row);
			} else {
				row.isRemoved = true;
				if (!row.changeKey) {
					row.change = {};
					row.changeKey = ++this.changeCounter;
					this.changeLogs[row.changeKey] = row;
				}
			}
		}

		this.broadcastChange();
	}

	isRemovedRow(index: number): boolean {
		return !!this.data[index]?.isRemoved;
	}

	getAllRows(): StudioTableStateRow[] {
		return this.data;
	}

	getRowByIndex(idx: number): StudioTableStateRow | undefined {
		return this.data[idx];
	}

	// ------------------------------------------------
	// Handle focus logic
	// ------------------------------------------------
	getFocus(): { x: number; y: number } | null {
		return this.focus
			? {
					x: this.focus[1],
					y: this.focus[0],
				}
			: null;
	}

	getFocusValue(): unknown {
		const focusCell = this.getFocus();
		if (focusCell) {
			return this.getValue(focusCell.y, focusCell.x);
		}

		return undefined;
	}

	setFocusValue(newValue: unknown): void {
		const focusCell = this.getFocus();
		if (focusCell) {
			this.changeValue(focusCell.y, focusCell.x, newValue);
		}
	}

	hasFocus(y: number, x: number): boolean {
		if (!this.focus) {
			return false;
		}

		return this.focus[0] === y && this.focus[1] === x;
	}

	setFocus(y: number, x: number): void {
		this.focus = [y, x];
		this.broadcastChange();
	}

	isInEditMode(): boolean {
		return this.editMode;
	}

	enterEditMode(type?: StudioTableCellEditorType): void {
		this.editMode = true;

		// Store the focused cell and forced editor type if provided
		this.forceEditorType =
			type && this.focus
				? { type, y: this.focus[0], x: this.focus[1] }
				: undefined;

		this.broadcastChange();
	}

	getForcedEditorType(): StudioTableCellEditorType | undefined {
		if (!this.focus) {
			return;
		}
		if (!this.forceEditorType) {
			return;
		}
		if (this.focus[0] !== this.forceEditorType.y) {
			return;
		}
		if (this.focus[1] !== this.forceEditorType.x) {
			return;
		}

		return this.forceEditorType.type;
	}

	exitEditMode(): void {
		this.editMode = false;

		if (this.container) {
			this.container.focus();
		}

		this.broadcastChange();
	}

	clearFocus(): void {
		this.focus = null;
		this.broadcastChange();
	}

	setHeaderWidth(idx: number, newWidth: number): void {
		this.headerWidth[idx] = newWidth;
	}

	getHeaderWidth(): number[] {
		return this.headerWidth;
	}

	scrollToCell(
		horizontal: "left" | "right",
		vertical: "top" | "bottom",
		cell: { x: number; y: number }
	): void {
		if (this.container && cell) {
			const cellX = cell.x;
			const cellY = cell.y;
			let cellLeft = 0;
			let cellRight = 0;
			const cellTop = (cellY + 1) * 38;
			const cellBottom = cellTop + 38;

			for (let i = 0; i < cellX; i++) {
				cellLeft += this.headerWidth[i] ?? 0;
			}
			cellRight = cellLeft + (this.headerWidth[cellX] ?? 0);

			const width = this.container.clientWidth;
			const height = this.container.clientHeight;
			const containerLeft = this.container.scrollLeft;
			const containerRight = containerLeft + this.container.clientWidth;
			const containerTop = this.container.scrollTop;
			const containerBottom = containerTop + height;

			if (horizontal === "right") {
				if (cellRight > containerRight) {
					this.container.scrollLeft = Math.max(
						0,
						cellRight - width + this.gutterColumnWidth
					);
				}
			} else {
				if (cellLeft < containerLeft) {
					this.container.scrollLeft = cellLeft;
				}
			}

			if (vertical === "bottom") {
				if (cellBottom > containerBottom) {
					this.container.scrollTop = Math.max(0, cellBottom - height);
				}
			} else {
				if (cellTop - 38 < containerTop) {
					this.container.scrollTop = Math.max(0, cellTop - 38);
				}
			}
		}
	}

	clearSelect(): void {
		this.selectionRanges = [];
		this.broadcastChange();
	}

	getSelectionRanges(): TableSelectionRange[] {
		return this.selectionRanges;
	}

	setSelectionRanges(ranges: TableSelectionRange[]): void {
		this.selectionRanges = ranges;
		this.broadcastChange();
	}

	getSelectedRowCount(): number {
		return this.getSelectedRowIndex().length;
	}

	getSelectedRowsArray(): unknown[][] {
		return selectArrayFromIndexList(this.data, this.getSelectedRowIndex()).map(
			(row) => this.headers.map((header) => row.raw[header.name])
		);
	}

	getSelectedRowIndex(): number[] {
		const selectedRows = new Set<number>();

		for (const range of this.selectionRanges) {
			for (let i = range.y1; i <= range.y2; i++) {
				selectedRows.add(i);
			}
		}

		return Array.from(selectedRows.values());
	}

	getSelectedColIndex(): number[] {
		const selectedCols = new Set<number>();

		for (const range of this.selectionRanges) {
			for (let i = range.x1; i <= range.x2; i++) {
				selectedCols.add(i);
			}
		}

		return Array.from(selectedCols.values());
	}

	isFullSelectionRow(y: number): boolean {
		for (const range of this.selectionRanges) {
			if (
				range.y1 <= y &&
				range.y2 >= y &&
				range.x1 === 0 &&
				range.x2 === this.getHeaderCount() - 1
			) {
				return true;
			}
		}

		return false;
	}

	getFullSelectionRowsIndex(): number[] {
		const selectedRows = new Set<number>();

		for (const range of this.selectionRanges) {
			if (range.x1 === 0 && range.x2 === this.getHeaderCount() - 1) {
				for (let i = range.y1; i <= range.y2; i++) {
					if (!selectedRows.has(i)) {
						selectedRows.add(i);
					}
				}
			}
		}

		return Array.from(selectedRows.values());
	}

	getFullSelectionColsIndex(): number[] {
		const selectedCols = new Set<number>();

		for (const range of this.selectionRanges) {
			if (range.y1 === 0 && range.y2 === this.getRowsCount() - 1) {
				for (let i = range.x1; i <= range.x2; i++) {
					if (!selectedCols.has(i)) {
						selectedCols.add(i);
					}
				}
			}
		}

		return Array.from(selectedCols.values());
	}

	isFullSelectionCol(x: number): boolean {
		for (const range of this.selectionRanges) {
			if (
				range.x1 <= x &&
				range.x2 >= x &&
				range.y1 === 0 &&
				range.y2 === this.getRowsCount() - 1
			) {
				return true;
			}
		}

		return false;
	}

	selectRow(y: number): void {
		this.selectionRanges = [
			{ x1: 0, y1: y, x2: this.headers.length - 1, y2: y },
		];

		this.broadcastChange();
	}

	selectColumn(x: number): void {
		this.selectionRanges = [
			{ x1: x, y1: 0, x2: x, y2: this.getRowsCount() - 1 },
		];

		this.broadcastChange();
	}

	selectCell(y: number, x: number, focus = true): void {
		this.selectionRanges = [{ x1: x, y1: y, x2: x, y2: y }];

		if (focus) {
			this.setFocus(y, x);
		} else {
			this.broadcastChange();
		}
	}

	selectCellRange(y1: number, x1: number, y2: number, x2: number): void {
		this.selectionRanges = [
			{
				x1: Math.min(x1, x2),
				y1: Math.min(y1, y2),
				x2: Math.max(x1, x2),
				y2: Math.max(y1, y2),
			},
		];
		this.broadcastChange();
	}

	findSelectionRange(range: TableSelectionRange): number {
		return this.selectionRanges.findIndex(
			(r) =>
				r.x1 <= range.x1 &&
				r.x2 >= range.x2 &&
				r.y1 <= range.y1 &&
				r.y2 >= range.y2
		);
	}

	addSelectionRange(y1: number, x1: number, y2: number, x2: number): void {
		const newRange = {
			x1: Math.min(x1, x2),
			x2: Math.max(x1, x2),
			y1: Math.min(y1, y2),
			y2: Math.max(y1, y2),
		};

		const selectedRangeIndex = this.findSelectionRange(newRange);
		if (selectedRangeIndex < 0) {
			this.selectionRanges.push(newRange);
			this.mergeSelectionRanges();
		} else {
			// `findSelectionRange` returned a non-negative index, guaranteeing this exists
			const selectedRange = this.selectionRanges[
				selectedRangeIndex
			] as TableSelectionRange;

			const splitedRanges = this.splitSelectionRange(selectedRange, newRange);
			if (splitedRanges.length >= 0) {
				this.selectionRanges.splice(selectedRangeIndex, 1);
				this.selectionRanges = [...this.selectionRanges, ...splitedRanges];
				this.mergeSelectionRanges();
			}
		}

		this.broadcastChange();
	}

	addSelectionRow(y: number): void {
		const newRange = {
			x1: 0,
			x2: this.headers.length - 1,
			y1: y,
			y2: y,
		};

		this.addSelectionRange(newRange.y1, newRange.x1, newRange.y2, newRange.x2);
	}

	addSelectionCol(x: number): void {
		const newRange = {
			x1: x,
			x2: x,
			y1: 0,
			y2: this.getRowsCount() - 1,
		};

		this.addSelectionRange(newRange.y1, newRange.x1, newRange.y2, newRange.x2);
	}

	selectRowRange(y1: number, y2: number): void {
		const newRange = {
			x1: 0,
			x2: this.headers.length - 1,
			y1: Math.min(y1, y2),
			y2: Math.max(y1, y2),
		};

		this.selectionRanges = [newRange];
		this.broadcastChange();
	}

	selectColRange(x1: number, x2: number): void {
		const newRange = {
			x1: Math.min(x1, x2),
			x2: Math.max(x1, x2),
			y1: 0,
			y2: this.getRowsCount() - 1,
		};

		this.selectionRanges = [newRange];
		this.broadcastChange();
	}

	isRowSelected(y: number): boolean {
		for (const range of this.selectionRanges) {
			if (y >= range.y1 && y <= range.y2) {
				return true;
			}
		}

		return false;
	}

	getSelectionRange(y: number, x: number): TableSelectionRange | null {
		for (const range of this.selectionRanges) {
			if (y >= range.y1 && y <= range.y2 && x >= range.x1 && x <= range.x2) {
				return range;
			}
		}

		return null;
	}

	getCellStatus(
		y: number,
		x: number
	): {
		isBorderBottom: boolean;
		isBorderRight: boolean;
		isFocus: boolean;
		isSelected: boolean;
	} {
		const focus = this.getFocus();
		const isFocus = !!focus && focus.y === y && focus.x === x;

		// Finding the selection range
		let isSelected = false;
		let isBorderRight = false;
		let isBorderBottom = false;

		for (const range of this.selectionRanges) {
			if (y >= range.y1 && y <= range.y2) {
				if (x >= range.x1 && x <= range.x2) {
					isSelected = true;
				}

				if (x === range.x2 || x + 1 === range.x1) {
					isBorderRight = true;
				}
			}

			if (x >= range.x1 && x <= range.x2) {
				if (y === range.y2 || y + 1 === range.y1) {
					isBorderBottom = true;
				}
			}
		}

		return {
			isBorderBottom,
			isBorderRight,
			isFocus,
			isSelected,
		};
	}
}

function selectArrayFromIndexList<T = unknown>(
	data: T[],
	indexList: number[]
): T[] {
	return indexList.map((index) => data[index]) as T[];
}

export interface StudioTableStateRow {
	change?: Record<string, unknown>;
	changeKey?: number;
	isNewRow?: boolean;
	isRemoved?: boolean;
	raw: Record<string, unknown>;
}

type TableStateChangeListener = (state: StudioTableState) => void;

interface TableSelectionRange {
	x1: number;
	x2: number;
	y1: number;
	y2: number;
}

export interface StudioTableHeaderInput<MetadataType = unknown> {
	display: {
		icon?: Icon;
		iconElement?: ReactNode;
		initialSize: number;
		text: string;
		tooltip?: string;
	};
	metadata: MetadataType;
	name: string;
	onContextMenu?: (e: React.MouseEvent, headerIndex: number) => void;
	setting: {
		readonly: boolean;
		resizable: boolean;
	};
	store: Map<string, unknown>;
}
