import type { Transition } from "motion/react";

export const transitions: Record<string, Transition> = {
	swift: {
		type: "spring",
		stiffness: 280,
		damping: 18,
		mass: 0.3,
	},
};
