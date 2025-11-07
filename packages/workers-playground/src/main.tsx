import "./global";
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";

import { DarkModeSettings, setDarkMode } from "@cloudflare/style-const";
import { StyleProvider } from "@cloudflare/style-provider";

import App from "./App";
import { getRenderer } from "./QuickEditor/felaRenderer";

const felaRenderer = getRenderer();

// This is a slightly hacky way to get the Cloudflare design system components
// to recognise system dark mode as soon as possible (rather than with a delay)
function syncDarkModeWithSystem() {
	const inSystemDarkMode =
		window.matchMedia &&
		window.matchMedia("(prefers-color-scheme: dark)").matches;
	const classList = document.documentElement.classList;
	if (inSystemDarkMode) {
		classList.add("dark-mode");
	} else {
		classList.remove("dark-mode");
	}
}
syncDarkModeWithSystem();
setDarkMode(DarkModeSettings.SYSTEM);
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<StyleProvider renderer={felaRenderer}>
			<App />
		</StyleProvider>
	</React.StrictMode>
);
