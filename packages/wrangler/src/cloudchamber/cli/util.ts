import { bgGreen, bgRed, bgYellow } from "@cloudflare/cli/colors";
import type { Status } from "../enums";

export function statusToColored(status?: Status): string {
	if (!status) {
		return bgYellow("PLACING");
	}

	const mappings: Record<Status, (_: string) => string> = {
		placing: bgYellow,
		placed: bgYellow,
		running: bgGreen,
		stopped: bgYellow,
		stopping: bgYellow,
		failed: bgRed,
	};

	return mappings[status](status.toUpperCase());
}
