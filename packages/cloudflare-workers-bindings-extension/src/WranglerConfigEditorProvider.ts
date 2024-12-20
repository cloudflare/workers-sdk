import { D1Database } from "@cloudflare/workers-types/experimental";
import * as vscode from "vscode";
import { importWrangler } from "./wrangler";

export function getNonce() {
	let text = "";
	const possible =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * Provider for wrangler config editor
 */
export class WranglerConfigEditorProvider
	implements vscode.CustomTextEditorProvider
{
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new WranglerConfigEditorProvider(context);
		const providerRegistration = vscode.window.registerCustomEditorProvider(
			WranglerConfigEditorProvider.viewType,
			provider
		);
		return providerRegistration;
	}

	private static readonly viewType =
		"cloudflare-workers-bindings.wranglerConfig";

	constructor(private readonly context: vscode.ExtensionContext) {
		const openEditorCommand = vscode.commands.registerCommand(
			"cloudflare-workers-bindings.openEditor",
			() =>
				vscode.commands.executeCommand(
					"vscode.openWith",
					this.document?.uri ?? vscode.window.activeTextEditor?.document.uri,
					WranglerConfigEditorProvider.viewType
				)
		);
		const openSourceCommand = vscode.commands.registerCommand(
			"cloudflare-workers-bindings.viewSource",
			() =>
				vscode.commands.executeCommand(
					"vscode.openWith",
					this.document?.uri ?? vscode.window.activeTextEditor?.document.uri,
					"defaullt"
				)
		);

		context.subscriptions.push(openEditorCommand, openSourceCommand);
	}

	private document: vscode.TextDocument | null = null;

	/**
	 * Called when our custom editor is opened.
	 */
	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Keep the document
		this.document = document;

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
			enableForms: true,
			enableCommandUris: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		const updateWebview = () => {
			webviewPanel.webview.postMessage({
				type: "update",
				text: JSON.stringify(this.readConfig(document), null, 2),
			});
		};

		// Hook up event handlers so that we can synchronize the webview with the text document.
		//
		// The text document acts as our model, so we have to sync change in the document to our
		// editor and sync changes in the editor back to the document.
		//
		// Remember that a single text document can also be shared between multiple custom
		// editors (this happens for example when you split a custom editor)

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
			(e) => {
				if (e.document.uri.toString() === document.uri.toString()) {
					updateWebview();
				}
			}
		);

		// Make sure we get rid of the listener when our editor is closed.
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
		});

		// Receive message from the webview.
		webviewPanel.webview.onDidReceiveMessage((e) => {
			try {
				switch (e.type) {
					case "add":
						this.updateConfig(
							document,
							{
								[e.name]: [{}],
							},
							true
						);
						break;
					case "update": {
						const matches = Array.from(
							(e.name as string).matchAll(/d1_databases\[([0-9]+)\]\.(\w+)/g)
						);

						if (matches.length > 0) {
							const [[_, index, key]] = matches;
							const config = this.readConfig(document);

							vscode.window.showInformationMessage(
								JSON.stringify({
									index,
									key,
								})
							);

							this.updateConfig(
								document,
								{
									d1_databases: config.d1_databases?.map((d1, i) => {
										if (i !== Number(index)) {
											return d1;
										}

										return {
											...d1,
											[key]: e.value,
										};
									}),
								},
								false
							);
						} else {
							this.updateConfig(
								document,
								{
									[e.name]: e.value,
								},
								true
							);
						}

						break;
					}
				}
			} catch (e) {
				vscode.window.showErrorMessage(e instanceof Error ? e.message : `${e}`);
			}
		});

		updateWebview();
	}

	/**
	 * Get the static html used for the editor webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				"dist",
				"WranglerConfigEditor.js"
			)
		);
		const styleVSCodeUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "media", "vscode.css")
		);
		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				"dist",
				"WranglerConfigEditor.css"
			)
		);

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleVSCodeUri}" rel="stylesheet" />
				<link href="${styleMainUri}" rel="stylesheet" />

				<title>Wrangler Config Editor</title>
			</head>
			<body>
				<div id="root"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	private getWrangler(document: vscode.TextDocument) {
		const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri);

		if (!workspaceRoot) {
			throw new Error("Could not determine workspace folder for document");
		}

		return importWrangler(workspaceRoot.uri.fsPath);
	}

	/**
	 * Try to parse the current document as wrangler config file.
	 */
	private readConfig(document: vscode.TextDocument) {
		const wrangler = this.getWrangler(document);
		const { rawConfig } = wrangler.experimental_readRawConfig({
			config: document.uri.fsPath,
			configString: document.getText(),
		});

		return rawConfig;
	}

	/**
	 * Write out the result to a given document.
	 */
	private updateConfig(
		document: vscode.TextDocument,
		json: any,
		isArrayInsertion: boolean
	) {
		const wrangler = this.getWrangler(document);
		const result = wrangler.experimental_patchConfig(
			document.uri.fsPath,
			json,
			isArrayInsertion,
			document.getText()
		);

		const edit = new vscode.WorkspaceEdit();

		// Just replace the entire document every time for this example extension.
		// A more complete extension should compute minimal edits instead.
		edit.replace(
			document.uri,
			new vscode.Range(0, 0, document.lineCount, 0),
			result
		);

		return vscode.workspace.applyEdit(edit);
	}
}
