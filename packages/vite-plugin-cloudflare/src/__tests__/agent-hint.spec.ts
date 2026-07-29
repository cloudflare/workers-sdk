import { afterEach, beforeEach, describe, test, vi } from "vitest";
import * as detectAgentModule from "../detect-agent";
import { maybeAddAgentHint } from "../plugins/agent-hint";
import type * as vite from "vite";

function createMockServer(serverLogs: { info: string[] }) {
	const mockLogger: vite.Logger = {
		info: (msg: string) => serverLogs.info.push(msg),
		warn: vi.fn(),
		warnOnce: vi.fn(),
		error: vi.fn(),
		clearScreen: vi.fn(),
		hasErrorLogged: () => false,
		hasWarned: false,
	};

	return {
		config: { logger: mockLogger },
		resolvedUrls: {
			local: ["http://localhost:5173/"],
			network: [],
		},
		bindCLIShortcuts: vi.fn(),
	} as unknown as vite.ViteDevServer;
}

describe("Local Explorer agent hint", () => {
	let savedIsTTY: typeof process.stdin.isTTY;
	let serverLogs: { info: string[] };
	let mockServer: vite.ViteDevServer;

	beforeEach(() => {
		savedIsTTY = process.stdin.isTTY;
		serverLogs = { info: [] };
		mockServer = createMockServer(serverLogs);
	});

	afterEach(() => {
		process.stdin.isTTY = savedIsTTY;
		vi.restoreAllMocks();
	});

	test("prints hint with 'dev' for dev sessions", ({ expect }) => {
		process.stdin.isTTY = false;
		vi.spyOn(detectAgentModule, "isAgentSession").mockReturnValue(true);

		const originalBindCLIShortcuts = mockServer.bindCLIShortcuts;
		maybeAddAgentHint(mockServer, "dev");

		expect(mockServer.bindCLIShortcuts).not.toBe(originalBindCLIShortcuts);

		mockServer.bindCLIShortcuts({ print: true });

		expect(originalBindCLIShortcuts).toHaveBeenCalledOnce();
		const output = serverLogs.info.join("\n");
		expect(output).toContain(
			"This dev session seems to be running in an AI agent."
		);
		expect(output).toContain(
			"The Local Explorer API is available at http://localhost:5173/cdn-cgi/explorer/api"
		);
		expect(output).toContain(
			"GET http://localhost:5173/cdn-cgi/explorer/api/local/workers - local Workers and bindings"
		);
	});

	test("prints hint with 'preview' for preview sessions", ({ expect }) => {
		process.stdin.isTTY = false;
		vi.spyOn(detectAgentModule, "isAgentSession").mockReturnValue(true);

		maybeAddAgentHint(mockServer, "preview");
		mockServer.bindCLIShortcuts({ print: true });

		const output = serverLogs.info.join("\n");
		expect(output).toContain(
			"This preview session seems to be running in an AI agent."
		);
	});

	test("does not print hint when print option is false", ({ expect }) => {
		process.stdin.isTTY = false;
		vi.spyOn(detectAgentModule, "isAgentSession").mockReturnValue(true);

		maybeAddAgentHint(mockServer, "dev");
		mockServer.bindCLIShortcuts();

		expect(serverLogs.info).toHaveLength(0);
	});

	test("does not patch for interactive sessions", ({ expect }) => {
		process.stdin.isTTY = true;
		vi.spyOn(detectAgentModule, "isAgentSession").mockReturnValue(true);

		const originalBindCLIShortcuts = mockServer.bindCLIShortcuts;
		maybeAddAgentHint(mockServer, "dev");

		expect(mockServer.bindCLIShortcuts).toBe(originalBindCLIShortcuts);
	});

	test("does not patch for non-agent sessions", ({ expect }) => {
		process.stdin.isTTY = false;
		vi.spyOn(detectAgentModule, "isAgentSession").mockReturnValue(false);

		const originalBindCLIShortcuts = mockServer.bindCLIShortcuts;
		maybeAddAgentHint(mockServer, "dev");

		expect(mockServer.bindCLIShortcuts).toBe(originalBindCLIShortcuts);
	});

	test("does not patch when Local Explorer is disabled", ({ expect }) => {
		process.stdin.isTTY = false;
		vi.spyOn(detectAgentModule, "isAgentSession").mockReturnValue(true);
		vi.stubEnv("X_LOCAL_EXPLORER", "false");

		const originalBindCLIShortcuts = mockServer.bindCLIShortcuts;
		maybeAddAgentHint(mockServer, "dev");

		expect(mockServer.bindCLIShortcuts).toBe(originalBindCLIShortcuts);

		vi.stubEnv("X_LOCAL_EXPLORER", undefined);
	});
});
