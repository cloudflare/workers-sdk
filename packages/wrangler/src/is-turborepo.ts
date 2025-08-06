/**
 * Detects if Wrangler is running under Turborepo
 */
export const TURBOREPO = {
	/**
	 * Check if we're running under Turborepo by looking for environment variables
	 * that Turbo sets when executing tasks
	 */
	isTurborepo(): boolean {
		return !!(
			process.env.TURBO_HASH ||
			process.env.TURBO_TASK ||
			process.env.TURBO_INVOCATION_DIR ||
			(process.env.npm_config_user_agent &&
				process.env.npm_config_user_agent.includes("turbo"))
		);
	},
};
