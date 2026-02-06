import { Button } from "@cloudflare/kumo";
import { EditorView, lineNumbers } from "@codemirror/view";
import {
	flip,
	offset,
	shift,
	useDismiss,
	useFloating,
	useInteractions,
} from "@floating-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StudioCodeMirror } from "../CodeMirror";
import { StudioTableDisplayCell } from "./DisplayCell";
import type { StudioResultValue } from "../../../types/studio";
import type { StudioCodeMirrorReference } from "../CodeMirror";
import type { StudioTableHeaderProps } from "../Table/BaseTable";
import type { StudioResultHeaderMetadata } from "../Table/StateHelpers";
import type { StudioTableState } from "../Table/TableState";
import type { ReactNode } from "react";

export type StudioTableCellEditorType = "input" | "json" | "text";

const POPOVER_WIDTH = 500;
const POPOVER_HEIGHT = 200;
export interface TableEditableCell<T = unknown> {
	value: StudioResultValue<T>;
	isChanged?: boolean;
	focus?: boolean;
	editMode?: boolean;
	state: StudioTableState<StudioResultHeaderMetadata>;
	onChange?: (newValue: StudioResultValue<T>) => void;
	editor?: StudioTableCellEditorType;
	header: StudioTableHeaderProps<StudioResultHeaderMetadata>;
}

interface TabeEditableCellProps<T = unknown> {
	toString: (v: unknown) => StudioResultValue<string>;
	toValue: (v: StudioResultValue<string>) => StudioResultValue<T>;
	align?: "left" | "right";
}

function InputCellEditor({
	value,
	align,
	discardChange,
	readOnly,
	applyChange,
	onChange,
	state,
	popover,
	popoverPlaceholder,
}: Readonly<{
	align?: "left" | "right";
	applyChange: (v: StudioResultValue<string>, shouldExit?: boolean) => void;
	discardChange: () => void;
	value: StudioResultValue<string>;
	onChange: (v: string) => void;
	state: StudioTableState<StudioResultHeaderMetadata>;
	readOnly?: boolean;
	popover?: boolean;
	popoverPlaceholder?: ReactNode;
}>) {
	const inputRef = useRef<HTMLInputElement>(null);
	const shouldExit = useRef(true);

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.select();
			inputRef.current.focus();
		}
	}, [inputRef]);

	const { refs, floatingStyles, context } = useFloating({
		open: popover,
		onOpenChange: (open) => {
			if (!open) {
				state.exitEditMode();
			}
		},
		placement: "bottom-start",
		middleware: [offset(10), flip(), shift()],
	});

	const dismiss = useDismiss(context);
	const { getFloatingProps } = useInteractions([dismiss]);

	return (
		<>
			{popover &&
				createPortal(
					<div
						className="bg-surface border border-color rounded fixed shadow flex flex-col"
						ref={refs.setFloating}
						style={{
							...floatingStyles,
							width: POPOVER_WIDTH,
							height: POPOVER_HEIGHT,
						}}
						{...getFloatingProps()}
					>
						<PopoverEditor
							readOnly={readOnly}
							defaultValue={value}
							onApply={(stagingValue) => {
								onChange(stagingValue ?? "");
								applyChange(stagingValue, true);
							}}
						/>
					</div>,
					document.body
				)}
			{popover ? (
				<div ref={refs.setReference} className="w-full h-full">
					{popoverPlaceholder}
				</div>
			) : (
				<input
					ref={inputRef}
					autoFocus
					readOnly={readOnly}
					autoComplete="off"
					autoCorrect="off"
					autoCapitalize="off"
					spellCheck="false"
					onBlur={() => {
						applyChange(value, shouldExit.current);
					}}
					onChange={(e) => {
						onChange(e.currentTarget.value);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							applyChange(value);
							e.stopPropagation();
						} else if (e.key === "Escape") {
							discardChange();
						} else if (e.key === "Tab") {
							// Enter the next cell
							const focus = state.getFocus();
							if (focus) {
								const colCount = state.getHeaderCount();
								const n = focus.y * colCount + focus.x + 1;
								const x = n % colCount;
								const y = Math.floor(n / colCount);
								if (y >= state.getRowsCount()) {
									return;
								}

								shouldExit.current = false;
								applyChange(value, false);

								state.setFocus(y, x);
								state.scrollToCell(x === 0 ? "left" : "right", "bottom", focus);
								e.preventDefault();
								e.stopPropagation();
							}
						}
					}}
					type="text"
					className={
						align === "right"
							? "h-full w-full border-0 bg-inherit pr-2 pl-2 text-right text-xs font-mono! outline-hidden"
							: "h-full w-full border-0 bg-inherit pr-2 pl-2 text-xs font-mono! outline-hidden"
					}
					value={value ?? ""}
				/>
			)}
		</>
	);
}

function PopoverEditor({
	defaultValue,
	readOnly,
	onApply,
}: {
	defaultValue: StudioResultValue<string>;
	readOnly?: boolean;
	onApply: (value: StudioResultValue<string>) => void;
}) {
	const editorRef = useRef<StudioCodeMirrorReference>(null);

	const extensions = useMemo(() => {
		return [lineNumbers(), EditorView.lineWrapping];
	}, []);

	return (
		<>
			<div className="grow overflow-hidden">
				<StudioCodeMirror
					ref={editorRef}
					className="h-full"
					defaultValue={defaultValue ?? ""}
					extensions={extensions}
					autoFocus
					readOnly={readOnly}
				/>
			</div>
			<div className="p-2 border-t border-border flex justify-end">
				<Button
					variant="primary"
					size="sm"
					onClick={() => {
						onApply(editorRef.current?.getValue());
					}}
				>
					Apply
				</Button>
			</div>
		</>
	);
}

export function createStudioEditableCell<T = unknown>({
	toString,
	toValue,
	align,
}: TabeEditableCellProps<T>): React.FC<TableEditableCell<T>> {
	return function GenericEditableCell({
		value,
		onChange,
		state,
		editor,
		editMode,
		header,
	}: TableEditableCell<T>) {
		const [editValue, setEditValue] = useState<StudioResultValue<string>>(
			toString(value)
		);

		const editorType = state.getForcedEditorType() ?? editor;

		useEffect(() => {
			setEditValue(toString(value));
		}, [value]);

		const applyChange = useCallback(
			(v: StudioResultValue<string>, shouldExitEdit = true) => {
				if (onChange) {
					onChange(toValue(v));
				}
				if (shouldExitEdit) {
					state.exitEditMode();
				}
			},
			[onChange, state]
		);

		const discardChange = useCallback(() => {
			setEditValue(toString(value));
			state.exitEditMode();
		}, [setEditValue, state, value]);

		if (editMode) {
			return (
				<div className="flex" style={{ height: "35px", lineHeight: "35px" }}>
					<InputCellEditor
						state={state}
						readOnly={header.setting.readonly || state.getReadOnlyMode()}
						align={align}
						applyChange={applyChange}
						discardChange={discardChange}
						onChange={setEditValue}
						value={editValue}
						popover={editorType === "text"}
						popoverPlaceholder={
							<StudioTableDisplayCell
								header={header}
								value={toValue(editValue)}
								align={align}
							/>
						}
					/>
				</div>
			);
		}

		return (
			<StudioTableDisplayCell
				header={header}
				value={toValue(editValue)}
				align={align}
				onDoubleClick={() => {
					state.enterEditMode();
				}}
			/>
		);
	};
}
