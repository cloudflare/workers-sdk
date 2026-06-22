import { Button, cn } from "@cloudflare/kumo";
import {
	CaretDownIcon,
	CaretRightIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	buildSpanTree,
	parseAttributes,
	type LayoutSpan,
	type SpanRow,
} from "../../lib/traces";
import { getSpanIcon } from "./icons";

interface TraceWaterfallProps {
	spans: SpanRow[];
	rootSpanId: string;
	traceDurationMs: number;
}

const LABEL_WIDTH = 256; // matches the dashboard's default name-column width

// "Nice" interval values for time markers (from the dashboard).
const NICE_INTERVALS = [
	1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000,
	15000, 20000, 30000, 60000, 120000, 300000,
];

function calculateOptimalInterval(
	traceDurationMs: number,
	availableWidth: number
): number {
	const targetGap = 40;
	const maxMarkers = 9;
	const estimatedMarkerCount = Math.min(
		maxMarkers,
		Math.max(2, Math.floor(availableWidth / targetGap))
	);
	const targetInterval = traceDurationMs / estimatedMarkerCount;
	for (const interval of NICE_INTERVALS) {
		if (interval >= targetInterval) {
			return interval;
		}
	}
	return NICE_INTERVALS[NICE_INTERVALS.length - 1] ?? 300000;
}

function formatDuration(ms: number): string {
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(2)}s`;
	}
	if (ms >= 1) {
		return `${Math.round(ms)}ms`;
	}
	return `${ms.toFixed(2)}ms`;
}

function useWidthObserver() {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setWidth(entry.contentRect.width);
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return { ref, width };
}

function hasErr(span: LayoutSpan): boolean {
	return !!span.error || (!!span.outcome && span.outcome !== "ok");
}

export function TraceWaterfall({
	spans,
	rootSpanId,
	traceDurationMs,
}: TraceWaterfallProps): JSX.Element {
	const allSpans = useMemo(
		() => buildSpanTree(spans, rootSpanId),
		[spans, rootSpanId]
	);
	const { ref, width } = useWidthObserver();
	const [collapsed, setCollapsed] = useState<string[]>([]);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	const toggleCollapsed = useCallback((layoutId: string) => {
		setCollapsed((prev) =>
			prev.includes(layoutId)
				? prev.filter((id) => id !== layoutId)
				: [...prev, layoutId]
		);
	}, []);

	// Row click behaviour:
	// - Parent spans: clicking toggles collapse/expand of their subtree (so
	//   clicking an open span again closes it) and selects the span so its
	//   detail panel reflects what you clicked. Re-clicking doesn't toggle the
	//   detail off — collapse is the primary action for parents.
	// - Leaf spans: clicking toggles their detail panel (nothing to collapse).
	const handleRowClick = useCallback(
		(span: LayoutSpan) => {
			if (span.hasChildren) {
				toggleCollapsed(span.layoutId);
				setFocusedId(span.span_id);
			} else {
				setFocusedId((prev) => (prev === span.span_id ? null : span.span_id));
			}
		},
		[toggleCollapsed]
	);

	const isVisible = useCallback(
		(span: LayoutSpan) =>
			!collapsed.some(
				(id) => span.layoutId.startsWith(id + ".") && id !== span.layoutId
			),
		[collapsed]
	);

	const visibleSpans = useMemo(
		() => allSpans.filter(isVisible),
		[allSpans, isVisible]
	);

	// Derive the visible window from the laid-out spans (re-based to the trace
	// start) so it covers sub-invocations that run past the root invocation
	// (e.g. service-binding calls). Falls back to the provided trace duration.
	const spansEnd = allSpans.reduce(
		(max, s) => Math.max(max, s.end_ms ?? s.start_ms + s.duration_ms),
		0
	);
	const traceAreaWidth = Math.max(0, width - LABEL_WIDTH);
	const paddedDuration = Math.max(1, traceDurationMs, spansEnd) * 1.05;
	const pxToMS = traceAreaWidth > 0 ? traceAreaWidth / paddedDuration : 0;

	const interval = calculateOptimalInterval(paddedDuration, traceAreaWidth);
	const markers: Array<{ time: number; left: number }> = [];
	for (let t = 0; t <= paddedDuration; t += interval) {
		const left = t * pxToMS;
		if (left <= traceAreaWidth) {
			markers.push({ time: t, left });
		}
	}

	// Resolve from all spans (not just visible ones) so collapsing a parent
	// doesn't make the selected span's detail panel flicker away.
	const focused = allSpans.find((s) => s.span_id === focusedId) ?? null;

	const rowBg = (id: string) =>
		focusedId === id
			? "bg-blue-100 dark:bg-blue-900/30"
			: hoveredId === id
				? "bg-black/5 dark:bg-white/5"
				: "";

	return (
		<div className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
			<div
				ref={ref}
				className="outline-none"
				role="region"
				aria-label="Trace timeline"
			>
				<div className="flex">
					{/* ---- name column ---- */}
					<div style={{ width: LABEL_WIDTH }} className="shrink-0">
						<div className="flex h-[41px] items-center border-b border-kumo-fill px-4 py-2.5">
							<span className="text-sm font-medium text-kumo-default">
								Name
							</span>
						</div>
						{visibleSpans.map((span) => {
							return (
								<div
									key={span.layoutId}
									role="button"
									tabIndex={0}
									className={cn(
										"h-8 cursor-pointer border-l-2 border-l-transparent transition-colors duration-150",
										rowBg(span.span_id)
									)}
									onClick={() => handleRowClick(span)}
									onMouseEnter={() => setHoveredId(span.span_id)}
									onMouseLeave={() => setHoveredId(null)}
								>
									<SpanLabel
										span={span}
										isCollapsed={collapsed.includes(span.layoutId)}
										onToggleCollapsed={toggleCollapsed}
									/>
								</div>
							);
						})}
					</div>

					{/* ---- timeline column ---- */}
					<div className="relative flex-1" style={{ width: traceAreaWidth }}>
						{/* axis header */}
						<div className="relative flex h-[41px] items-center overflow-hidden border-b border-kumo-fill py-2.5">
							{markers.map(({ time, left }) => (
								<div
									key={time}
									className="absolute text-[10px] text-kumo-subtle"
									style={{ left: `${left + 2}px` }}
								>
									{formatDuration(time)}
								</div>
							))}
						</div>

						{/* marker lines */}
						{markers.slice(1).map(({ time, left }) => (
							<div
								key={`m-${time}`}
								className="pointer-events-none absolute w-px bg-kumo-fill"
								style={{
									left: `${left}px`,
									top: "40px",
									height: "calc(100% - 40px)",
								}}
							/>
						))}

						{/* bars */}
						{visibleSpans.map((span) => {
							return (
								<div
									key={span.layoutId}
									className={cn(
										"flex h-8 cursor-pointer items-center pl-0.5 transition-colors duration-150",
										rowBg(span.span_id)
									)}
									onClick={() => handleRowClick(span)}
									onMouseEnter={() => setHoveredId(span.span_id)}
									onMouseLeave={() => setHoveredId(null)}
								>
									<NormalSpanBar
										span={span}
										pxToMS={pxToMS}
										traceAreaWidth={traceAreaWidth}
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{focused ? <SpanDetail span={focused} /> : null}
		</div>
	);
}

function SpanLabel({
	span,
	isCollapsed,
	onToggleCollapsed,
}: {
	span: LayoutSpan;
	isCollapsed: boolean;
	onToggleCollapsed: (layoutId: string) => void;
}): JSX.Element {
	const error = hasErr(span);
	const Icon = getSpanIcon(span);
	return (
		<div
			className="relative flex h-full w-full items-center gap-2 overflow-hidden pl-4 font-mono text-sm text-ellipsis whitespace-nowrap"
			style={{ paddingLeft: 4 + span.depth * 32, maxWidth: LABEL_WIDTH }}
		>
			{span.hasChildren ? (
				<Button
					shape="square"
					variant="ghost"
					size="xs"
					aria-label={isCollapsed ? "Expand span" : "Collapse span"}
					icon={isCollapsed ? CaretRightIcon : CaretDownIcon}
					onClick={(e) => {
						e.stopPropagation();
						onToggleCollapsed(span.layoutId);
					}}
				/>
			) : null}
			<div
				className={cn(
					"relative z-10 flex min-w-0 items-center gap-2",
					error && "text-red-500"
				)}
			>
				<span className="flex shrink-0 items-center">
					<Icon size={16} />
				</span>
				{error ? (
					<span
						title={span.error ?? "An error occurred in this span"}
						className="flex shrink-0 items-center justify-center rounded-sm bg-red-500/15 p-1 text-red-500"
					>
						<WarningIcon size={12} weight="bold" />
					</span>
				) : null}
				<span className="min-w-0 overflow-hidden text-sm text-ellipsis whitespace-nowrap">
					{span.name ?? "span"}
				</span>
			</div>
		</div>
	);
}

function NormalSpanBar({
	span,
	pxToMS,
	traceAreaWidth,
}: {
	span: LayoutSpan;
	pxToMS: number;
	traceAreaWidth: number;
}): JSX.Element {
	const error = hasErr(span);
	const isRoot = span.depth === 0;
	const spanDuration = span.duration_ms;
	const spanWidth = spanDuration * pxToMS;
	const spanLeft = Math.max(span.start_ms * pxToMS, 0);
	const minWidth = 8;
	const isSmall = spanWidth < 40;
	const isLeftSide = spanLeft < traceAreaWidth / 2;

	const barColor = error
		? "bg-red-500"
		: isRoot
			? "bg-orange-500"
			: "bg-neutral-600 dark:bg-neutral-400";

	return (
		<div
			className="flex w-full items-center"
			style={{ maxWidth: traceAreaWidth }}
		>
			<div className="relative w-full">
				{/* duration chip before bar (small spans on right) */}
				{isSmall && !isLeftSide ? (
					<div
						className="absolute top-0 flex h-5 items-center text-[10px] font-medium text-kumo-subtle"
						style={{ right: `${traceAreaWidth - spanLeft + 4}px` }}
					>
						{formatDuration(spanDuration)}
					</div>
				) : null}

				<div
					className={cn(
						"relative z-10 flex h-5 items-center rounded-sm",
						barColor
					)}
					style={{
						width: `${Math.max(spanWidth, minWidth)}px`,
						left: `${spanLeft + 2}px`,
					}}
				>
					{!isSmall ? (
						<span className="relative left-1 flex items-center px-px text-[10px] font-medium text-white">
							{formatDuration(spanDuration)}
						</span>
					) : null}
				</div>

				{/* duration chip after bar (small spans on left) */}
				{isSmall && isLeftSide ? (
					<div
						className={cn(
							"absolute top-0 flex h-5 items-center text-[10px] text-kumo-subtle",
							error && "text-red-500"
						)}
						style={{
							left: `${spanLeft + Math.max(spanWidth, minWidth) + 4}px`,
						}}
					>
						{formatDuration(spanDuration)}
					</div>
				) : null}
			</div>
		</div>
	);
}

function SpanDetail({ span }: { span: LayoutSpan }): JSX.Element {
	const attrs = parseAttributes(span);
	const entries = Object.entries(attrs);
	const error = hasErr(span);
	const Icon = getSpanIcon(span);
	return (
		<div className="border-t border-kumo-fill bg-kumo-elevated p-4">
			<div className="mb-3 flex items-center gap-2">
				<Icon size={16} />
				<span className="font-mono text-sm font-semibold text-kumo-default">
					{span.name}
				</span>
				<span
					className={cn(
						"rounded px-1.5 py-0.5 text-[10px] font-medium",
						error
							? "bg-red-500/15 text-red-500"
							: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
					)}
				>
					{span.outcome ?? "?"}
				</span>
				<span className="text-xs text-kumo-subtle">
					{formatDuration(span.duration_ms)}
				</span>
			</div>
			{span.error ? (
				<div className="mb-3 rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
					{span.error}
				</div>
			) : null}
			{entries.length ? (
				<div className="overflow-hidden rounded border border-kumo-fill">
					<table className="w-full text-xs">
						<tbody>
							{entries.map(([k, v], i) => (
								<tr
									key={k}
									className={cn("align-top", i % 2 && "bg-kumo-base")}
								>
									<td className="w-1/3 px-3 py-1.5 font-mono whitespace-nowrap text-kumo-subtle">
										{k}
									</td>
									<td className="px-3 py-1.5 font-mono break-all text-kumo-default">
										{typeof v === "object" ? JSON.stringify(v) : String(v)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="text-xs text-kumo-subtle italic">No attributes</div>
			)}
		</div>
	);
}
