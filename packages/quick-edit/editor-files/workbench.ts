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
 * The web page that embeds this VSCode instance must provide a MessagePort used for file communication
 */
window.onmessage = (e) => {
	if (e.data === "PORT" && e.ports[0]) {
		createEditor(e.ports[0]);
	}
};
