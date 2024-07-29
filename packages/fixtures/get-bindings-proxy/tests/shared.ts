import { getBindingsProxy as originalGetBindingsProxy } from "wrangler";
import type { GetBindingsProxyOptions } from "wrangler";

// Here we wrap the actual original getBindingsProxy function and disable its persistance, this is to make sure
// that we don't implement any persistance during these tests (which would add unnecessary extra complexity)
export function getBindingsProxy<T>(
	options: Omit<GetBindingsProxyOptions, "persist"> = {}
): ReturnType<typeof originalGetBindingsProxy<T>> {
	return originalGetBindingsProxy({
		...options,
		persist: false,
	});
}
