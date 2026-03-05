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
import { StudioCodeMirror } from "../../Code/Mirror";
import { StudioTableDisplayCell } from "./DisplayCell";
import type { StudioResultValue } from "../../../../types/studio";
import type { StudioCodeMirrorReference } from "../../Code/Mirror";
import type { StudioTableHeaderProps } from "../BaseTable";
import type { StudioTableState } from "../State";
import type { StudioResultHeaderMetadata } from "../State/Helpers";
import type { Extension } from "@codemirror/state";
import type { ReactNode } from "react";

export type StudioTableCellEditorType = "input" | "json" | "text";

const POPOVER_WIDTH = 500;
const POPOVER_HEIGHT = 200;

export interface TableEditableCell<T = unknown> {
	editMode?: boolean;
	editor?: StudioTableCellEditorType;
	focus?: boolean;
	header: StudioTableHeaderProps<StudioResultHeaderMetadata>;
	isChanged?: boolean;
	onChange?: (newValue: StudioResultValue<T>) => void;
	state: StudioTableState<StudioResultHeaderMetadata>;
	value: StudioResultValue<T>;
}

interface TabeEditableCellProps<T = unknown> {
	align?: "left" | "right";
	toString: (v: unknown) => StudioResultValue<string>;
	toValue: (v: StudioResultValue<string>) => StudioResultValue<T>;
}

interface InputCellEditorProps {
	align?: "left" | "right";
	applyChange: (v: StudioResultValue<string>, shouldExit?: boolean) => void;
	discardChange: () => void;
	onChange: (v: string) => void;
	popover?: boolean;
	popoverPlaceholder?: ReactNode;
	readOnly?: boolean;
	state: StudioTableState<StudioResultHeaderMetadata>;
	value: StudioResultValue<string>;
}

function InputCellEditor({
	align,
	applyChange,
	discardChange,
	onChange,
	popover,
	popoverPlaceholder,
	readOnly,
	state,
	value,
}: Readonly<InputCellEditorProps>): JSX.Element {
	const inputRef = useRef<HTMLInputElement>(null);
	const shouldExit = useRef<boolean>(true);

	useEffect((): void => {
		if (inputRef.current) {
			inputRef.current.select();
			inputRef.current.focus();
		}
	}, [inputRef]);

	const { refs, floatingStyles, context } = useFloating({
		middleware: [offset(10), flip(), shift()],
		onOpenChange: (open): void => {
			if (!open) {
				state.exitEditMode();
			}
		},
		open: popover,
		placement: "bottom-start",
	});

	const dismiss = useDismiss(context);
	const { getFloatingProps } = useInteractions([dismiss]);

	return (
		<>
			{popover &&
				createPortal(
					<div
						className="bg-surface border border-border rounded fixed shadow flex flex-col"
						ref={refs.setFloating}
						style={{
							...(floatingStyles as React.CSSProperties),
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
				// eslint-disable-next-line react-hooks/refs -- `refs.setReference` is a callback ref from @floating-ui/react, not a .current access
				<div ref={refs.setReference} className="w-full h-full">
					{popoverPlaceholder}
				</div>
			) : (
				<input
					autoCapitalize="off"
					autoComplete="off"
					autoCorrect="off"
					autoFocus
					className={
						align === "right"
							? "h-full w-full border-0 bg-inherit pr-2 pl-2 text-right text-xs font-mono! outline-hidden"
							: "h-full w-full border-0 bg-inherit pr-2 pl-2 text-xs font-mono! outline-hidden"
					}
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
					readOnly={readOnly}
					ref={inputRef}
					spellCheck="false"
					type="text"
					value={value ?? ""}
				/>
			)}
		</>
	);
}

interface PopoverEditorProps {
	defaultValue: StudioResultValue<string>;
	onApply: (value: StudioResultValue<string>) => void;
	readOnly?: boolean;
}

function PopoverEditor({
	defaultValue,
	onApply,
	readOnly,
}: PopoverEditorProps): JSX.Element {
	const editorRef = useRef<StudioCodeMirrorReference>(null);

	const extensions = useMemo(
		(): Extension[] => [lineNumbers(), EditorView.lineWrapping],
		[]
	);

	return (
		<>
			<div className="grow overflow-hidden">
				<StudioCodeMirror
					autoFocus
					className="h-full"
					defaultValue={defaultValue ?? ""}
					extensions={extensions}
					readOnly={readOnly}
					ref={editorRef}
				/>
			</div>
			<div className="p-2 border-t border-border flex justify-end">
				<Button
					onClick={() => {
						onApply(editorRef.current?.getValue());
					}}
					size="sm"
					variant="primary"
				>
					Apply
				</Button>
			</div>
		</>
	);
}

export function createStudioEditableCell<T = unknown>({
	align,
	toString,
	toValue,
}: TabeEditableCellProps<T>): React.FC<TableEditableCell<T>> {
	return function GenericEditableCell({
		editMode,
		editor,
		header,
		onChange,
		state,
		value,
	}: TableEditableCell<T>) {
		const [editValue, setEditValue] = useState<StudioResultValue<string>>(
			toString(value)
		);

		const editorType = state.getForcedEditorType() ?? editor;

		useEffect((): void => {
			setEditValue(toString(value));
		}, [value]);

		const applyChange = useCallback(
			(v: StudioResultValue<string>, shouldExitEdit = true): void => {
				if (onChange) {
					onChange(toValue(v));
				}
				if (shouldExitEdit) {
					state.exitEditMode();
				}
			},
			[onChange, state]
		);

		const discardChange = useCallback((): void => {
			setEditValue(toString(value));
			state.exitEditMode();
		}, [setEditValue, state, value]);

		if (editMode) {
			return (
				<div className="flex" style={{ height: "35px", lineHeight: "35px" }}>
					<InputCellEditor
						align={align}
						applyChange={applyChange}
						discardChange={discardChange}
						onChange={setEditValue}
						popover={editorType === "text"}
						popoverPlaceholder={
							<StudioTableDisplayCell
								header={header}
								value={toValue(editValue)}
								align={align}
							/>
						}
						readOnly={header.setting.readonly || state.getReadOnlyMode()}
						state={state}
						value={editValue}
					/>
				</div>
			);
		}

		return (
			<StudioTableDisplayCell
				align={align}
				header={header}
				onDoubleClick={() => {
					state.enterEditMode();
				}}
				value={toValue(editValue)}
			/>
		);
	};
}
