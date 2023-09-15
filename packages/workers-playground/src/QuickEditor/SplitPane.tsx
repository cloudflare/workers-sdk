import { isDarkMode, theme } from "@cloudflare/style-const";
import React, { createContext, useContext, useState } from "react";
// @ts-expect-error Types are wrong
import ReactSplitPane, { Props as ReactSplitPaneProps } from "react-split-pane";
import { BORDER_GRAY } from "./constants";

export const DragContext = createContext(false);

export default function SplitPane(props: ReactSplitPaneProps) {
	const onDragStarted = () => {
		setIsDragging(true);
		props.onDragStarted?.();
	};

	const onDragFinished = (newSize: number) => {
		setIsDragging(false);
		props.onDragFinished?.(newSize);
	};

	// the iframes in our draggable panels cause issues since
	// the iframe window will catch the mousemove events but
	// in order for dragging to work, they need to be handled
	// by the parent window. So, while we're dragging, we add
	// `pointerEvents: 'none'` to prevent the iframes from
	// intercepting mouse events. We do this by providing the dragging
	// state through React Context, and expect children to apply this
	// To support nested SplitPane components, defer to the parent
	const isParentDragging = useContext(DragContext);
	const [_isDragging, setIsDragging] = useState(false);

	const isDragging = _isDragging || isParentDragging;

	const { children, split, ...otherProps } = props;

	let resizerStyle: React.CSSProperties = {
		...props.resizerStyle,
		backgroundColor: BORDER_GRAY,
		opacity: 1,
		backgroundClip: "padding-box",
		zIndex: 1,
	};

	if (split === "horizontal") {
		resizerStyle = {
			...resizerStyle,
			height: "11px",
			minHeight: "11px",
			borderTop: "5px solid transparent",
			borderBottom: "5px solid transparent",
			marginTop: "-5px",
			marginBottom: "-5px",
			cursor: "row-resize",
		};
	} else {
		resizerStyle = {
			...resizerStyle,
			width: "11px",
			minWidth: "11px",
			borderLeft: "5px solid transparent",
			borderRight: "5px solid transparent",
			marginLeft: "-5px",
			marginRight: "-5px",
			cursor: "col-resize",
		};
	}

	const paneStyle: React.CSSProperties = {
		overflow: "hidden",
		...props.paneStyle,
		backgroundColor: isDarkMode() ? theme.colors.gray[8] : theme.colors.white,
	};

	const style: React.CSSProperties = { ...props.style, zIndex: 0 };

	return (
		<DragContext.Provider value={isDragging}>
			<ReactSplitPane
				{...otherProps}
				{...{
					split,
					style,
					paneStyle,
					resizerStyle,
					onDragStarted,
					onDragFinished,
				}}
			>
				{children}
			</ReactSplitPane>
		</DragContext.Provider>
	);
}
