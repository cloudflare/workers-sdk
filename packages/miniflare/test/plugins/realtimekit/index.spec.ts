import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose, useServer } from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

const appId = "2da1c5c6-8e8f-4119-b89e-18558e051486";
const script = `export default {
	async fetch(request, env) {
		try {
			const meeting = await env.RTK.createMeeting({ title: "Standup" });
			const participant = await meeting.addParticipant({
				custom_participant_id: "user-1",
				preset_name: "group_call_participant",
				name: "User 1",
			});
			return Response.json({ id: meeting.id, participant });
		} catch (err) {
			return new Response(err.message, { status: 500 });
		}
	}
}`;

class RealtimeKit extends RpcTarget {
	// Meetings are plain data with an `addParticipant` capability, as returned by the binding.
	createMeeting(input: { title: string }) {
		return {
			id: "meeting-1",
			title: input.title,
			addParticipant(participant: {
				custom_participant_id: string;
				name: string;
			}) {
				return {
					id: `participant-${participant.custom_participant_id}`,
					...participant,
				};
			},
		};
	}
}

function realtimeKitWorker(proxyUrl?: URL) {
	return {
		config: {
			name: "realtimekit",
			compatibilityDate: "2025-04-28",
			manifest: singleModuleManifest(script),
			env: {
				RTK: {
					type: "realtime-kit" as const,
					id: appId,
					dev: { remote: true },
				},
			},
		},
		dev: {
			remoteProxyConnectionString: proxyUrl as
				| RemoteProxyConnectionString
				| undefined,
		},
	};
}

describe("RealtimeKit binding", () => {
	test("requires a remote proxy session", async ({ expect }) => {
		const mf = new Miniflare({ workers: [realtimeKitWorker()] });
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(response.status).toBe(500);
		expect(await response.text()).toContain(
			"Binding RTK needs to be run remotely"
		);
	});

	test("forwards calls on returned meeting stubs to the remote app", async ({
		expect,
	}) => {
		const { http: proxyUrl } = await useServer(
			(_req, res) => {
				res.statusCode = 500;
				res.end("Expected RPC WebSocket");
			},
			(socket) => {
				newWebSocketRpcSession(
					socket as unknown as WebSocket,
					new RealtimeKit()
				);
			}
		);
		const mf = new Miniflare({ workers: [realtimeKitWorker(proxyUrl)] });
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(await response.json()).toEqual({
			id: "meeting-1",
			participant: {
				id: "participant-user-1",
				custom_participant_id: "user-1",
				preset_name: "group_call_participant",
				name: "User 1",
			},
		});
	});
});
