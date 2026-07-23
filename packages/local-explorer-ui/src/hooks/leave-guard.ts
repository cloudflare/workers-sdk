import { useCallback, useEffect, type DependencyList } from "react";

type LeaveEvent = "navigation" | "unload";

interface UseLeaveGuardOptions {
	/**
	 * List of reactive dependencies used inside `onBeforeLeave`.
	 * Similar to a `useCallback` dependency array.
	 */
	dependencies?: DependencyList;

	/**
	 * Enable or disable the leave guard. When false, no blocking is applied.
	 */
	enabled: boolean;

	/**
	 * Handle user attempting to leave.
	 *
	 * - Return a `string` to show a confirmation message.
	 * - Return `true` to block without a prompt.
	 * - Return `false` or nothing to allow the leave.
	 */
	onBeforeLeave: (event: LeaveEvent) => string | boolean | void;
}

/**
 * useLeaveGuard adds an unload guard to the current page.
 * Useful for warning users before they leave a page with unsaved changes.
 *
 * Note: This simplified version only handles browser unload events.
 * In-app navigation blocking requires integration with your router.
 */
export function useLeaveGuard({
	dependencies = [],
	enabled,
	onBeforeLeave,
}: UseLeaveGuardOptions): void {
	const handlerCallback = useCallback(onBeforeLeave, [
		...dependencies,
		onBeforeLeave,
	]);

	// Block tab close or refresh
	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (!enabled) {
				return;
			}

			const result = handlerCallback("unload");

			if (typeof result === "string") {
				e.preventDefault();
				return;
			}

			if (result === true || result === undefined) {
				e.preventDefault();
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [enabled, handlerCallback]);
}
