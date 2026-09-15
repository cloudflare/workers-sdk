/**
 * Span-kind icons for the trace waterfall. Storage kinds reuse the same SVG
 * assets the rest of the app already ships in `assets/icons` (so D1/KV/R2/DO
 * match the sidebar), and the remaining kinds map onto phosphor icons rather
 * than bespoke inline SVGs.
 */
import { cn } from "@cloudflare/kumo";
import { GlobeIcon, LightningIcon, RowsIcon } from "@phosphor-icons/react";
import D1Icon from "../../assets/icons/d1.svg?react";
import DOIcon from "../../assets/icons/durable-objects.svg?react";
import KVIcon from "../../assets/icons/kv.svg?react";
import R2Icon from "../../assets/icons/r2.svg?react";
import { spanKind } from "../../utils/observability";
import type { LayoutSpan } from "../../utils/observability";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { FunctionComponent, JSX, SVGProps } from "react";

export interface SpanIconProps {
	size?: number;
	className?: string;
}

/** Uniform icon component so `getSpanIcon` can mix SVG assets and phosphor icons. */
export type SpanIconComponent = (props: SpanIconProps) => JSX.Element;

/**
 * Wrap an imported SVG asset (which takes `width`/`height` and paints via
 * `currentColor`) so it takes a single `size` and a baked-in color class, to
 * match the phosphor icon call signature used across the waterfall.
 */
function fromSvg(
	Svg: FunctionComponent<SVGProps<SVGSVGElement>>,
	colorClass: string
): SpanIconComponent {
	return function SvgSpanIcon({ size = 16, className }: SpanIconProps) {
		return (
			<Svg width={size} height={size} className={cn(colorClass, className)} />
		);
	};
}

/** Wrap a phosphor icon with a baked-in color class. */
function fromPhosphor(
	Icon: PhosphorIcon,
	colorClass: string
): SpanIconComponent {
	return function PhosphorSpanIcon({ size = 16, className }: SpanIconProps) {
		return <Icon size={size} className={cn(colorClass, className)} />;
	};
}

const D1_ICON = fromSvg(D1Icon, "text-orange-500");
const KV_ICON = fromSvg(KVIcon, "text-orange-500");
const R2_ICON = fromSvg(R2Icon, "text-orange-500");
const DO_ICON = fromSvg(DOIcon, "text-orange-500");
const HTTP_ICON = fromPhosphor(GlobeIcon, "text-violet-500");
const WORKER_ICON = fromPhosphor(LightningIcon, "text-orange-500");
const SPAN_ICON = fromPhosphor(RowsIcon, "text-kumo-subtle");

/** Mirror of the dashboard's getSpanIcon, mapped onto our span kinds. */
export function getSpanIcon(span: LayoutSpan): SpanIconComponent {
	if (span.depth === 0) {
		return WORKER_ICON; // root invocation
	}
	switch (spanKind(span)) {
		case "http":
		case "fetch":
			return HTTP_ICON;
		case "d1":
			return D1_ICON;
		case "kv":
			return KV_ICON;
		case "r2":
			return R2_ICON;
		case "do":
			return DO_ICON;
		default:
			return SPAN_ICON;
	}
}
