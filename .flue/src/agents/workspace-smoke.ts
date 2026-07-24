"use agent";

import { useModel, useSandbox } from "@flue/runtime";
import { env } from "cloudflare:workers";
import {
	getDefaultWorkspace,
	getShellSandbox,
} from "../sandboxes/cloudflare-shell";

export function WorkspaceSmoke(): string {
	useModel("cloudflare/@cf/moonshotai/kimi-k2.6");
	useSandbox(
		getShellSandbox({
			executor: {
				globalOutbound: null,
				timeout: 60_000,
			},
			loader: env.LOADER,
			workspace: getDefaultWorkspace(),
		})
	);

	return `Use the code tool to inspect and update your durable workspace.
When asked to verify the workspace, create a small file, read it back, and report the result concisely.`;
}

WorkspaceSmoke.agentName = "workspace-smoke";
