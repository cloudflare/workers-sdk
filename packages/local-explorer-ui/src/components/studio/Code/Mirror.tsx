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
			autoFocus,
			className,
			defaultValue,
			extensions,
			onChange,
			onCursorChange,
			placeholder,
			readOnly,
		},
		ref
	) => {
		const container = useRef<HTMLDivElement>(null);
		const defaultValueRef = useRef<string>(defaultValue);

		const [editorView, setEditorView] = useState<EditorView>();

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

			const combinedExtensions = [...(extensions ?? [])] satisfies Extension[];

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
						const position = state.state.selection.main.head;
						const line = state.state.doc.lineAt(position);
						const lineNumber = line.number;
						const columnNumber = position - line.from;
						onCursorChange(position, lineNumber, columnNumber);
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
				getValue: (): string => {
					if (!editorView) {
						return "";
					}

					return editorView.state.doc.toString();
				},
				setValue: (value: string): void => {
					if (!editorView) {
						return;
					}

					const currentValue = editorView.state.doc.toString();
					editorView.dispatch({
						annotations: [BlockOnChangeTrigger.of(true)],
						changes: {
							from: 0,
							insert: value || "",
							to: currentValue.length,
						},
					});
				},
				view: editorView,
			}),
			[editorView]
		);

		// Auto focus
		useEffect((): void => {
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
	autoFocus?: boolean;
	className?: string;
	defaultValue?: string;
	extensions?: Extension[];
	onChange?: (update: ViewUpdate) => void;
	onCursorChange?: (
		position: number,
		lineNumber: number,
		columnNumber: number
	) => void;
	placeholder?: string;
	readOnly?: boolean;
}

export interface StudioCodeMirrorReference {
	getValue: () => string;
	setValue: (value: string) => void;
	view?: EditorView;
}
