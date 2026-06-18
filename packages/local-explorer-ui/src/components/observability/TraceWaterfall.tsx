import { cn } from "@cloudflare/kumo";
import { useMemo, useState } from "react";
import {
	buildSpanTree,
	parseAttributes,
	spanKind,
	type SpanRow,
} from "../../lib/traces";
import type { LayoutSpan } from "../../lib/traces";

interface TraceWaterfallProps {
	spans: SpanRow[];
	rootSpanId: string;
	traceDurationMs: number;
}

const NAME_WIDTH = 300;
const ROW_H = 32; // px, matches Stratus h-8

// Kind → small dot color (kind is shown via the dot, like Stratus's per-kind icon).
const KIND_DOT: Record<string, string> = {
	http: "bg-purple-500",
	kv: "bg-blue-500",
	d1: "bg-cyan-500",
	fetch: "bg-emerald-500",
	r2: "bg-violet-500",
	do: "bg-orange-500",
	span: "bg-gray-400",
};

const KIND_LABEL: Record<string, string> = {
	http: "HTTP",
	kv: "KV",
	d1: "D1",
	fetch: "FETCH",
	r2: "R2",
	do: "DO",
	span: "",
};

// Bar color encodes state (Stratus model): root = orange, error = red, else accent.
function barColor(span: LayoutSpan): string {
	if (span.error || (span.outcome && span.outcome !== "ok")) {
		return "bg-red-500";
	}
	if (span.depth === 0) {
		return "bg-orange-500";
	}
	return "bg-indigo-500";
}

function niceTicks(max: number): { ticks: number[]; step: number } {
	const target = 6;
	const raw = Math.max(max / target, 1);
	const pow = Math.pow(10, Math.floor(Math.log10(raw)));
	const step = [1, 2, 5, 10].map((c) => c * pow).find((c) => c >= raw) ?? pow * 10;
	const ticks: number[] = [];
	for (let t = 0; t <= max; t += step) {
		ticks.push(t);
	}
	return { ticks, step };
}

export function TraceWaterfall({
	spans,
	rootSpanId,
	traceDurationMs,
}: TraceWaterfallProps): JSX.Element {
	const ordered = useMemo(
		() => buildSpanTree(spans, rootSpanId),
		[spans, rootSpanId]
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	const total = Math.max(
		1,
		traceDurationMs ||
			ordered.reduce((m, s) => Math.max(m, (s.end_ms ?? s.start_ms) || 0), 0)
	);
	const scale = total * 1.05; // 5% right padding
	const { ticks } = useMemo(() => niceTicks(scale), [scale]);

	const selected = ordered.find((s) => s.span_id === selectedId) ?? null;

	const rowBg = (id: string) =>
		selectedId === id
			? "bg-blue-100 dark:bg-blue-900/30"
			: hoveredId === id
				? "bg-kumo-tint"
				: "";

	return (
		<div className="bg-kumo-elevated overflow-hidden rounded-lg border">
			<div className="flex">
				{/* ---- name column ---- */}
				<div
					className="border-r shrink-0"
					style={{ width: NAME_WIDTH }}
				>
					<div className="text-text-secondary flex h-9 items-center border-b px-3 text-xs font-medium">
						Span
					</div>
					{ordered.map((span) => {
						const k = spanKind(span);
						const isErr =
							!!span.error || (!!span.outcome && span.outcome !== "ok");
						return (
							<button
								type="button"
								key={span.span_id}
								onClick={() =>
									setSelectedId(selectedId === span.span_id ? null : span.span_id)
								}
								onMouseEnter={() => setHoveredId(span.span_id)}
								onMouseLeave={() => setHoveredId(null)}
								className={cn(
									"flex w-full items-center gap-2 overflow-hidden px-3 text-left transition-colors",
									rowBg(span.span_id)
								)}
								style={{ height: ROW_H, paddingLeft: 12 + span.depth * 16 }}
							>
								<span
									className={cn(
										"size-2 shrink-0 rounded-full",
										KIND_DOT[k] ?? KIND_DOT.span
									)}
								/>
								<span
									className={cn(
										"truncate font-mono text-xs",
										isErr ? "text-red-500" : "text-text"
									)}
								>
									{span.name ?? "span"}
								</span>
								{KIND_LABEL[k] ? (
									<span className="text-text-secondary ml-auto shrink-0 text-[9px] tracking-wide">
										{KIND_LABEL[k]}
									</span>
								) : null}
							</button>
						);
					})}
				</div>

				{/* ---- timeline column ---- */}
				<div className="relative flex-1">
					{/* vertical gridlines */}
					<div className="pointer-events-none absolute inset-0">
						{ticks.map((t, i) => (
							<div
								key={i}
								className="border-kumo-fill absolute top-0 bottom-0 border-l"
								style={{ left: `${(t / scale) * 100}%` }}
							/>
						))}
					</div>

					{/* axis */}
					<div className="text-text-secondary relative h-9 border-b text-[10px]">
						{ticks.map((t, i) => (
							<span
								key={i}
								className="absolute top-1/2 -translate-y-1/2 pl-1"
								style={{ left: `${(t / scale) * 100}%` }}
							>
								{t}ms
							</span>
						))}
					</div>

					{/* bars */}
					{ordered.map((span) => {
						const leftPct = (span.start_ms / scale) * 100;
						const widthPct = (span.duration_ms / scale) * 100;
						const wide = widthPct > 8;
						return (
							<button
								type="button"
								key={span.span_id}
								onClick={() =>
									setSelectedId(selectedId === span.span_id ? null : span.span_id)
								}
								onMouseEnter={() => setHoveredId(span.span_id)}
								onMouseLeave={() => setHoveredId(null)}
								className={cn(
									"relative block w-full transition-colors",
									rowBg(span.span_id)
								)}
								style={{ height: ROW_H }}
							>
								<div
									className={cn(
										"absolute top-1/2 flex h-3.5 -translate-y-1/2 items-center rounded-sm",
										barColor(span)
									)}
									style={{
										left: `${leftPct}%`,
										width: `${widthPct}%`,
										minWidth: 3,
									}}
								>
									{wide ? (
										<span className="truncate px-1.5 text-[10px] font-medium text-white">
											{Math.round(span.duration_ms)}ms
										</span>
									) : null}
								</div>
								{!wide ? (
									<span
										className="text-text-secondary absolute top-1/2 -translate-y-1/2 pl-1 text-[10px]"
										style={{ left: `${leftPct + widthPct}%` }}
									>
										{Math.round(span.duration_ms)}ms
									</span>
								) : null}
							</button>
						);
					})}
				</div>
			</div>

			{selected ? <SpanDetail span={selected} /> : null}
		</div>
	);
}

function SpanDetail({ span }: { span: LayoutSpan }): JSX.Element {
	const attrs = parseAttributes(span);
	const entries = Object.entries(attrs);
	const isErr = !!span.error || (!!span.outcome && span.outcome !== "ok");
	return (
		<div className="bg-kumo-base border-t p-4">
			<div className="mb-3 flex items-center gap-2">
				<span
					className={cn(
						"size-2 rounded-full",
						KIND_DOT[spanKind(span)] ?? KIND_DOT.span
					)}
				/>
				<span className="text-text font-mono text-sm font-semibold">
					{span.name}
				</span>
				<span
					className={cn(
						"rounded px-1.5 py-0.5 text-[10px] font-medium",
						isErr
							? "bg-red-500/15 text-red-500"
							: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
					)}
				>
					{span.outcome ?? "?"}
				</span>
				<span className="text-text-secondary text-xs">
					{Math.round(span.duration_ms)}ms
				</span>
			</div>
			{span.error ? (
				<div className="mb-3 rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
					{span.error}
				</div>
			) : null}
			{entries.length ? (
				<div className="overflow-hidden rounded border">
					<table className="w-full text-xs">
						<tbody>
							{entries.map(([k, v], i) => (
								<tr
									key={k}
									className={cn(
										"align-top",
										i % 2 ? "bg-kumo-elevated" : ""
									)}
								>
									<td className="text-text-secondary w-1/3 px-3 py-1.5 font-mono whitespace-nowrap">
										{k}
									</td>
									<td className="text-text px-3 py-1.5 font-mono break-all">
										{typeof v === "object" ? JSON.stringify(v) : String(v)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="text-text-secondary text-xs italic">No attributes</div>
			)}
		</div>
	);
}
