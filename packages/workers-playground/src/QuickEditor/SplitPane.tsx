/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { isDarkMode, theme } from "@cloudflare/style-const";
import React from "react";
// @ts-expect-error Types are wrong
import ReactSplitPane, { Props as ReactSplitPaneProps } from "react-split-pane";
import { BORDER_GRAY } from "./constants";

type State = {
	dragging: boolean;
};

class SplitPane extends React.Component<ReactSplitPaneProps, State> {
	state: State = {
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

	render() {
		const { children, split, ...otherProps } = this.props;
		const { dragging } = this.state;
		const { onDragStarted, onDragFinished } = this;

		let resizerStyle: React.CSSProperties = {
			...this.props.resizerStyle,
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
			...this.props.paneStyle,
			backgroundColor: isDarkMode() ? theme.colors.gray[8] : theme.colors.white,
		};

		// the iframes in our draggable panels cause issues since
		// the iframe window will catch the mousemove events but
		// in order for dragging to work, they need to be handled
		// by the parent window. So, while we're dragging, we add
		// `pointerEvents: 'none'` to prevent the iframes from
		// intercepting mouse events
		const style: React.CSSProperties = { ...this.props.style, zIndex: 0 };
		if (dragging) {
			// @ts-ignore
			style.pointerEvents = "none";
		}

		return (
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
