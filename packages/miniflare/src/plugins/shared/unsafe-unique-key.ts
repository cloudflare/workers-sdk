// Value of `unsafeUniqueKey` that forces the use of "colo local" ephemeral
// namespaces. These namespaces only provide a `get(id: string): Fetcher` method
// and construct objects without a `state` parameter. See the schema for details:
// https://github.com/cloudflare/workerd/blob/v1.20231206.0/src/workerd/server/workerd.capnp#L529-L543
// Using `Symbol.for()` instead of `Symbol()` in case multiple copies of
// `miniflare` are loaded (e.g. when configuring Vitest and when running pool)
export const kUnsafeEphemeralUniqueKey = Symbol.for(
	"miniflare.kUnsafeEphemeralUniqueKey"
);
export type UnsafeUniqueKey = string | typeof kUnsafeEphemeralUniqueKey;
