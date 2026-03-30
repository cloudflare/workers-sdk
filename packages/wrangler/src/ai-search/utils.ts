import { logger } from "../logger";

/**
 * Parse repeatable --filter key=value flags into a filter object.
 */
export function parseFilters(
	filters: string[] | undefined
): Record<string, string> | undefined {
	if (!filters || filters.length === 0) {
		return undefined;
	}
	const result: Record<string, string> = {};
	for (const f of filters) {
		const eqIndex = f.indexOf("=");
		if (eqIndex === -1) {
			logger.warn(`Ignoring malformed filter "${f}" (expected key=value)`);
			continue;
		}
		const key = f.slice(0, eqIndex);
		const value = f.slice(eqIndex + 1);
		result[key] = value;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}
