import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose, useServer } from "../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

class MeetingRpcTarget extends RpcTarget {
	get id(): string {
		return "meeting-id";
	}

	addParticipant(options: {
		custom_participant_id: string;
		preset_name: string;
	}): { id: string; token: string } {
		return { id: options.custom_participant_id, token: options.preset_name };
	}
}

class RealtimeKitRpcTarget extends RpcTarget {
	createMeeting(): MeetingRpcTarget {
		return new MeetingRpcTarget();
	}
}

const SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			try {
				using meeting = await env.RTK.createMeeting();
				const id = await meeting.id;
				const participant = await meeting.addParticipant({
					custom_participant_id: "participant-id",
					preset_name: "group_call_host",
				});
				return Response.json({ id, participant });
			} catch (error) {
				return new Response(error.message, { status: 503 });
			}
		},
	};
`;

function createMiniflare(proxyUrl?: URL): Miniflare {
	return new Miniflare({
		workers: [
			{
				config: {
					name: "meetings",
					compatibilityDate: "2026-01-01",
					manifest: singleModuleManifest(SCRIPT),
					env: {
						RTK: {
							type: "realtimekit",
							id: "app-id",
							dev: { remote: true },
						},
					},
				},
				dev: {
					remoteProxyConnectionString: proxyUrl as
						| RemoteProxyConnectionString
						| undefined,
				},
			},
		],
	});
}

describe("RealtimeKit remote bindings", () => {
	test("preserves returned meeting RPC capabilities through the shared proxy", async ({
		expect,
	}) => {
		let connections = 0;
		const { http: proxyUrl } = await useServer(
			(_request, response) => {
				response.statusCode = 500;
				response.end("expected an RPC WebSocket");
			},
			(socket) => {
				connections++;
				newWebSocketRpcSession(
					socket as unknown as WebSocket,
					new RealtimeKitRpcTarget()
				);
			}
		);
		const mf = createMiniflare(proxyUrl);
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: "meeting-id",
			participant: { id: "participant-id", token: "group_call_host" },
		});
		expect(connections).toBe(1);
	});

	test("does not silently simulate meetings when no remote session is available", async ({
		expect,
	}) => {
		const mf = createMiniflare();
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(response.status).toBe(503);
		expect(await response.text()).toContain(
			"Binding RTK needs to be run remotely"
		);
	});
});
