import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "misc-nodejs-optout",
		// `nodejs_compat`/`nodejs_compat_v2` are enabled by this date on their own,
		// and this project then opts back out of v2. The pool still needs v2 for the
		// runner, so it has to drop the opt-out without adding the redundant flag —
		// specifying it on this date is a workerd validation error.
		compatibilityDate: "2026-08-04",
		compatibilityFlags: ["no_nodejs_compat_v2"],
	},
});
