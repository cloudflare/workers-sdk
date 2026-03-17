import {
	createRootRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
import {
	d1ListDatabases,
	durableObjectsNamespaceListNamespaces,
	workersKvNamespaceListNamespaces,
} from "../api";
import { AppShell } from "../components/layout";
import { Sidebar } from "../components/Sidebar";
import type {
	D1DatabaseResponse,
	WorkersKvNamespace,
	WorkersNamespace,
} from "../api";

export const Route = createRootRoute({
	component: RootLayout,
	loader: async () => {
		const [kvResponse, d1Response, doResponse] = await Promise.allSettled([
			workersKvNamespaceListNamespaces(),
			d1ListDatabases(),
			durableObjectsNamespaceListNamespaces(),
		]);

		let kvNamespaces = new Array<WorkersKvNamespace>();
		let kvError: string | null = null;
		if (kvResponse.status === "fulfilled") {
			kvNamespaces = kvResponse.value.data?.result ?? [];
		} else {
			kvError = `KV Error: ${kvResponse.reason instanceof Error ? kvResponse.reason.message : JSON.stringify(kvResponse.reason)}`;
		}

		let databases = new Array<D1DatabaseResponse>();
		let d1Error: string | null = null;
		if (d1Response.status === "fulfilled") {
			databases = d1Response.value.data?.result ?? [];
		} else {
			d1Error = `D1 Error: ${d1Response.reason instanceof Error ? d1Response.reason.message : JSON.stringify(d1Response.reason)}`;
		}

		let doNamespaces = new Array<WorkersNamespace>();
		let doError: string | null = null;
		if (doResponse.status === "fulfilled") {
			// Only show namespaces that use SQLite storage
			const allDoNamespaces = doResponse.value.data?.result ?? [];
			doNamespaces = allDoNamespaces.filter((ns) => ns.use_sqlite === true);
		} else {
			doError = `DO Error: ${doResponse.reason instanceof Error ? doResponse.reason.message : JSON.stringify(doResponse.reason)}`;
		}

		return {
			d1Error,
			databases,
			doError,
			doNamespaces,
			kvError,
			kvNamespaces,
		};
	},
});

function RootLayout() {
	const loaderData = Route.useLoaderData();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("sidebar-collapsed") === "true";
		}
		return false;
	});

	const handleToggle = useCallback(() => {
		setSidebarCollapsed((prev) => {
			const next = !prev;
			localStorage.setItem("sidebar-collapsed", String(next));
			return next;
		});
	}, []);

	return (
		<AppShell
			sidebar={
				<Sidebar
					collapsed={sidebarCollapsed}
					currentPath={currentPath}
					d1Error={loaderData.d1Error}
					databases={loaderData.databases}
					doError={loaderData.doError}
					doNamespaces={loaderData.doNamespaces}
					kvError={loaderData.kvError}
					kvNamespaces={loaderData.kvNamespaces}
					onToggle={handleToggle}
				/>
			}
		>
			<Outlet />
		</AppShell>
	);
}
