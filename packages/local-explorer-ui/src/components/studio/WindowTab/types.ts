import type { Icon } from "@phosphor-icons/react";
import type { JSX, ReactNode } from "react";

export interface StudioWindowTabItem {
	component: JSX.Element;
	icon: Icon;
	identifier: string;
	isDirty?: boolean;
	isTemp?: boolean;
	key: string;
	title: ReactNode;
	type?: string;
}

export type BeforeTabClosingHandler = (tab: StudioWindowTabItem) => boolean;
