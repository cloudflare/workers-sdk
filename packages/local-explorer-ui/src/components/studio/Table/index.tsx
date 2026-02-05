import { useCallback, useRef } from "react";
import { StudioBaseTable } from "./BaseTable";
import type { StudioTableProps } from "./BaseTable";

export function StudioTable<T = unknown>(props: StudioTableProps<T>) {
	const {
		state,
		onKeyDown: customKeyDownHandler,
		onKeyUp: customKeyUpHandler,
	} = props;

	const shiftSelectionPosition = useRef<{ x: number; y: number } | null>(null);

	const onShiftKeyDownCallBack = useCallback(
		(e: React.KeyboardEvent) => {
			const focus = state.getFocus();

			if (e.shiftKey && focus) {
				let lastShiftPosition = shiftSelectionPosition.current;

				if (!lastShiftPosition) {
					const selectedRange = state.getSelectionRange(focus.y, focus.x);
					if (selectedRange) {
						lastShiftPosition = { x: selectedRange.x2, y: selectedRange.y2 };
					}
				}

				if (!lastShiftPosition) {
					return;
				}

				const rows = state.getRowsCount();
				const cols = state.getHeaderCount();
				let horizontal: "right" | "left" = "left";
				let vertical: "top" | "bottom" = "bottom";

				if (e.key === "ArrowUp") {
					lastShiftPosition.y = Math.max(lastShiftPosition.y - 1, 0);
					horizontal = "left";
					vertical = "top";
				}
				if (e.key === "ArrowDown") {
					horizontal = "left";
					vertical = "bottom";
					lastShiftPosition.y = Math.min(lastShiftPosition.y + 1, rows - 1);
				}
				if (e.key === "ArrowLeft") {
					horizontal = "left";
					vertical = "top";
					lastShiftPosition.x = Math.max(lastShiftPosition.x - 1, 0);
				}
				if (e.key === "ArrowRight") {
					horizontal = "right";
					vertical = "top";
					lastShiftPosition.x = Math.min(lastShiftPosition.x + 1, cols - 1);
				}

				state.selectCellRange(
					focus.y,
					focus.x,
					lastShiftPosition.y,
					lastShiftPosition.x
				);

				shiftSelectionPosition.current = lastShiftPosition;
				state.scrollToCell(horizontal, vertical, lastShiftPosition);
			}
		},
		[state]
	);

	// Provide key navigation
	const onKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (state.isInEditMode()) {
				return;
			}

			if (customKeyDownHandler) {
				customKeyDownHandler(e);
			}

			if (e.defaultPrevented) {
				return;
			}

			if (e.key === "ArrowRight") {
				if (e.shiftKey) {
					onShiftKeyDownCallBack(e);
				} else {
					const focus = state.getFocus();
					if (focus && focus.x + 1 < state.getHeaderCount()) {
						state.setFocus(focus.y, focus.x + 1);
						state.scrollToCell("right", "top", { y: focus.y, x: focus.x + 1 });
					}
				}
			} else if (e.key === "ArrowLeft") {
				if (e.shiftKey) {
					onShiftKeyDownCallBack(e);
				} else {
					const focus = state.getFocus();
					if (focus && focus.x - 1 >= 0) {
						state.setFocus(focus.y, focus.x - 1);
						state.scrollToCell("left", "top", { y: focus.y, x: focus.x - 1 });
					}
				}
			} else if (e.key === "ArrowUp") {
				if (e.shiftKey) {
					onShiftKeyDownCallBack(e);
				} else {
					const focus = state.getFocus();
					if (focus && focus.y - 1 >= 0) {
						state.setFocus(focus.y - 1, focus.x);
						state.scrollToCell("left", "top", { y: focus.y - 1, x: focus.x });
					}
				}
			} else if (e.key === "ArrowDown") {
				if (e.shiftKey) {
					onShiftKeyDownCallBack(e);
				} else {
					const focus = state.getFocus();
					if (focus && focus.y + 1 < state.getRowsCount()) {
						state.setFocus(focus.y + 1, focus.x);
						state.scrollToCell("left", "bottom", {
							y: focus.y + 1,
							x: focus.x,
						});
					}
				}
			} else if (e.key === "Tab") {
				const direction = e.shiftKey ? -1 : 1;
				const focus = state.getFocus();

				if (focus) {
					const colCount = state.getHeaderCount();
					const n = focus.y * colCount + focus.x + direction;
					const x = n % colCount;
					const y = Math.floor(n / colCount);
					if (y >= state.getRowsCount() || y < 0) {
						return;
					}
					state.setFocus(y, x);
					state.scrollToCell(
						x === 0 || (e.shiftKey && x < colCount - 1) ? "left" : "right",
						e.shiftKey ? "top" : "bottom",
						{
							y: y,
							x: x,
						}
					);
				}
			} else if (e.key === "Enter") {
				state.enterEditMode();
			}

			e.preventDefault();
		},
		[onShiftKeyDownCallBack, customKeyDownHandler, state]
	);

	const onKeyUp = useCallback(
		(e: React.KeyboardEvent) => {
			if (state.isInEditMode()) {
				return;
			}

			if (e.key === "Shift") {
				shiftSelectionPosition.current = null;
			}

			if (customKeyUpHandler) {
				customKeyUpHandler(e);
			}
		},
		[shiftSelectionPosition, customKeyUpHandler, state]
	);

	const onGutterClick = useCallback(
		(e: React.MouseEvent, rowNumber: number) => {
			const focusCell = state.getFocus();
			if (e.shiftKey && focusCell) {
				state.selectRowRange(focusCell.y, rowNumber);
			} else if (e.ctrlKey && focusCell) {
				state.addSelectionRow(rowNumber);
				state.setFocus(rowNumber, 0);
			} else {
				state.selectRow(rowNumber);
				state.setFocus(rowNumber, 0);
			}
		},
		[state]
	);

	const onCellMouseDown = useCallback(
		(e: React.MouseEvent, { x, y }: { x: number; y: number }) => {
			const shiftKey = e.shiftKey;
			const focusedCell = state.getFocus();

			if (e.button === 2) {
				if (state.getCellStatus(y, x).isSelected) {
					return;
				}
			}

			if (shiftKey && focusedCell) {
				state.selectCellRange(focusedCell.y, focusedCell.x, y, x);
			} else if (e.ctrlKey) {
				state.addSelectionRange(y, x, y, x);
			} else {
				state.selectCell(y, x);
			}
		},
		[state]
	);

	return (
		<StudioBaseTable
			{...props}
			onKeyDown={onKeyDown}
			onKeyUp={onKeyUp}
			onGutterClick={onGutterClick}
			onCellMouseDown={onCellMouseDown}
		/>
	);
}
