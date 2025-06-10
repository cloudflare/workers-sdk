import { bgGreen, bgRed, bgYellow } from "@cloudflare/cli/colors";
import { type PlacementStatusHealth } from "@cloudflare/containers-shared";

export function capitalize<S extends string>(str: S): Capitalize<S> {
	return (
		str.length > 0 ? str[0].toUpperCase() + str.substring(1) : str
	) as Capitalize<S>;
}

export function statusToColored(status?: PlacementStatusHealth): string {
	if (!status) {
		return bgYellow("PLACING");
	}

	const mappings: Record<PlacementStatusHealth, (_: string) => string> = {
		placed: bgYellow,
		running: bgGreen,
		stopped: bgYellow,
		stopping: bgYellow,
		failed: bgRed,
		unhealthy: bgRed,
	};

	if (!(status in mappings)) {
		return bgYellow(status);
	}

	return mappings[status](status.toUpperCase());
}
