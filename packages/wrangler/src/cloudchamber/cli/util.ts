import { bgGreen, bgRed, bgYellow } from "@cloudflare/cli/colors";
import { PlacementStatusHealth } from "../client";

export function statusToColored(status?: PlacementStatusHealth): string {
	if (!status) {
		return bgYellow("PLACING");
	}

	const mappings: Record<PlacementStatusHealth, (_: string) => string> = {
		pending: bgYellow,
		placed: bgYellow,
		running: bgGreen,
		stopped: bgYellow,
		stopping: bgYellow,
		failed: bgRed,
		unhealthy: bgRed,
		complete: bgGreen,
	};

	if (!(status in mappings)) {
		return bgYellow(status);
	}

	return mappings[status](status.toUpperCase());
}

export function fakeWait<T = Record<string, unknown>>(
	ms: number,
	object: T,
	reject = false
) {
	return new Promise<typeof object>((res, rej) => {
		setTimeout(() => {
			if (reject) {
				return rej(object);
			}
			res(object);
		}, ms);
	});
}
