/**
 * Stub for useLeaveGuard hook
 * Simplified version without react-router-dom dependency
 */

import { useCallback, useEffect } from "react";

type LeaveEvent = "navigation" | "unload";

interface UseLeaveGuardOptions {
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

	/**
	 * List of reactive dependencies used inside `onBeforeLeave`.
	 * Similar to a `useCallback` dependency array.
	 */
	dependencies?: React.DependencyList;

	/**
	 * Optional fallback message when `onBeforeLeave` returns void.
	 */
	fallbackMessage?: string;
}

/**
 * useLeaveGuard adds an unload guard to the current page.
 * Useful for warning users before they leave a page with unsaved changes.
 *
 * Note: This simplified version only handles browser unload events.
 * In-app navigation blocking requires integration with your router.
 */
export function useLeaveGuard({
	enabled,
	onBeforeLeave,
	fallbackMessage = "You have unsaved changes. Are you sure you want to leave?",
	dependencies = [],
}: UseLeaveGuardOptions) {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const handlerCallback = useCallback(onBeforeLeave, dependencies);

	// Block tab close or refresh
	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (!enabled) {
				return;
			}

			const result = handlerCallback("unload");

			if (typeof result === "string") {
				e.preventDefault();
				e.returnValue = result;
			} else if (result === true || result === undefined) {
				e.preventDefault();
				e.returnValue = fallbackMessage;
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [enabled, handlerCallback, fallbackMessage]);
}
