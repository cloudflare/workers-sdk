//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
	const vscode = acquireVsCodeApi();

	document.querySelector(".add-binding")?.addEventListener("click", () => {
		vscode.postMessage({ type: "addBinding" });
	});
})();
