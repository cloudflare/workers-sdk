import os from "node:os";
import { version as wranglerVersion } from "../../package.json";

export function getWranglerVersion() {
	return wranglerVersion;
}
// used by "new" metrics
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

// used by "old" metrics
export function getOS() {
	return process.platform + ":" + process.arch;
}

export function getOSVersion() {
	return os.version();
}

export function getNodeVersion() {
	const nodeVersion = process.versions.node;
	return parseInt(nodeVersion.split(".")[0]);
}
