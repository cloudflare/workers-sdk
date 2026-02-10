/**
 * SplitPane wrapper component
 * Thin wrapper around react-split-pane for compatibility
 */

import * as React from "react";
import ReactSplitPane from "react-split-pane";
import type { SplitPaneProps as ReactSplitPaneProps } from "react-split-pane";

type Props = ReactSplitPaneProps & {
	children?: React.ReactNode;
};

type State = {
	dragging: boolean;
};

const BORDER_COLOR = "var(--color-resizer)";

class SplitPane extends React.Component<Props, State> {
	override state: State = {
		dragging: false,
	};

	onDragStarted = () => {
		this.setState({ dragging: true });
		if (this.props.onDragStarted) {
			this.props.onDragStarted();
		}
	};

	onDragFinished = (newSize: number) => {
		this.setState({ dragging: false });
		if (this.props.onDragFinished) {
			this.props.onDragFinished(newSize);
		}
	};

	override render() {
		const { children, split, ...otherProps } = this.props;
		const { dragging } = this.state;
		const { onDragStarted, onDragFinished } = this;

		let resizerStyle: React.CSSProperties = {
			...(this.props.resizerStyle as React.CSSProperties),
			backgroundColor: BORDER_COLOR,
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
			...(this.props.paneStyle as React.CSSProperties),
		};

		// the iframes in our draggable panels cause issues since
		// the iframe window will catch the mousemove events but
		// in order for dragging to work, they need to be handled
		// by the parent window. So, while we're dragging, we add
		// `pointerEvents: 'none'` to prevent the iframes from
		// intercepting mouse events
		const style: React.CSSProperties = {
			...(this.props.style as React.CSSProperties),
			zIndex: 0,
		};
		if (dragging) {
			style.pointerEvents = "none";
		}

		return (
			// @ts-expect-error -- csstype version mismatch between react-split-pane (3.1.2) and React (3.2.3); runtime CSS is identical
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
		);
	}
}

export default SplitPane;
