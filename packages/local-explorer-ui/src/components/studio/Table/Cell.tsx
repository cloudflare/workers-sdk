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
			cellBackgroundColor = "bg-state-removed-selected";
		} else if (isChanged) {
			cellBackgroundColor = "bg-state-changed-selected";
		} else if (isNew) {
			cellBackgroundColor = "bg-state-new-selected";
		} else {
			cellBackgroundColor = "";
		}
	} else if (isChanged) {
		cellBackgroundColor = "bg-state-changed";
	} else if (isNew) {
		cellBackgroundColor = "bg-state-new";
	} else if (isRemoved) {
		cellBackgroundColor = "bg-state-removed";
	}

	return (
		<td
			className={cn(
				"box-border overflow-hidden border-r border-b border-border hover:bg-accent",
				isSelected && "border-selection-border",
				isBorderBottom && "border-b border-b-selection-border",
				isBorderRight && "border-r border-r-selection-border",
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
