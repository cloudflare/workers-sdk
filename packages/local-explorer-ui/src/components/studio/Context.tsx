import { createContext, useContext } from "react";
import type {
	IStudioDriver,
	StudioResource,
	StudioSchemas,
} from "../../types/studio";
import type { StudioTabDefinitionMetadata } from "./TabRegister";
import type { StudioWindowTabItem } from "./WindowTab/types";
import type { PropsWithChildren } from "react";

export interface StudioContextValue {
	driver: IStudioDriver;
	loadingSchema: boolean;
	refreshSchema: () => void;
	resource: StudioResource;
	schemas: StudioSchemas | null;

	// Tab manipulation context
	selectedTabKey: string;
	setSelectedTabKey: React.Dispatch<React.SetStateAction<string>>;
	setStudioTabs: React.Dispatch<React.SetStateAction<StudioWindowTabItem[]>>;
	tabs: StudioWindowTabItem[];

	// Tab management
	closeStudioTab: (identifier: string) => void;
	openStudioTab: (data: StudioTabDefinitionMetadata, isTemp?: boolean) => void;
	replaceStudioTab: (
		identifier: string,
		replaced: StudioTabDefinitionMetadata,
		options?: { withoutReplaceComponent?: boolean; isTemp?: boolean }
	) => void;
	updateStudioTabStatus: (
		identifier: string | StudioTabDefinitionMetadata,
		status: { isDirty?: boolean; isTemp?: boolean }
	) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudioContext() {
	const context = useContext(StudioContext);
	if (!context) {
		throw new Error(
			"useStudioContext must be used within a StudioContextProvider"
		);
	}

	return context;
}

export function StudioContextProvider({
	children,
	value,
}: PropsWithChildren<{ value: StudioContextValue }>) {
	return (
		<StudioContext.Provider value={value}>{children}</StudioContext.Provider>
	);
}
