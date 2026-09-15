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

interface CursorPaginatedList<T> {
	error: string | null;
	hasNext: boolean;
	hasPrevious: boolean;
	items: T[];
	nextPage: () => Promise<void>;
	paging: boolean;
	previousPage: () => Promise<void>;
	refresh: () => Promise<void>;
	refreshing: boolean;
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

	useEffect(() => {
		request.current += 1;
		setItems(initialPage.items);
		setCurrentCursor(undefined);
		setNextCursor(initialPage.nextCursor);
		setPreviousCursors([]);
		setError(null);
	}, [initialPage]);

	const loadPage = useCallback(
		async (cursor?: string): Promise<boolean> => {
			const requestId = request.current + 1;
			request.current = requestId;
			let page: CursorPage<T>;
			try {
				page = await fetchPage(cursor);
			} catch (cause) {
				if (requestId !== request.current) {
					return false;
				}
				throw cause;
			}
			if (requestId !== request.current) {
				return false;
			}
			setItems(page.items);
			setNextCursor(page.nextCursor);
			return true;
		},
		[fetchPage]
	);

	const refresh = useCallback(async (): Promise<void> => {
		setRefreshing(true);
		setError(null);
		try {
			await withMinimumDelay(loadPage(currentCursor));
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : pageErrorMessages.refresh
			);
		} finally {
			setRefreshing(false);
		}
	}, [currentCursor, loadPage, pageErrorMessages.refresh]);

	async function nextPage(): Promise<void> {
		if (!nextCursor) {
			return;
		}
		setPaging(true);
		setError(null);
		try {
			if (!(await loadPage(nextCursor))) {
				return;
			}
			setPreviousCursors((cursors) => [...cursors, currentCursor]);
			setCurrentCursor(nextCursor);
			onPageChange?.();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : pageErrorMessages.next);
		} finally {
			setPaging(false);
		}
	}

	async function previousPage(): Promise<void> {
		const previousCursor = previousCursors.at(-1);
		if (previousCursors.length === 0) {
			return;
		}
		setPaging(true);
		setError(null);
		try {
			if (!(await loadPage(previousCursor))) {
				return;
			}
			setPreviousCursors((cursors) => cursors.slice(0, -1));
			setCurrentCursor(previousCursor);
			onPageChange?.();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : pageErrorMessages.previous
			);
		} finally {
			setPaging(false);
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
		refreshing,
	};
}
