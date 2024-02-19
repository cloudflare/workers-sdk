export async function wrap<T, E extends Error>(
	fn: Promise<T>
): Promise<[T, null] | [null, E]> {
	return fn
		.then((data) => [data, null] as [T, null])
		.catch((err) => [null, err as unknown as E] as [null, E]);
}
