import path from "node:path";

export function getLocalPersistencePath(
	persistTo: string | undefined,
	configPath: string | undefined
): string;

export function getLocalPersistencePath(
	persistTo: string | undefined,
	configPath: string | undefined
): string | null;

export function getLocalPersistencePath(
	persistTo: string | undefined,
	configPath: string | undefined
) {
	return persistTo
		? // If path specified, always treat it as relative to cwd()
			path.resolve(process.cwd(), persistTo)
		: // Otherwise, treat it as relative to the Wrangler configuration file,
			// if one can be found, otherwise cwd()
			path.resolve(
				configPath ? path.dirname(configPath) : process.cwd(),
				".wrangler/state"
			);
}
