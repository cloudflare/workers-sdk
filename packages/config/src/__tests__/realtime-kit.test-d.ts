import { bindings, defineWorker } from "../public";
import type { InferEnv } from "../public";

const config = defineWorker({
	name: "meetings",
	compatibilityDate: "2025-04-28",
	env: {
		RTK: bindings.realtimeKit({
			id: "2da1c5c6-8e8f-4119-b89e-18558e051486",
		}),
	},
});

declare const env: InferEnv<typeof config>;
// The inferred type is the runtime binding from workers-types, not the config interface.
const meeting: Promise<RealtimeKitMeeting> = env.RTK.createMeeting({
	title: "Standup",
});
void meeting;
// @ts-expect-error The runtime binding does not expose the config app ID.
void env.RTK.id;
