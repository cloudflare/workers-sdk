import { phases } from "./state";
import type { Arm } from "./state";

const promises = new Map<Arm, Promise<{ value: string }>>();

function load(arm: Arm): Promise<{ value: string }> {
	const cached = promises.get(arm);
	if (cached) {
		return cached;
	}

	phases[arm].started = true;
	const operation =
		arm === "early"
			? import("./early")
			: arm === "abort"
				? import("./abort")
				: import("./reject");
	promises.set(arm, operation);
	void operation.then(
		() => {
			phases[arm].settled = "fulfilled";
		},
		() => {
			phases[arm].settled = "rejected";
		}
	);
	return operation;
}

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const arm = url.searchParams.get("arm");
		if (arm !== "early" && arm !== "abort" && arm !== "reject") {
			return new Response("ready");
		}
		if (url.pathname === "/state") {
			return Response.json(phases[arm]);
		}
		if (url.pathname !== "/kick" && url.pathname !== "/render") {
			return new Response(null, { status: 404 });
		}

		request.signal.addEventListener(
			"abort",
			() => {
				phases[arm].aborted = true;
			},
			{ once: true }
		);
		const operation = load(arm);
		if (url.pathname === "/kick") {
			return new Response("kicked");
		}
		try {
			return new Response((await operation).value);
		} catch (error) {
			return new Response(error instanceof Error ? error.message : "unknown", {
				status: 500,
			});
		}
	},
} satisfies ExportedHandler;
