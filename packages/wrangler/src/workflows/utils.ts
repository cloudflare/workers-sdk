import type { InstanceStatus } from "./types";

export const emojifyInstanceStatus = (status: InstanceStatus) => {
	switch (status) {
		case "complete":
			return "✅ Completed";
		case "errored":
			return "❌ Errored";
		case "unknown":
			return "❓ Unknown";
		case "paused":
			return "⏸️ Paused";
		case "queued":
			return "⌛ Queued";
		case "running":
			return "▶ Running";
		case "terminated":
			return "🚫 Terminated";
	}
};
