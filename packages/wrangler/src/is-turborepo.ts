export default function isTurborepo(
	env: NodeJS.ProcessEnv = process.env
): boolean {
	return Boolean(env.TURBO_HASH || env.TURBO_TASK || env.TURBO_INVOCATION_DIR);
}
