import { getPlatformProxy as originalGetPlatformProxy } from "wrangler";
import type { GetPlatformProxyOptions } from "wrangler";

// Here we wrap the actual original getPlatformProxy function and disable its persistance, this is to make sure
// that we don't implement any persistance during these tests (which would add unnecessary extra complexity)
export function getPlatformProxy<T>(
	options: Omit<GetPlatformProxyOptions, "persist"> = {}
): ReturnType<typeof originalGetPlatformProxy<T>> {
	return originalGetPlatformProxy({
		...options,
		persist: false,
	});
}
