import whichPmRuns from "which-pm-runs";
import { version as wranglerVersion } from "../../package.json";

export function getWranglerVersion() {
	return wranglerVersion;
}

export function getPackageManager() {
	return whichPmRuns()?.name;
}

export function getPlatform() {
	const platform = process.platform;

	switch (platform) {
		case "win32":
			return "Windows";
		case "darwin":
			return "Mac OS";
		case "linux":
			return "Linux";
		default:
			return `Others: ${platform}`;
	}
}

export function getOS() {
	return process.platform + ":" + process.arch;
}
