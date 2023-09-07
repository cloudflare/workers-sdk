import "./global";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StyleProvider } from "@cloudflare/style-provider";
const felaRenderer = getRenderer();

import "./index.css";
import { getRenderer } from "./QuickEditor/felaRenderer";

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<StyleProvider renderer={felaRenderer}>
			<App />
		</StyleProvider>
	</React.StrictMode>
);
