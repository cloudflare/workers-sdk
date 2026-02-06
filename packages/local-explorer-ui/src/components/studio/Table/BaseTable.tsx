import { cn } from "@cloudflare/kumo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudioTableCell } from "./TableCell";
import {
	StudioTableFakeBodyPadding,
	StudioTableFakeRowPadding,
} from "./TableFakePadding";
import { StudioTableHeaderList } from "./TableHeaderList";
import { useStudioTableVisibility } from "./useVisibilityCalculation";
import type { StudioTableHeaderInput, StudioTableState } from "./TableState";
import type { ReactElement } from "react";

/**
 * A flexible and efficient table component designed for handling large datasets.
 * The `StudioTable` focuses on performance with features like virtualized rendering,
 * sticky headers, and custom cell rendering. It aims to provide a balance between
 * usability and performance, supporting interactions such as context menus, keyboard
 * navigation, and range selection, while remaining adaptable to various use cases.
 */
export function StudioBaseTable<HeaderMetadata = unknown>({
	stickyHeaderIndex,
	state,
	renderHeader,
	renderCell,
	rowHeight,
	renderAhead,
	onContextMenu,
	onKeyDown,
	onKeyUp,
	onGutterClick,
	onCellMouseDown,
	arrangeHeaderIndex,
}: StudioTableProps<HeaderMetadata>) {
	const containerRef = useRef<HTMLDivElement>(null);

	// This is our trigger re-render the whole table
	const [revision, setRevision] = useState(1);

	const rerender = useCallback(() => {
		setRevision((prev) => prev + 1);
	}, [setRevision]);

	useEffect(() => {
		state.setContainer(containerRef.current);
	}, [state, containerRef]);

	useEffect(() => {
		return state.addChangeListener(rerender);
	}, [state, rerender]);

	const headerWithIndex = useMemo(() => {
		// Attach the actual index
		const headers = state.getHeaders().map((header, idx) => ({
			...header,
			index: idx,
			sticky: idx === stickyHeaderIndex,
		}));

		// We will rearrange the index based on specified index
		const headerAfterArranged = arrangeHeaderIndex.map((arrangedIndex) => {
			return headers[arrangedIndex];
		});

		// Sticky will also alter the specified index
		return [
			...(stickyHeaderIndex !== undefined ? [headers[stickyHeaderIndex]] : []),
			...headerAfterArranged.filter((x) => x.index !== stickyHeaderIndex),
		] as StudioTableHeaderProps<HeaderMetadata>[];
	}, [state, arrangeHeaderIndex, stickyHeaderIndex]);

	const { visibileRange, onHeaderResize } = useStudioTableVisibility({
		containerRef,
		headers: headerWithIndex,
		renderAhead,
		rowHeight,
		totalRowCount: state.getRowsCount(),
		state: state,
	});

	const { rowStart, rowEnd, colEnd, colStart } = visibileRange;

	const tableBody = useMemo(() => {
		const common = {
			headers: headerWithIndex,
			renderCell,
			rowEnd,
			rowStart,
			colEnd,
			colStart,
			rowHeight,
			onHeaderResize,
			hasSticky: stickyHeaderIndex !== undefined,
			state,
			revision,
			onContextMenu,
			onCellMouseDown,
			onGutterClick,
			renderHeader,
		};

		return (
			<div
				style={{
					height: (state.getRowsCount() + 1) * rowHeight + 10,
				}}
			>
				{renderCellList(common)}
			</div>
		);
	}, [
		rowEnd,
		rowStart,
		colEnd,
		colStart,
		rowHeight,
		headerWithIndex,
		onHeaderResize,
		stickyHeaderIndex,
		state,
		onContextMenu,
		onGutterClick,
		onCellMouseDown,
		revision,
		renderHeader,
		renderCell,
	]);

	return (
		<div
			tabIndex={-1}
			onKeyDown={onKeyDown}
			onKeyUp={onKeyUp}
			ref={containerRef}
			style={{
				outline: "none",
			}}
			className={"relative h-full w-full overflow-auto text-[12px] select-none"}
			onContextMenu={(e) => {
				if (onContextMenu) {
					onContextMenu({ state: state, event: e });
				}

				e.preventDefault();
			}}
		>
			{tableBody}
		</div>
	);
}

export interface StudioTableHeaderProps<MetadataType = unknown>
	extends StudioTableHeaderInput<MetadataType> {
	index: number;
	sticky: boolean;
}

export interface StudioTableCellRendererProps<MetadataType = unknown> {
	y: number;
	x: number;
	state: StudioTableState<MetadataType>;
	header: StudioTableHeaderProps<MetadataType>;
	isFocus: boolean;
}

interface TableCellListCommonProps<MetadataType = unknown> {
	state: StudioTableState<MetadataType>;
	renderHeader: (props: StudioTableHeaderProps<MetadataType>) => ReactElement;
	renderCell: (
		props: StudioTableCellRendererProps<MetadataType>
	) => ReactElement;
	rowHeight: number;
	onHeaderContextMenu?: (
		e: React.MouseEvent,
		header: StudioTableHeaderProps<MetadataType>
	) => void;
	onContextMenu?: (props: {
		state: StudioTableState<MetadataType>;
		event: React.MouseEvent;
	}) => void;
	onKeyDown?: (event: React.KeyboardEvent) => void;
	onKeyUp?: (event: React.KeyboardEvent) => void;
	onCellMouseDown?: (
		event: React.MouseEvent,
		data: { x: number; y: number }
	) => void;
	onGutterClick?: (event: React.MouseEvent, rowNumber: number) => void;
}

export interface StudioTableProps<HeaderMetadata = unknown>
	extends TableCellListCommonProps<HeaderMetadata> {
	arrangeHeaderIndex: number[];
	stickyHeaderIndex?: number;
	renderAhead: number;
}

interface RenderCellListProps<HeaderMetadata = unknown>
	extends TableCellListCommonProps<HeaderMetadata> {
	hasSticky: boolean;
	onHeaderResize: (idx: number, newWidth: number) => void;
	customStyles?: React.CSSProperties;
	headers: StudioTableHeaderProps<HeaderMetadata>[];
	rowEnd: number;
	rowStart: number;
	colEnd: number;
	colStart: number;
}

function renderCellList<HeaderMetadata = unknown>({
	hasSticky,
	customStyles,
	renderCell,
	headers,
	rowEnd,
	rowStart,
	colEnd,
	colStart,
	rowHeight,
	onHeaderResize,
	renderHeader,
	state,
	onHeaderContextMenu,
	onGutterClick,
	onCellMouseDown,
}: RenderCellListProps<HeaderMetadata>) {
	const headerSizes = state.getHeaderWidth();

	const templateSizes =
		`${state.gutterColumnWidth}px ` +
		headers.map((header) => headerSizes[header.index] + "px").join(" ");

	const onHeaderSizeWithRemap = (idx: number, newWidth: number) => {
		onHeaderResize(headers[idx]?.index ?? 0, newWidth);
	};

	const windowArray = new Array(
		// Ensure non-negative size; better to return empty than crash
		Math.max(0, rowEnd - rowStart)
	)
		.fill(false)
		.map(() => new Array(headers.length).fill(false));

	const cells = windowArray.map((row, rowIndex) => {
		const absoluteRowIndex = rowIndex + rowStart;

		let textClass = "flex items-center justify-end h-full pr-2 font-mono";
		let tdClass =
			"sticky left-0 bg-neutral-50 dark:bg-neutral-950 border-r border-b border-neutral-200 dark:border-neutral-800";

		if (state.getSelectedRowIndex().includes(absoluteRowIndex)) {
			if (state.isFullSelectionRow(absoluteRowIndex)) {
				textClass = cn(
					"flex items-center justify-end h-full pr-2 font-mono",
					"bg-neutral-100 dark:bg-neutral-900 dark:text-white font-bold"
				);
				tdClass =
					"sticky left-0 bg-neutral-100 dark:bg-blue-800 border-r border-b border-neutral-200 dark:border-neutral-800";
			} else {
				textClass =
					"flex items-center justify-end h-full pr-2 font-mono dark:text-white font-bold";
				tdClass =
					"sticky left-0 bg-neutral-100 dark:bg-neutral-900 border-r border-b border-neutral-200 dark:border-neutral-800";
			}
		}

		return (
			<tr
				key={absoluteRowIndex}
				data-row={absoluteRowIndex}
				className="contents"
			>
				<td
					className={tdClass}
					style={{ zIndex: 15 }}
					onMouseDown={(e) => {
						if (onGutterClick) {
							onGutterClick(e, absoluteRowIndex);
						}
					}}
				>
					<div className={textClass}>
						{state.rowNumberOffset + absoluteRowIndex + 1}
					</div>
				</td>

				{hasSticky && (
					<StudioTableCell
						key={-1}
						state={state}
						colIndex={headers[0].index}
						rowIndex={absoluteRowIndex}
						header={headers[0]}
						renderCell={renderCell}
						onMouseDown={(e) => {
							if (onCellMouseDown) {
								onCellMouseDown(e, {
									x: headers[0].index,
									y: absoluteRowIndex,
								});
							}
						}}
					/>
				)}

				<StudioTableFakeRowPadding
					colEnd={colStart}
					colStart={0 + (hasSticky ? 1 : 0)}
				/>

				{row.slice(colStart, colEnd + 1).map((_, cellIndex) => {
					const actualIndex = cellIndex + colStart;
					const header = headers[actualIndex];

					if (!header) {
						console.error(
							`Header is undefined or null at rowIndex: ${absoluteRowIndex}, colIndex: ${actualIndex}`
						);
						return null;
					}

					// Ignore the sticky column.
					// It is already rendered at the left-most side
					if (header.sticky) {
						return null;
					}

					return (
						<StudioTableCell
							key={actualIndex}
							state={state}
							colIndex={header.index}
							rowIndex={absoluteRowIndex}
							header={header}
							renderCell={renderCell}
							onMouseDown={(e) => {
								if (onCellMouseDown) {
									onCellMouseDown(e, {
										x: header.index,
										y: absoluteRowIndex,
									});
								}
							}}
						/>
					);
				})}
				<StudioTableFakeRowPadding
					colStart={colEnd}
					colEnd={headers.length - 1}
				/>
			</tr>
		);
	});

	return (
		<table
			className="absolute top-0 left-0 box-border grid"
			style={{ ...customStyles, gridTemplateColumns: templateSizes }}
		>
			<StudioTableHeaderList
				state={state}
				renderHeader={renderHeader}
				sticky={hasSticky}
				headers={headers}
				onHeaderResize={onHeaderSizeWithRemap}
			/>

			<StudioTableFakeBodyPadding
				colCount={headers.length}
				rowCount={state.getRowsCount()}
				rowEnd={rowEnd}
				rowStart={rowStart}
				rowHeight={rowHeight}
			>
				{cells}
			</StudioTableFakeBodyPadding>
		</table>
	);
}
