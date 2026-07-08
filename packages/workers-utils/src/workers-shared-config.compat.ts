/**
 * Compile-time drift guard for the vendored config types in
 * `workers-shared-config.ts`.
 *
 * This file asserts that the vendored types remain structurally interchangeable
 * with the source-of-truth types in `@cloudflare/workers-shared`. If the Zod
 * schemas there change, this file fails to type-check (via `check:type`),
 * flagging the drift so the vendored copy can be updated.
 *
 * It is intentionally imported by nothing: keeping the `@cloudflare/workers-shared`
 * import out of the entry graph is exactly what lets the vendored types stay
 * decoupled from workers-shared source in the bundled `.d.ts` output.
 */
import type {
	AssetConfig as VendoredAssetConfig,
	RouterConfig as VendoredRouterConfig,
} from "./workers-shared-config";
import type {
	AssetConfig as SourceAssetConfig,
	RouterConfig as SourceRouterConfig,
} from "@cloudflare/workers-shared/utils/types";

type IsAssignable<A, B> = [A] extends [B] ? true : false;
type Assert<T extends true> = T;

// Bidirectional assignability — errors if either direction breaks.
export type _AssetConfigForward = Assert<
	IsAssignable<VendoredAssetConfig, SourceAssetConfig>
>;
export type _AssetConfigBackward = Assert<
	IsAssignable<SourceAssetConfig, VendoredAssetConfig>
>;
export type _RouterConfigForward = Assert<
	IsAssignable<VendoredRouterConfig, SourceRouterConfig>
>;
export type _RouterConfigBackward = Assert<
	IsAssignable<SourceRouterConfig, VendoredRouterConfig>
>;
