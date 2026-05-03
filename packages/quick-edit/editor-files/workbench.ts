// This is taken from the VSCode source with modifications

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	create,
	URI,
	// This is the path that the *compiled* VSCode output will be, relative to the final location of this file (web/assets/workbench.js)
} from "/assets/out/vs/workbench/workbench.web.main.internal.js";

// These types *should* be imported from the VSCode source tree, but since that's not available in
// workers-sdk it's easier to no-op them.
type IWorkspace = unknown;
type IWorkbenchConstructionOptions = unknown;
declare class IWorkspaceProvider {}
type UriComponents = unknown;

class WorkspaceProvider implements IWorkspaceProvider {
	static create(
		config: IWorkbenchConstructionOptions & {
			folderUri: UriComponents;
		}
	) {
		return new WorkspaceProvider({ folderUri: URI.revive(config.folderUri) });
	}

	private constructor(readonly workspace: IWorkspace) {}

	async open(
		_workspace: IWorkspace,
		_options?: { reuse?: boolean; payload?: object }
	): Promise<boolean> {
		return true;
	}

	hasRemote(): boolean {
		return true;
	}
}

function createEditor(port: MessagePort) {
	// Find config by checking for DOM
	const configElement = document.getElementById(
		"vscode-workbench-web-configuration"
	);
	const configElementAttribute = configElement
		? configElement.getAttribute("data-settings")
		: undefined;
	if (!configElement || !configElementAttribute) {
		throw new Error("Missing web configuration element");
	}
	const config: IWorkbenchConstructionOptions & {
		folderUri?: UriComponents;
		workspaceUri?: UriComponents;
		callbackRoute: string;
	} = JSON.parse(configElementAttribute);

	const searchParams = new URLSearchParams(window.location.search);

	const messagePorts = new Map();

	// This passes the MessagePort through to the `cloudflare.@cloudflare/quick-edit-extension` VSCode extension, which is preloaded
	messagePorts.set("cloudflare.@cloudflare/quick-edit-extension", port);

	const folderUri = searchParams.get("worker");

	if (!folderUri) {
		throw new Error("Missing target folder");
	}

	// Create workbench
	create(document.body, {
		...config,
		defaultLayout: {
			force: true,
			editors: [],
		},
		settingsSyncOptions: undefined,
		workspaceProvider: WorkspaceProvider.create({
			...config,
			folderUri: URI.parse(decodeURIComponent(folderUri)),
		}),
		messagePorts,
	});
}

/**
 * Read the list of allowed parent origins from the server-injected meta tag.
 * These origins are permitted to send the "PORT" postMessage to establish
 * the IPC channel. Entries may use a leading wildcard for subdomain matching
 * (e.g. "https://*.example.com").
 */
function getAllowedParentOrigins(): string[] {
	const el = document.getElementById("vscode-allowed-parent-origins");
	const raw = el?.getAttribute("data-origins");
	if (!raw) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((v) => typeof v === "string")
			: [];
	} catch {
		return [];
	}
}

/**
 * Check whether the given origin matches any of the allowed origins.
 * Supports two wildcard forms:
 *  - "https://*.example.com" — matches any subdomain
 *  - "http://localhost:*"    — matches any port on localhost
 */
function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
	return allowedOrigins.some((allowed) => {
		// Port wildcard: "http://localhost:*" matches "http://localhost:5173"
		if (allowed.endsWith(":*")) {
			const prefix = allowed.slice(0, -1); // e.g. "http://localhost:"
			return origin.startsWith(prefix);
		}
		// Subdomain wildcard: "https://*.example.com" matches "https://foo.example.com"
		const wildcardIndex = allowed.indexOf("*.");
		if (wildcardIndex !== -1) {
			const prefix = allowed.slice(0, wildcardIndex);
			const suffix = allowed.slice(wildcardIndex + 1); // e.g. ".example.com"
			return origin.startsWith(prefix) && origin.endsWith(suffix);
		}
		return origin === allowed;
	});
}

/**
 * The web page that embeds this VSCode instance must provide a MessagePort
 * used for file communication. Only messages from allowed parent origins
 * are accepted.
 */
window.onmessage = (e) => {
	if (e.data === "PORT" && e.ports[0]) {
		const allowedOrigins = getAllowedParentOrigins();

		if (!isAllowedOrigin(e.origin, allowedOrigins)) {
			console.error(`Rejected postMessage from untrusted origin: ${e.origin}`);
			return;
		}

		createEditor(e.ports[0]);
	}
};
