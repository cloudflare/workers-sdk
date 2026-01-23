import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
			"wrangler containers ssh <ID>

			POSITIONALS
			  ID  ID of the container instance  [string] [required]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --cipher         Sets \`ssh -c\`: Select the cipher specification for encrypting the session  [string]
			      --log-file       Sets \`ssh -E\`: Append debug logs to log_file instead of standard error  [string]
			      --escape-char    Sets \`ssh -e\`: Set the escape character for sessions with a pty (default: '~')  [string]
			  -F, --config-file    Sets \`ssh -F\`: Specify an alternative per-user ssh configuration file  [string]
			      --pkcs11         Sets \`ssh -I\`: Specify the PKCS#11 shared library ssh should use to communicate with a PKCS#11 token providing keys for user authentication  [string]
			  -i, --identity-file  Sets \`ssh -i\`: Select a file from which the identity (private key) for public key authentication is read  [string]
			      --mac-spec       Sets \`ssh -m\`: A comma-separated list of MAC (message authentication code) algorithms, specified in order of preference  [string]
			  -o, --option         Sets \`ssh -o\`: Set options in the format used in the ssh configuration file. May be repeated  [string]
			      --tag            Sets \`ssh -P\`: Specify a tag name that may be used to select configuration in ssh_config  [string]"
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
			http.get(`*/instances/:instanceId/ssh`, async () => {
				return new HttpResponse(
					`{"success": false, "errors": [{"code": 1000, "message": "something happened"}]}`,
					{
						type: "applicaton/json",
						status: 500,
					}
				);
			})
		);

		await expect(
			runWrangler(`containers ssh ${instanceId}`)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: Error verifying SSH access: something happened]
		`
		);
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
			http.get(`*/instances/:instanceId/ssh`, async () => {
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
			[Error: SSH exited unsuccessfully. Is the container running?
			NOTE: SSH does not automatically wake a container or count as activity to keep a container alive]
		`);

		// We got a connection
		expect(mockWebSocket.connected).toBeTruthy();
	});
});
