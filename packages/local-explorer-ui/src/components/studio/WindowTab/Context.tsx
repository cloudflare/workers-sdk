import { createContext, useContext } from "react";
import type { BeforeTabClosingHandler } from "./types";

export interface IStudioCurrentWindowTabContext {
	identifier: string;
	isTabActive: boolean;
	setBeforeTabClosingHandler: (handler: BeforeTabClosingHandler) => void;
	setDirtyState: (dirtyState: boolean) => void;
}

export const StudioCurrentWindowTabContext =
	createContext<IStudioCurrentWindowTabContext | null>(null);

export function useStudioCurrentWindowTab(): IStudioCurrentWindowTabContext {
	const context = useContext(StudioCurrentWindowTabContext);
	if (!context) {
		throw new Error("Cannot useStudioCurrentWindowTab outside StudioWindowTab");
	}

	return context;
}
