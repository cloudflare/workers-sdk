import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { useStudioContextMenu } from "../ContextMenu";
import { exportStudioDataAsDelimitedText } from "../utils-export";
import type { DropdownItemBuilderProps } from "../../../types/studio";
import type { StudioResultHeaderMetadata } from "../Table/StateHelpers";
import type { StudioTableState } from "../Table/TableState";

export function useStudioResultTableContextMenu(
	state: StudioTableState<StudioResultHeaderMetadata>
) {
	const { openContextMenu } = useStudioContextMenu();

	const copyCallback = useCallback(() => {
		const focus = state.getFocus();
		if (!focus) {
			return;
		}

		const { x, y } = focus;
		const range = state.getSelectionRange(y, x);

		// If there is a selection range (multi-cell), copy selected data
		if (range && (range.x1 !== range.x2 || range.y1 !== range.y2)) {
			const headers = state
				.getHeaders()
				.slice(range.x1, range.x2 + 1)
				.map((header) => header.name);

			const rows = state
				.getAllRows()
				.slice(range.y1, range.y2 + 1)
				.map((row) => headers.map((header) => row.raw[header]));

			const text = exportStudioDataAsDelimitedText([], rows, "\t", "\r\n", '"');
			void window.navigator.clipboard.writeText(text);
			return;
		}

		// Fallback: copy a single cell value
		const value = state.getValue(y, x);
		if (value != null) {
			void window.navigator.clipboard.writeText(String(value));
		}
	}, [state]);

	const pasteCallback = useCallback(() => {
		const focus = state.getFocus();
		if (focus) {
			const y = focus.y;
			const x = focus.x;
			void window.navigator.clipboard.readText().then((pasteValue) => {
				const data = pasteValue.split("\r\n").map((row) => row.split("\t"));

				for (let row = 0; row < data.length; row++) {
					if (row === data.length - 1) {
						const lastRow = data[row] as string[];
						if (lastRow.length === 1 && lastRow[0] === "") {
							break;
						}
					}
					const currentRow = data[row] as string[];
					for (let col = 0; col < currentRow.length; col++) {
						const cellValue = currentRow[col] as string;
						state.changeValue(
							y + row,
							x + col,
							cellValue.toLowerCase() === "null" ? null : cellValue
						);
					}
				}
			});
		}
	}, [state]);

	const onContextMenu = useCallback(
		({
			state: tableState,
			event,
		}: {
			state: StudioTableState<StudioResultHeaderMetadata>;
			event: React.MouseEvent<Element, MouseEvent>;
		}) => {
			const uuid = window.crypto.randomUUID();
			const selectedRowIndex = tableState.getSelectedRowIndex();

			const readOnlyMode = tableState
				.getHeaders()
				.every((header) => header.setting.readonly);

			const contextMenuItemList: DropdownItemBuilderProps[] = [
				{
					type: "button",
					label: "Open in Multi-line Editor",
					onClick: () => {
						tableState.enterEditMode("text");
					},
				},
				{
					type: "divider",
				},
			];

			if (!readOnlyMode) {
				contextMenuItemList.push({
					type: "button",
					label: "Insert Values",
					sub: [
						{
							type: "button",
							label: <span className="font-mono">NULL</span>,
							onClick: () => {
								const focus = tableState.getFocus();
								if (focus) {
									tableState.changeValue(focus.y, focus.x, null);
								}
							},
						},
						{ type: "divider" },
						{
							type: "button",
							label: (
								<div>
									<div>UUID</div>
									<div className="font-mono text-muted">{uuid}</div>
								</div>
							),
							onClick: () => {
								const focus = tableState.getFocus();
								if (focus) {
									tableState.changeValue(focus.y, focus.x, uuid);
								}
							},
						},
					],
				});
			}

			contextMenuItemList.push({
				type: "button",
				label: "Copy",
				shortcut: "⌘ C",
				onClick: copyCallback,
			});

			if (!readOnlyMode) {
				contextMenuItemList.push(
					...([
						{
							type: "button",
							label: "Paste",
							shortcut: "⌘ V",
							onClick: pasteCallback,
						},
						{ type: "divider" },
						{
							type: "button",
							icon: PlusIcon,
							label: "Insert row",
							onClick: () => {
								tableState.insertNewRow();
							},
						},
						{
							type: "button",
							label: "Delete selected row(s)",
							disabled: selectedRowIndex.length === 0,
							icon: TrashIcon,
							onClick: () => {
								selectedRowIndex.forEach((rowIndex) =>
									tableState.removeRow(rowIndex)
								);
							},
							destructiveAction: true,
						},
					] as DropdownItemBuilderProps[])
				);
			}

			openContextMenu(event, contextMenuItemList);
		},
		[openContextMenu, copyCallback, pasteCallback]
	);

	return { onContextMenu, copyCallback, pasteCallback };
}
