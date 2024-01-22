/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { isDarkMode, variables as theme } from "@cloudflare/style-const";
import { createComponent } from "@cloudflare/style-container";
import {
	Tab as ReactTab,
	TabList as ReactTabList,
	TabPanel as ReactTabPanel,
	TabProps as ReactTabProps,
	Tabs as ReactTabs,
} from "react-tabs";
import { BORDER_GRAY, STYLED_TAB_HEIGHT } from "./constants";

const HIGHLIGHT_BLUE = theme.colors.blue[4];

type StyledTabProps = {
	showHighlightBar?: boolean;
} & Omit<ReactTabProps, "ref" | "className">;

export const Tab = createComponent<typeof ReactTab, StyledTabProps>(
	({ theme, selected }) => ({
		display: "flex",
		alignItems: "center",
		height: STYLED_TAB_HEIGHT,
		cursor: "pointer",
		marginLeft: selected ? -1 : 0,
		marginRight: selected ? -1 : 0,
		paddingLeft: theme.space[3],
		paddingRight: theme.space[3],
		borderStyle: "solid",
		borderLeft: "none",
		borderRight: "none",
		borderBottomColor: selected ? "transparent" : BORDER_GRAY,
		borderTopColor: selected ? BORDER_GRAY : "transparent",
		borderTopWidth: 0,
		borderBottom: "none",
		color: selected ? theme.colors.gray[1] : theme.colors.gray[3],
		userSelect: "none",
		position: "relative",
		fontSize: theme.fontSizes[2],
		backgroundColor: selected
			? isDarkMode()
				? theme.colors.gray[8]
				: theme.colors.white
			: isDarkMode()
			? theme.colors.white
			: theme.colors.gray[9],
		outlineOffset: -3,
		borderRadius: 0,
		":first-child": {
			borderLeftWidth: 0,
			marginLeft: 0,
		},
		"&.react-tabs__tab--selected ": {
			borderRadius: 0,
		},
		// Use a psuedo-element for the blue highlight on the active tab
		"&::before": {
			content: '""',
			display: "none",
			position: "absolute",
			bottom: 0,
			left: 0,
			width: "100%",
			height: "1px",
			backgroundColor: HIGHLIGHT_BLUE,
		},
		"&.react-tabs__tab--selected::before": {
			content: '""',
			display: "block",
			position: "absolute",
			bottom: 0,
			left: 0,
			width: "100%",
			height: "1px",
			backgroundColor: HIGHLIGHT_BLUE,
		},
		"& svg": {
			fill: theme.colors.gray[3],
		},
		"&.react-tabs__tab--selected svg": {
			fill: HIGHLIGHT_BLUE,
		},
		"&:hover": {
			color: theme.colors.gray[1],
		},
		"&:hover svg": {
			fill: theme.colors.gray[1],
		},
		"&.react-tabs__tab--selected:hover svg": {
			fill: HIGHLIGHT_BLUE,
		},
		outline: "none",
	}),
	ReactTab
);

export const TabBar = createComponent(() => ({
	width: "100%",
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	backgroundColor: isDarkMode() ? theme.colors.white : theme.colors.gray[9],
	flex: "none",
}));

export const TabList = createComponent(
	() => ({
		flex: "none",
		display: "flex",
		listStyleType: "none",
		margin: 0,
		padding: 0,
	}),
	ReactTabList
);

export const TabBarContent = createComponent(() => ({
	flex: "1 0 auto",
	borderBottom: "none",
	backgroundColor: isDarkMode() ? theme.colors.white : theme.colors.gray[9],
}));

export const Tabs = createComponent(
	() => ({
		display: "flex",
		flexDirection: "column",
		flex: "auto",
		overflow: "hidden",
	}),
	ReactTabs
);

export const TabPanel = createComponent(
	({ selected }) => ({
		display: selected ? "flex" : "none",
		flex: selected ? "auto" : "none",
		position: "relative",
		overflow: "hidden",
	}),
	ReactTabPanel
);
