const UUID_APPLICATION_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAMESPACE_APPLICATION_ID = /^[0-9a-f]{32}$/;

export function normalizeApplicationId(id: string): string | undefined {
	if (!UUID_APPLICATION_ID.test(id) && !NAMESPACE_APPLICATION_ID.test(id)) {
		return undefined;
	}

	return id.toLowerCase();
}

export function isNamespaceApplicationId(id: string): boolean {
	return NAMESPACE_APPLICATION_ID.test(id);
}
