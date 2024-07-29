import type { Request, Response } from "miniflare";
import type { UnstableASSETSBindingsOptions } from "wrangler";

export async function buildPagesASSETSBinding(
	assetsPath: string
): Promise<(request: Request) => Promise<Response>> {
	// noinspection SuspiciousTypeOfGuard
	if (typeof assetsPath !== "string") {
		throw new TypeError(
			"Failed to execute 'buildPagesASSETSBinding': parameter 1 is not of type 'string'."
		);
	}

	const { unstable_generateASSETSBinding } = await import("wrangler"); // (lazy)
	const log = {
		...console,
		debugWithSanitization: console.debug,
		loggerLevel: "info",
		columns: process.stdout.columns,
	} as unknown as UnstableASSETSBindingsOptions["log"];
	return unstable_generateASSETSBinding({ log, directory: assetsPath });
}
