import type { Icon } from "@phosphor-icons/react";

export interface StudioWindowTabItem {
	component: React.JSX.Element;
	icon: Icon;
	identifier: string;
	isDirty?: boolean;
	isTemp?: boolean;
	key: string;
	title: React.ReactNode;
	type?: string;
}

export type BeforeTabClosingHandler = (tab: StudioWindowTabItem) => boolean;
