import { createContext, useContext } from "react";
import type {
	IStudioDriver,
	StudioResource,
	StudioSavedQuery,
	StudioSchemas,
} from "../../types/studio";
import type { StudioTabDefinitionMetadata } from "./tab-register";
import type { StudioWindowTabItem } from "./WindowTab";
import type { PropsWithChildren } from "react";

export interface StudioContextValue {
	driver: IStudioDriver;

	schemas?: StudioSchemas;
	loadingSchema: boolean;
	refreshSchema: () => void;

	// Tab manipulation context
	tabs: StudioWindowTabItem[];
	selectedTabKey: string;
	setStudioTabs: React.Dispatch<React.SetStateAction<StudioWindowTabItem[]>>;
	setSelectedTabKey: React.Dispatch<React.SetStateAction<string>>;

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

	savedQueries?: StudioSavedQuery[];
	loadingSavedQueries: boolean;
	refreshSavedQueries: () => void;

	resource: StudioResource;

	/**
	 * Callback for when the active table changes (for URL sync)
	 */
	onTableChange?: (tableName: string | null) => void;
}

const StudioContext = createContext<StudioContextValue | undefined>(undefined);

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
