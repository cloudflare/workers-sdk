export function reduceError(e: any) {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
	};
}
