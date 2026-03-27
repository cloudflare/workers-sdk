const isTurboRunning =
	process.env.TURBO_HASH || process.env.TURBO_INVOCATION_DIR;

if (!isTurboRunning) {
	console.error(
		"\x1b[31m%s\x1b[0m",
		"❌ ERROR: Direct script execution is blocked."
	);
	console.error(
		"\x1b[33m%s\x1b[0m",
		"👉 Please run this command from the root of the repository using `pnpm <command> --filter <package>`."
	);
	process.exit(1); // Exits the process and blocks the script from continuing
}
