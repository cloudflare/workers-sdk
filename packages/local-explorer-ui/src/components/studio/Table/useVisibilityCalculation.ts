import { useCallback, useEffect, useState } from "react";
import type { StudioTableHeaderProps } from "./BaseTable";
import type { StudioTableState } from "./State";

/**
 * Giving the container, we calculate visible rows and column
 *
 * @param e container elements
 * @param headerSizes size of each headers
 * @param totalRowCount total number of rows
 * @param rowHeight fixed height of each row
 * @param renderAhead number of rows that we need to pre-render ahead
 * @returns
 */
function getVisibleCellRange(
	e: HTMLDivElement,
	headerSizes: number[],
	totalRowCount: number,
	rowHeight: number,
	renderAhead: number,
	gutterWidth: number
) {
	const currentRowStart = Math.max(
		0,
		Math.floor(e.scrollTop / rowHeight) - 1 - renderAhead
	);
	const currentRowEnd = Math.min(
		totalRowCount,
		currentRowStart +
			Math.ceil(e.getBoundingClientRect().height / rowHeight) +
			renderAhead
	);

	let currentColStart = -1;
	let currentColAccumulateSize = gutterWidth;
	let currentColEnd = -1;

	const visibleXStart = e.scrollLeft;
	const visibleXEnd = visibleXStart + e.getBoundingClientRect().width;

	for (let i = 0; i < headerSizes.length; i++) {
		if (currentColAccumulateSize >= visibleXStart && currentColStart < 0) {
			currentColStart = i - 1;
		}

		currentColAccumulateSize += headerSizes[i] ?? 0;

		if (currentColAccumulateSize >= visibleXEnd && currentColEnd < 0) {
			currentColEnd = i;
			break;
		}
	}

	if (currentColEnd < 0) {
		currentColEnd = headerSizes.length - 1;
	}
	if (currentColStart < 0) {
		currentColStart = 0;
	}
	if (currentColEnd >= headerSizes.length) {
		currentColEnd = headerSizes.length - 1;
	}

	return {
		colStart: currentColStart,
		colEnd: currentColEnd,
		rowStart: currentRowStart,
		rowEnd: currentRowEnd,
	};
}

interface useStudioTableVisibilityOptions {
	containerRef: React.RefObject<HTMLDivElement | null>;
	headers: StudioTableHeaderProps[];
	renderAhead: number;
	rowHeight: number;
	state: StudioTableState;
	totalRowCount: number;
}

export function useStudioTableVisibility({
	containerRef,
	headers,
	renderAhead,
	rowHeight,
	state,
	totalRowCount,
}: useStudioTableVisibilityOptions) {
	const [visibleDebounce, setVisibleDebounce] = useState<{
		colEnd: number;
		colStart: number;
		rowEnd: number;
		rowStart: number;
	}>({
		colEnd: 0,
		colStart: 0,
		rowEnd: 0,
		rowStart: 0,
	});

	const recalculateVisible = useCallback(
		(e: HTMLDivElement): void => {
			const headerSizes = state.getHeaderWidth();
			setVisibleDebounce(
				getVisibleCellRange(
					e,
					headers.map((header) => headerSizes[header.index]) as number[],
					totalRowCount,
					rowHeight,
					renderAhead,
					state.gutterColumnWidth
				)
			);
		},
		[setVisibleDebounce, totalRowCount, rowHeight, renderAhead, headers, state]
	);

	const onHeaderResize = useCallback(
		(idx: number, newWidth: number): void => {
			if (containerRef.current) {
				state.setHeaderWidth(idx, newWidth);
				recalculateVisible(containerRef.current);
			}
		},
		[state, recalculateVisible, containerRef]
	);

	// Recalculate the visibility again when we scroll the container
	useEffect(() => {
		const ref = containerRef.current;

		if (ref) {
			const onContainerScroll = (e: Event) => {
				recalculateVisible(e.currentTarget as HTMLDivElement);
				e.preventDefault();
				e.stopPropagation();
			};

			ref.addEventListener("scroll", onContainerScroll);
			return () => ref.removeEventListener("scroll", onContainerScroll);
		}
	}, [containerRef, recalculateVisible]);

	useStudioElementResize<HTMLDivElement>(recalculateVisible, containerRef);

	return {
		onHeaderResize,
		visibileRange: visibleDebounce,
	};
}

function useStudioElementResize<T extends Element = Element>(
	callback: (element: T) => void,
	ref: React.RefObject<T | null>
): void {
	useEffect((): void => {
		if (ref.current) {
			callback(ref.current);
		}
	}, [ref, callback]);

	useEffect(() => {
		if (ref.current) {
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					callback(entry.target as T);
				}
			});

			resizeObserver.observe(ref.current);
			return () => resizeObserver.disconnect();
		}
	}, [ref, callback]);
}
