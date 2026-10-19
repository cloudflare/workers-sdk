const APPLICATION_ID_REGEX =
	/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Returns whether an ID has a supported Containers application ID format. */
export function isValidApplicationId(id: string): boolean {
	return APPLICATION_ID_REGEX.test(id);
}
