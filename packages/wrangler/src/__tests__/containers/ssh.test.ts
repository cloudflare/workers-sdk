import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import MockWebSocketServer from "vitest-websocket-mock";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

describe("containers ssh", () => {
	const std = mockConsoleMethods();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);

	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("containers ssh --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers ssh [ID]

			SSH into a container

			POSITIONALS
			  ID  id of the container instance  [string]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --cipher         SSH option for cipher_spec (-c)  [string]
			      --log-file       SSH option for log_file (-c)  [string]
			      --escape-char    SSH option for escape_char (-e)  [string]
			      --config-file    SSH option for config-file (-F)  [string]
			      --pkcs11         SSH option for pkcs11 (-I)  [string]
			      --identity-file  SSH option for identity_file (-i)  [string]
			      --mac-spec       SSH option for mac_spec (-m)  [string]
			      --ctl-cmd        SSH option for ctl_cmd (-O)  [string]
			      --option         SSH option for option (-o)  [string]
			      --tag            SSH option for tag (-P)  [string]
			      --ctl-path       SSH option for ctl_path (-S)  [string]"
		`);
	});

	it("should reject invalid container ID format", async () => {
		setWranglerConfig({});
		await expect(
			runWrangler("containers ssh invalid-id")
		).rejects.toMatchInlineSnapshot(
			`[Error: Expected an instance ID but got invalid-id]`
		);
	});

	it("should handle 500s when getting ssh jwt", async () => {
		const instanceId = "a".repeat(64);

		setWranglerConfig({});
		msw.use(
			http.get(`*/instances/:instanceId/ssh`, async ({ request }) => {
				expect(request.url.endsWith(`${instanceId}/ssh`)).toBeTruthy();

				return new HttpResponse(
					`{"success": false, "errors": [{"code": 1000, "message": "something happened"}]}`,
					{
						type: "applicaton/json",
						status: 500,
					}
				);
			})
		);

		await expect(runWrangler(`containers ssh ${instanceId}`)).rejects
			.toMatchInlineSnapshot(`
			[Error: There has been an unknown error when trying to SSH into the container.
			{"error":"something happened"}]
		`);
	});

	// This covers up to trying to connect to the container with ssh. The
	// actual ssh attempt will fail since we don't have an ssh instance to test
	// against, but everything up until that point is covered.
	it("should try ssh'ing into a container", async () => {
		const instanceId = "a".repeat(64);
		const wsUrl = "ws://localhost:1234";
		const sshJwt = "asd";

		setWranglerConfig({});
		msw.use(
			http.get(`*/instances/:instanceId/ssh`, async ({ request }) => {
				return new HttpResponse(
					`{"success": true, "result": {"url": "${wsUrl}", "token": "${sshJwt}"}}`,
					{
						type: "applicaton/json",
						status: 200,
					}
				);
			})
		);

		const mockWebSocket = new MockWebSocketServer(wsUrl);

		await expect(runWrangler(`containers ssh ${instanceId}`)).rejects
			.toMatchInlineSnapshot(`
			[Error: ssh exited unsuccessfully. Is the container running?]
		`);

		// We got a connection
		expect(mockWebSocket.connected).toBeTruthy();
	});
});
