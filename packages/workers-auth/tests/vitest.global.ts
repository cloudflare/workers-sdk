export function setup(): void {
	// Set `LC_ALL` to fix the language as English for the messages thrown by Yargs,
	// and to make any uses of datetimes in snapshots consistent.
	// This needs to be in a globalSetup script - it won't work in a setupFile script.
	// https://github.com/vitest-dev/vitest/issues/1575#issuecomment-1439286286
	process.env.LC_ALL = "C";
	process.env.TZ = "UTC";
}
