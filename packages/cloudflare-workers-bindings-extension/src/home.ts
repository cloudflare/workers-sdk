import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { addBindingFlow } from "./add-binding";

export class HomeViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "cloudflare-workers-bindings.home";
	constructor(private readonly _context: vscode.ExtensionContext) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext
	) {
		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [this._context.extensionUri],
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage((data) => {
			switch (data.type) {
				case "addBinding": {
					addBindingFlow(this._context);
					break;
				}
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, "media", "main.js")
		);
		const styleResetUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, "media", "reset.css")
		);
		const styleMainUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, "media", "main.css")
		);

		// Use a nonce to only allow a specific script to be run.
		const nonce = randomBytes(16).toString("base64");

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<title>Cloudflare Workers Home</title>
			</head>
			<body>
				<h3>
				<svg class="cf-logo" width="16" height="16" viewBox="0 0 16 16" fill="#F6821F" xmlns="http://www.w3.org/2000/svg">
					<path
						d="M6.21003 12.2925L2.99503 7.99255L6.19253 3.81505L5.57503 2.97255L1.97253 7.68505L1.96753 8.28755L5.58753 13.135L6.21003 12.2925Z"
						fill="#F6821F" />
					<path
						d="M7.33253 1.98755H6.09503L10.5575 8.08755L6.20003 13.9875H7.44503L11.8 8.09005L7.33253 1.98755Z"
						fill="#F6821F" />
					<path
						d="M9.72503 1.98755H8.47253L13.005 8.01505L8.47253 13.9875H9.72753L14.03 8.31755V7.71505L9.72503 1.98755Z"
						fill="#F6821F" />
				</svg>
				Welcome to Cloudflare Workers</h3>
				<p>Build serverless applications and deploy instantly across the globe for exceptional performance, reliability and scale.</p>
				<a href="https://developers.cloudflare.com/workers/"><button>Read Workers documentation</button></a>

				<h3>🚀 Get started</h3>
				<p>To get started with a template, run:</p>
				<p class="code-wrapper"><code>npm create cloudflare@latest</code></p>
				<p>To develop your project locally, run:</p>
				<p class="code-wrapper"><code>npx wrangler dev</code></p>
				<p>When you're ready to deploy, run:</p>
				<p class="code-wrapper"><code>npx wrangler deploy</code></p>

				<h3 class="binding-heading">🔗 Bind to Cloudflare resources</h3>
				<p>Connect your Worker to compute, storage and AI resources on the Cloudflare Developer Platform by configuring a <a href="https://developers.cloudflare.com/workers/runtime-apis/bindings/">binding</a>.</p>
				<button class="add-binding">Add new binding</button>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}
