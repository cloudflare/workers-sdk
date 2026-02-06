import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { useStudioContextMenu } from "../ContextMenu";
import { exportStudioDataAsDelimitedText } from "../utils-export";
import type { StudioResultHeaderMetadata } from "../Table/StateHelpers";
import type { StudioTableState } from "../Table/TableState";
import type { DropdownItemBuilderProps } from "@cloudflare/kumo";

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
			window.navigator.clipboard.writeText(text);
			return;
		}

		// Fallback: copy a single cell value
		const value = state.getValue(y, x);
		if (value != null) {
			window.navigator.clipboard.writeText(String(value));
		}
	}, [state]);

	const pasteCallback = useCallback(() => {
		const focus = state.getFocus();
		if (focus) {
			const y = focus.y;
			const x = focus.x;
			window.navigator.clipboard.readText().then((pasteValue) => {
				const data = pasteValue.split("\r\n").map((row) => row.split("\t"));

				for (let row = 0; row < data.length; row++) {
					if (row === data.length - 1) {
						if (data[row].length === 1 && data[row][0] === "") {
							break;
						}
					}
					for (let col = 0; col < data[row].length; col++) {
						state.changeValue(
							y + row,
							x + col,
							data[row][col].toLowerCase() === "null" ? null : data[row][col]
						);
					}
				}
			});
		}
	}, [state]);

	const onContextMenu = useCallback(
		({
			state,
			event,
		}: {
			state: StudioTableState<StudioResultHeaderMetadata>;
			event: React.MouseEvent<Element, MouseEvent>;
		}) => {
			const uuid = window.crypto.randomUUID();
			const selectedRowIndex = state.getSelectedRowIndex();

			const readOnlyMode = state
				.getHeaders()
				.every((header) => header.setting.readonly);

			const contextMenuItemList: DropdownItemBuilderProps[] = [
				{
					type: "button",
					label: "Open in Multi-line Editor",
					onClick: () => {
						state.enterEditMode("text");
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
								const focus = state.getFocus();
								if (focus) {
									state.changeValue(focus.y, focus.x, null);
								}
							},
						},
						{ type: "divider" },
						{
							type: "button",
							label: (
								<div>
									<div>UUID</div>
									<div className="font-mono text-neutral-500">{uuid}</div>
								</div>
							),
							onClick: () => {
								const focus = state.getFocus();
								if (focus) {
									state.changeValue(focus.y, focus.x, uuid);
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
								state.insertNewRow();
							},
						},
						{
							type: "button",
							label: "Delete selected row(s)",
							disabled: selectedRowIndex.length === 0,
							icon: TrashIcon,
							onClick: () => {
								selectedRowIndex.forEach((rowIndex) =>
									state.removeRow(rowIndex)
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
