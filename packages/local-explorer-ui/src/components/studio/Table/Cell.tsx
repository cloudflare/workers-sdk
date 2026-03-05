import { cn } from "@cloudflare/kumo";
import { useMemo } from "react";
import type {
	StudioTableCellRendererProps,
	StudioTableHeaderProps,
} from "./BaseTable";
import type { StudioTableState } from "./State";
import type { ReactElement } from "react";

interface StudioTableCellProps<HeaderMetadata> {
	colIndex: number;
	header: StudioTableHeaderProps<HeaderMetadata>;
	onMouseDown: (e: React.MouseEvent) => void;
	renderCell: (
		props: StudioTableCellRendererProps<HeaderMetadata>
	) => ReactElement;
	rowIndex: number;
	state: StudioTableState<HeaderMetadata>;
}

export function StudioTableCell<HeaderMetadata = unknown>({
	colIndex,
	header,
	onMouseDown,
	renderCell,
	rowIndex,
	state,
}: StudioTableCellProps<HeaderMetadata>) {
	const { isBorderBottom, isBorderRight, isFocus, isSelected } =
		state.getCellStatus(rowIndex, colIndex);

	const isRemoved = state.isRemovedRow(rowIndex);
	const isNew = state.isNewRow(rowIndex);
	const isChanged = state.hasCellChange(rowIndex, colIndex);
	const isSticky = header.sticky;

	const additionalStyles = useMemo(() => {
		if (!isSticky) {
			return undefined;
		}

		return {
			left: `${state.gutterColumnWidth}px`,
			zIndex: 15,
		};
	}, [state.gutterColumnWidth, isSticky]);

	let cellBackgroundColor = "bg-transparent";

	if (isSelected) {
		if (isRemoved) {
			cellBackgroundColor = "bg-red-200 dark:bg-red-800";
		} else if (isChanged) {
			cellBackgroundColor = "bg-yellow-200 dark:bg-yellow-600";
		} else if (isNew) {
			cellBackgroundColor = "bg-green-200 dark:bg-green-700";
		} else {
			cellBackgroundColor = "";
		}
	} else if (isChanged) {
		cellBackgroundColor = "bg-[#ffe693] dark:bg-[#916b20]";
	} else if (isNew) {
		cellBackgroundColor = "bg-green-100 dark:bg-green-900";
	} else if (isRemoved) {
		cellBackgroundColor = "bg-red-100 dark:bg-red-900";
	}

	return (
		<td
			className={cn(
				"overflow-hidden border-r border-b box-border hover:bg-accent border-border",
				isSelected && "border-neutral-900 dark:border-neutral-100",
				isBorderBottom &&
					"border-b border-b-neutral-900 dark:border-b-neutral-100",
				isBorderRight &&
					"border-r border-r-neutral-900 dark:border-r-neutral-100",
				isFocus &&
					"shadow-[0_0_0_1px_rgba(0,0,0,0.5)_inset] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.5)_inset]",
				isSticky && "sticky",
				cellBackgroundColor
			)}
			onMouseDown={onMouseDown}
			style={additionalStyles}
		>
			<div className={"flex-1 overflow-hidden whitespace-nowrap"}>
				{renderCell({
					header: header,
					isFocus,
					state: state,
					x: colIndex,
					y: rowIndex,
				})}
			</div>
		</td>
	);
}
