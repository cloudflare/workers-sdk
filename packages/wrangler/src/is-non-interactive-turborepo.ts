/** Returns whether Turborepo is running the task without forwarding input. */
export default function isNonInteractiveTurborepo(
	env: NodeJS.ProcessEnv = process.env
): boolean {
	return Boolean(env.TURBO_HASH) && env.TURBO_IS_TUI !== "true";
}
