import { createContext, useContext, useState, type ReactNode } from "react";
import type { FunctionDef } from "./types";

interface DiagramContextValue {
	functions: Record<string, FunctionDef>;
	isAnimating: boolean;
	setIsAnimating: (value: boolean) => void;
}

const DiagramContext = createContext<DiagramContextValue>({
	functions: {},
	isAnimating: false,
	setIsAnimating: () => {},
});

export function DiagramProvider({
	children,
	functions,
}: {
	children: ReactNode;
	functions: Record<string, FunctionDef>;
}) {
	const [isAnimating, setIsAnimating] = useState(false);

	return (
		<DiagramContext.Provider value={{ functions, isAnimating, setIsAnimating }}>
			{children}
		</DiagramContext.Provider>
	);
}

export function useDiagramContext() {
	return useContext(DiagramContext);
}
