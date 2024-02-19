import "./global";
import "./index.css";
import { DarkModeSettings, setDarkMode } from "@cloudflare/style-const";
import { StyleProvider } from "@cloudflare/style-provider";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getRenderer } from "./QuickEditor/felaRenderer";

const felaRenderer = getRenderer();

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
setDarkMode(DarkModeSettings.SYSTEM);
ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<StyleProvider renderer={felaRenderer}>
			<App />
		</StyleProvider>
	</React.StrictMode>
);
