import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tailwind.css";
import { routeTree } from "./routeTree.gen";

// eslint-disable-next-line turbo/no-undeclared-env-vars -- replaced at build time
const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL });

// See https://tanstack.com/router/latest/docs/framework/react/guide/creating-a-router#router-type-safety
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
