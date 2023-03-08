import * as vscode from "vscode";
import { CFS } from "./cfs";

export function activate(context: vscode.ExtensionContext) {
	const cfs = new CFS();
	context.subscriptions.push(cfs);
	cfs.seed();
}

export function deactivate() {}
