import semverGte from "semver/functions/gte";
import { version as viteVersion } from "vite";

export function satisfiesMinimumViteVersion(minVersion: string): boolean {
	return semverGte(viteVersion, minVersion);
}
