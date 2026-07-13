/**
 * Span-kind icons for the trace waterfall. We reuse the Phosphor icon set (as
 * the rest of the Local Explorer does) rather than bespoke SVGs, mapping each
 * span kind to a recognisable glyph.
 */
import {
	CircleIcon,
	CubeIcon,
	DatabaseIcon,
	GlobeIcon,
	LightningIcon,
} from "@phosphor-icons/react";
import { spanKind } from "../../utils/observability";
import type { LayoutSpan } from "../../utils/observability";
import type { Icon } from "@phosphor-icons/react";

/** Mirror of the dashboard's getSpanIcon, mapped onto our span kinds. */
export function getSpanIcon(span: LayoutSpan): Icon {
	if (span.depth === 0) {
		return LightningIcon; // root worker invocation
	}
	switch (spanKind(span)) {
		case "http":
		case "fetch":
			return GlobeIcon;
		case "d1":
		case "kv":
		case "r2":
			return DatabaseIcon;
		case "do":
			return CubeIcon;
		default:
			return CircleIcon;
	}
}
