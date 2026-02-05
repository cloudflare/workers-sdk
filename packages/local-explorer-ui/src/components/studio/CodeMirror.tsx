import { Annotation, EditorState, StateEffect } from "@codemirror/state";
import {
	EditorView,
	placeholder as placeholderExtension,
} from "@codemirror/view";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { Extension } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";

/**
 * React binding for CodeMirror with minimal built-in extensions.
 * Supports placeholder and content change events only.
 */
export const StudioCodeMirror = forwardRef<
	StudioCodeMirrorReference,
	StudioCodeMirrorProps
>(
	(
		{
			className,
			extensions,
			onChange,
			onCursorChange,
			autoFocus,
			defaultValue,
			placeholder,
			readOnly,
		},
		ref
	) => {
		const container = useRef<HTMLDivElement>(null);
		const [editorView, setEditorView] = useState<EditorView>();
		const defaultValueRef = useRef(defaultValue);

		useLayoutEffect(() => {
			if (!container.current) {
				return;
			}

			const view = new EditorView({
				parent: container.current,
				doc: defaultValueRef?.current,
			});

			setEditorView(view);

			return () => view.destroy();
		}, [container, defaultValueRef]);

		// Registers new extensions with CodeMirror,
		// including built-in support for placeholder and onChange events.
		useEffect(() => {
			if (!editorView) {
				return;
			}

			const combinedExtensions = [...(extensions ?? [])];

			if (onChange) {
				combinedExtensions.push(
					EditorView.updateListener.of((viewUpdate: ViewUpdate) => {
						if (
							viewUpdate.docChanged &&
							onChange &&
							!viewUpdate.transactions.some((tr) =>
								tr.annotation(BlockOnChangeTrigger)
							)
						) {
							onChange(viewUpdate);
						}
					})
				);
			}

			if (onCursorChange) {
				combinedExtensions.push(
					EditorView.updateListener.of((state) => {
						const pos = state.state.selection.main.head;
						const line = state.state.doc.lineAt(pos);
						const lineNumber = line.number;
						const columnNumber = pos - line.from;
						onCursorChange(pos, lineNumber, columnNumber);
					})
				);
			}

			if (placeholder) {
				combinedExtensions.push(placeholderExtension(placeholder));
			}

			if (readOnly) {
				combinedExtensions.push(EditorState.readOnly.of(true));
			}

			editorView.dispatch({
				effects: StateEffect.reconfigure.of(combinedExtensions),
			});
		}, [
			editorView,
			extensions,
			onChange,
			onCursorChange,
			placeholder,
			readOnly,
		]);

		// Exposes the CodeMirror editor instance and helper methods
		// for getting and setting the editor content via ref.
		useImperativeHandle(
			ref,
			() => ({
				getValue: () => {
					if (!editorView) {
						return "";
					}
					return editorView.state.doc.toString();
				},
				setValue: (value: string) => {
					if (!editorView) {
						return;
					}

					const currentValue = editorView.state.doc.toString();
					editorView.dispatch({
						changes: { from: 0, to: currentValue.length, insert: value || "" },
						annotations: [BlockOnChangeTrigger.of(true)],
					});
				},
				view: editorView,
			}),
			[editorView]
		);

		// Auto focus
		useEffect(() => {
			if (autoFocus && editorView) {
				editorView.focus();
			}
		}, [autoFocus, editorView]);

		return <div ref={container} className={className}></div>;
	}
);
StudioCodeMirror.displayName = "StudioCodeMirror";

const BlockOnChangeTrigger = Annotation.define<boolean>();

export interface StudioCodeMirrorProps {
	extensions?: Extension[];
	className?: string;
	onChange?: (update: ViewUpdate) => void;
	onCursorChange?: (
		pos: number,
		lineNumber: number,
		columnNumber: number
	) => void;
	defaultValue?: string;
	placeholder?: string;
	autoFocus?: boolean;
	readOnly?: boolean;
}

export interface StudioCodeMirrorReference {
	setValue: (value: string) => void;
	getValue: () => string;
	view?: EditorView;
}
