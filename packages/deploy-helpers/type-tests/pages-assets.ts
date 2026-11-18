import type { generateASSETSBinding as implementation } from "../src/dev/pages-assets";
import type { generateASSETSBinding as declaration } from "../src/dev/pages-assets-types";

type Assert<T extends true> = T;

/** Ensure the isolated Pages implementation matches its Node.js declaration. */
export type PagesAssetsSignature = Assert<
	[typeof implementation, typeof declaration] extends [
		typeof declaration,
		typeof implementation,
	]
		? true
		: false
>;
