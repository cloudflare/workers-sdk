import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LOCAL_EXPLORER_BASE_PATH } from "./constants";
import "./styles/tailwind.css";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree, basepath: LOCAL_EXPLORER_BASE_PATH });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root");
if (rootElement) {
	createRoot(rootElement).render(
		<StrictMode>
			<RouterProvider router={router} />
		</StrictMode>
	);
}
