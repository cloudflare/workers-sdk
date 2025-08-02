import { CI } from "./is-ci";

/**
 * Use this object to find out if we are currently running under Turborepo.
 *
 * By wrapping this up in a method on an object, it results in clean and testable code.
 */
export const TURBOREPO = {
	/** Is Wrangler currently running under Turborepo? */
	isTurborepo() {
		if (CI.isCI()) {
			return false;
		}

		return !!(
			process.env.TURBO_HASH ||
			process.env.TURBO_TASK ||
			process.env.TURBO_INVOCATION_DIR ||
			process.env.npm_config_user_agent?.includes("turbo")
		);
	},
};
