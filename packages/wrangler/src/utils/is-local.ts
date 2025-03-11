export function isLocal(
	args: {
		local: boolean | undefined;
		remote: boolean | undefined;
	},
	defaultValue = true
): boolean {
	if (args.local === undefined && args.remote === undefined) {
		return defaultValue;
	}
	return args.local === true || args.remote === false;
}
