import { useCallback, useEffect, useRef, useState } from "react";
import { withMinimumDelay } from "../../../utils/async";

interface CursorPage<T> {
	items: T[];
	nextCursor?: string;
}

interface CursorPaginatedListOptions<T> {
	fetchPage: (cursor?: string) => Promise<CursorPage<T>>;
	initialPage: CursorPage<T>;
	onPageChange?: () => void;
	pageErrorMessages: {
		next: string;
		previous: string;
		refresh: string;
	};
}

export type CursorPageLoadResult = "success" | "stale";

interface CursorPaginatedList<T> {
	error: string | null;
	hasNext: boolean;
	hasPrevious: boolean;
	items: T[];
	nextPage: () => Promise<void>;
	paging: boolean;
	previousPage: () => Promise<void>;
	refresh: () => Promise<void>;
	refreshFirstPage: () => Promise<CursorPageLoadResult>;
	refreshing: boolean;
}

function errorMessage(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * Manages cursor navigation, refreshes, and stale-request protection for a list.
 *
 * @param options - Page loading and user-facing error configuration.
 * @returns State and actions for rendering a cursor-paginated list.
 */
export function useCursorPaginatedList<T>({
	fetchPage,
	initialPage,
	onPageChange,
	pageErrorMessages,
}: CursorPaginatedListOptions<T>): CursorPaginatedList<T> {
	const [items, setItems] = useState<T[]>(initialPage.items);
	const [currentCursor, setCurrentCursor] = useState<string | undefined>();
	const [nextCursor, setNextCursor] = useState<string | undefined>(
		initialPage.nextCursor
	);
	const [previousCursors, setPreviousCursors] = useState<
		Array<string | undefined>
	>([]);
	const [paging, setPaging] = useState<boolean>(false);
	const [refreshing, setRefreshing] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const request = useRef<number>(0);
	const pagingRequest = useRef<number | undefined>(undefined);
	const refreshingRequest = useRef<number | undefined>(undefined);

	useEffect(() => {
		request.current += 1;
		pagingRequest.current = undefined;
		refreshingRequest.current = undefined;
		setItems(initialPage.items);
		setCurrentCursor(undefined);
		setNextCursor(initialPage.nextCursor);
		setPreviousCursors([]);
		setPaging(false);
		setRefreshing(false);
		setError(null);
	}, [initialPage]);

	const loadPage = useCallback(
		async (
			cursor: string | undefined,
			kind: "page" | "refresh",
			resetNavigation: boolean,
			minimumDelay = false
		): Promise<CursorPageLoadResult> => {
			const requestId = request.current + 1;
			request.current = requestId;
			setError(null);
			if (kind === "page") {
				pagingRequest.current = requestId;
				setPaging(true);
			} else {
				pagingRequest.current = undefined;
				setPaging(false);
				refreshingRequest.current = requestId;
				setRefreshing(true);
			}

			try {
				const pageRequest = fetchPage(cursor);
				const page = minimumDelay
					? await withMinimumDelay(pageRequest)
					: await pageRequest;
				if (requestId !== request.current) {
					return "stale";
				}
				setItems(page.items);
				setNextCursor(page.nextCursor);
				if (resetNavigation) {
					setCurrentCursor(undefined);
					setPreviousCursors([]);
					onPageChange?.();
				}
				return "success";
			} catch (cause) {
				if (requestId !== request.current) {
					return "stale";
				}
				const fallback =
					kind === "refresh"
						? pageErrorMessages.refresh
						: pageErrorMessages.next;
				setError(errorMessage(cause, fallback));
				throw cause;
			} finally {
				if (pagingRequest.current === requestId) {
					pagingRequest.current = undefined;
					setPaging(false);
				}
				if (refreshingRequest.current === requestId) {
					refreshingRequest.current = undefined;
					setRefreshing(false);
				}
			}
		},
		[fetchPage, onPageChange, pageErrorMessages.next, pageErrorMessages.refresh]
	);

	const refresh = useCallback(async (): Promise<void> => {
		try {
			await loadPage(currentCursor, "refresh", false, true);
		} catch {
			// loadPage owns the visible list error.
		}
	}, [currentCursor, loadPage]);

	const refreshFirstPage =
		useCallback(async (): Promise<CursorPageLoadResult> => {
			return loadPage(undefined, "refresh", true);
		}, [loadPage]);

	async function nextPage(): Promise<void> {
		if (!nextCursor) {
			return;
		}
		try {
			if ((await loadPage(nextCursor, "page", false)) === "stale") {
				return;
			}
			setPreviousCursors((cursors) => [...cursors, currentCursor]);
			setCurrentCursor(nextCursor);
			onPageChange?.();
		} catch (cause) {
			setError(errorMessage(cause, pageErrorMessages.next));
		}
	}

	async function previousPage(): Promise<void> {
		const previousCursor = previousCursors.at(-1);
		if (previousCursors.length === 0) {
			return;
		}
		try {
			if ((await loadPage(previousCursor, "page", false)) === "stale") {
				return;
			}
			setPreviousCursors((cursors) => cursors.slice(0, -1));
			setCurrentCursor(previousCursor);
			onPageChange?.();
		} catch (cause) {
			setError(errorMessage(cause, pageErrorMessages.previous));
		}
	}

	return {
		error,
		hasNext: nextCursor !== undefined,
		hasPrevious: previousCursors.length > 0,
		items,
		nextPage,
		paging,
		previousPage,
		refresh,
		refreshFirstPage,
		refreshing,
	};
}
