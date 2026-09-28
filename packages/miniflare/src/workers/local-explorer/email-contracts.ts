import type { EmailRoutingItem } from "./generated";

/** Normalizes capability fields omitted by older Local Explorer peers. */
export function normalizeEmailRoutingItemCapabilities(
	item: EmailRoutingItem
): EmailRoutingItem & {
	editAndResendAvailable: boolean;
	capturedPortion: boolean;
} {
	return {
		...item,
		editAndResendAvailable: item.editAndResendAvailable ?? false,
		capturedPortion: item.capturedPortion ?? false,
	};
}
