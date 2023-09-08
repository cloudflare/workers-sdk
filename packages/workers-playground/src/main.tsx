import "./global";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StyleProvider } from "@cloudflare/style-provider";
const felaRenderer = getRenderer();

import "./index.css";
import { getRenderer } from "./QuickEditor/felaRenderer";

// This is a slightly hacky way to get the Cloudflare design system components
// to recognise system dark mode as soon as possible (rather than with a delay)
function syncDarkModeWithSystem() {
	const inSystemDarkMode =
		window.matchMedia &&
		window.matchMedia("(prefers-color-scheme: dark)").matches;
	var classList = document.documentElement.classList;
	if (inSystemDarkMode) {
		classList.add("dark-mode");
	} else {
		classList.remove("dark-mode");
	}
}
syncDarkModeWithSystem();
ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<StyleProvider renderer={felaRenderer}>
			<App />
		</StyleProvider>
	</React.StrictMode>
);
