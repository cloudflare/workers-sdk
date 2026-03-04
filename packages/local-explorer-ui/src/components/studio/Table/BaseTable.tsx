import { cn } from "@cloudflare/kumo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudioTableCell } from "./Cell";
import {
	StudioTableFakeBodyPadding,
	StudioTableFakeRowPadding,
} from "./FakePadding";
import { StudioTableHeaderList } from "./HeaderList";
import { useStudioTableVisibility } from "./useVisibilityCalculation";
import type { StudioTableHeaderInput, StudioTableState } from "./State";
import type { ReactElement } from "react";

/**
 * A flexible and efficient table component designed for handling large datasets.
 * The `StudioTable` focuses on performance with features like virtualized rendering,
 * sticky headers, and custom cell rendering. It aims to provide a balance between
 * usability and performance, supporting interactions such as context menus, keyboard
 * navigation, and range selection, while remaining adaptable to various use cases.
 */
export function StudioBaseTable<HeaderMetadata = unknown>({
	arrangeHeaderIndex,
	onCellMouseDown,
	onContextMenu,
	onGutterClick,
	onKeyDown,
	onKeyUp,
	renderAhead,
	renderCell,
	renderHeader,
	rowHeight,
	state,
	stickyHeaderIndex,
}: StudioTableProps<HeaderMetadata>) {
	const containerRef = useRef<HTMLDivElement>(null);

	// This is our trigger re-render the whole table
	const [revision, setRevision] = useState<number>(1);

	const rerender = useCallback((): void => {
		setRevision((prev) => prev + 1);
	}, [setRevision]);

	useEffect((): void => {
		state.setContainer(containerRef.current);
	}, [state, containerRef]);

	useEffect(() => state.addChangeListener(rerender), [state, rerender]);

	const headerWithIndex = useMemo(() => {
		// Attach the actual index
		const headers = state.getHeaders().map((header, idx) => ({
			...header,
			index: idx,
			sticky: idx === stickyHeaderIndex,
		}));

		// We will rearrange the index based on specified index
		// `arrangeHeaderIndex` contains valid indices into headers
		const headerAfterArranged = arrangeHeaderIndex.map(
			(arrangedIndex) => headers[arrangedIndex] as (typeof headers)[number]
		);

		// Sticky will also alter the specified index
		return [
			...(stickyHeaderIndex !== undefined
				? // `stickyHeaderIndex` is checked for undefined before use
					[headers[stickyHeaderIndex as keyof typeof headers]]
				: []),
			...headerAfterArranged.filter((x) => x?.index !== stickyHeaderIndex),
		] as StudioTableHeaderProps<HeaderMetadata>[];
	}, [state, arrangeHeaderIndex, stickyHeaderIndex]);

	const { onHeaderResize, visibileRange } = useStudioTableVisibility({
		containerRef,
		headers: headerWithIndex,
		renderAhead,
		rowHeight,
		state: state,
		totalRowCount: state.getRowsCount(),
	});

	const { colEnd, colStart, rowEnd, rowStart } = visibileRange;

	const tableBody = useMemo(() => {
		const common = {
			colEnd,
			colStart,
			hasSticky: stickyHeaderIndex !== undefined,
			headers: headerWithIndex,
			onCellMouseDown,
			onContextMenu,
			onGutterClick,
			onHeaderResize,
			renderCell,
			renderHeader,
			revision,
			rowEnd,
			rowHeight,
			rowStart,
			state,
		};

		return (
			<div style={{ height: (state.getRowsCount() + 1) * rowHeight + 10 }}>
				{renderCellList(common)}
			</div>
		);
	}, [
		colEnd,
		colStart,
		headerWithIndex,
		onCellMouseDown,
		onContextMenu,
		onGutterClick,
		onHeaderResize,
		renderCell,
		renderHeader,
		revision,
		rowEnd,
		rowHeight,
		rowStart,
		state,
		stickyHeaderIndex,
	]);

	return (
		<div
			className={"relative h-full w-full overflow-auto text-[12px] select-none"}
			onContextMenu={(e) => {
				if (onContextMenu) {
					onContextMenu({
						event: e,
						state: state,
					});
				}

				e.preventDefault();
			}}
			onKeyDown={onKeyDown}
			onKeyUp={onKeyUp}
			ref={containerRef}
			style={{ outline: "none" }}
			tabIndex={-1}
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
	header: StudioTableHeaderProps<MetadataType>;
	isFocus: boolean;
	state: StudioTableState<MetadataType>;
	x: number;
	y: number;
}

interface TableCellListCommonProps<MetadataType = unknown> {
	onCellMouseDown?: (
		event: React.MouseEvent,
		data: { x: number; y: number }
	) => void;
	onContextMenu?: (props: {
		state: StudioTableState<MetadataType>;
		event: React.MouseEvent;
	}) => void;
	onGutterClick?: (event: React.MouseEvent, rowNumber: number) => void;
	onHeaderContextMenu?: (
		e: React.MouseEvent,
		header: StudioTableHeaderProps<MetadataType>
	) => void;
	onKeyDown?: (event: React.KeyboardEvent) => void;
	onKeyUp?: (event: React.KeyboardEvent) => void;
	renderCell: (
		props: StudioTableCellRendererProps<MetadataType>
	) => ReactElement;
	renderHeader: (props: StudioTableHeaderProps<MetadataType>) => ReactElement;
	rowHeight: number;
	state: StudioTableState<MetadataType>;
}

export interface StudioTableProps<HeaderMetadata = unknown>
	extends TableCellListCommonProps<HeaderMetadata> {
	arrangeHeaderIndex: number[];
	renderAhead: number;
	stickyHeaderIndex?: number;
}

interface RenderCellListProps<HeaderMetadata = unknown>
	extends TableCellListCommonProps<HeaderMetadata> {
	colEnd: number;
	colStart: number;
	customStyles?: React.CSSProperties;
	hasSticky: boolean;
	headers: StudioTableHeaderProps<HeaderMetadata>[];
	onHeaderResize: (idx: number, newWidth: number) => void;
	rowEnd: number;
	rowStart: number;
}

function renderCellList<HeaderMetadata = unknown>({
	colEnd,
	colStart,
	customStyles,
	hasSticky,
	headers,
	onCellMouseDown,
	onGutterClick,
	onHeaderContextMenu: _onHeaderContextMenu,
	onHeaderResize,
	renderCell,
	renderHeader,
	rowEnd,
	rowHeight,
	rowStart,
	state,
}: RenderCellListProps<HeaderMetadata>): JSX.Element {
	const headerSizes = state.getHeaderWidth();

	const templateSizes =
		`${state.gutterColumnWidth}px ` +
		headers.map((header) => headerSizes[header.index] + "px").join(" ");

	const onHeaderSizeWithRemap = (idx: number, newWidth: number): void => {
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
			"sticky left-0 bg-bg-secondary border-r border-b border-border";

		if (state.getSelectedRowIndex().includes(absoluteRowIndex)) {
			if (state.isFullSelectionRow(absoluteRowIndex)) {
				textClass = cn(
					"flex items-center justify-end h-full pr-2 font-mono",
					"bg-surface-secondary text-text font-bold"
				);
				tdClass =
					"sticky left-0 bg-surface-secondary dark:bg-blue-800 border-r border-b border-border";
			} else {
				textClass =
					"flex items-center justify-end h-full pr-2 font-mono text-text font-bold";
				tdClass =
					"sticky left-0 bg-surface-secondary border-r border-b border-border";
			}
		}

		return (
			<tr
				className="contents"
				data-row={absoluteRowIndex}
				key={absoluteRowIndex}
			>
				<td
					className={cn(tdClass, "z-15")}
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

				{hasSticky && headers[0] && (
					<StudioTableCell
						colIndex={headers[0].index}
						header={headers[0]}
						key={-1}
						onMouseDown={(e) => {
							if (onCellMouseDown) {
								onCellMouseDown(e, {
									// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Parent conditional (headers[0] &&) guarantees this exists
									x: headers[0]!.index,
									y: absoluteRowIndex,
								});
							}
						}}
						renderCell={renderCell}
						rowIndex={absoluteRowIndex}
						state={state}
					/>
				)}

				<StudioTableFakeRowPadding
					colStart={0 + (hasSticky ? 1 : 0)}
					colEnd={colStart}
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
							colIndex={header.index}
							header={header}
							key={actualIndex}
							onMouseDown={(e) => {
								if (onCellMouseDown) {
									onCellMouseDown(e, {
										x: header.index,
										y: absoluteRowIndex,
									});
								}
							}}
							renderCell={renderCell}
							rowIndex={absoluteRowIndex}
							state={state}
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
