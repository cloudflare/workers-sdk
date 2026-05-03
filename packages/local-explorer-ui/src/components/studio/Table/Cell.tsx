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
			cellBackgroundColor = "bg-kumo-danger/20";
		} else if (isChanged) {
			cellBackgroundColor = "bg-kumo-warning/20";
		} else if (isNew) {
			cellBackgroundColor = "bg-kumo-success/20";
		} else {
			cellBackgroundColor = "";
		}
	} else if (isChanged) {
		cellBackgroundColor = "bg-kumo-warning/30";
	} else if (isNew) {
		cellBackgroundColor = "bg-kumo-success/10";
	} else if (isRemoved) {
		cellBackgroundColor = "bg-kumo-danger/10";
	}

	return (
		<td
			className={cn(
				"box-border overflow-hidden border-r border-b border-kumo-fill hover:bg-kumo-overlay",
				isSelected && "border-kumo-default",
				isBorderBottom && "border-b-kumo-default border-b",
				isBorderRight && "border-r-kumo-default border-r",
				isFocus && "shadow-[inset_0_0_0_1px_var(--color-kumo-default)]",
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
