import { Toasty } from "@cloudflare/kumo";
import {
	createRootRoute,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import {
	d1ListDatabases,
	durableObjectsNamespaceListNamespaces,
	r2ListBuckets,
	workersKvNamespaceListNamespaces,
} from "../api";
import { Sidebar } from "../components/Sidebar";
import type {
	D1DatabaseResponse,
	R2Bucket,
	WorkersKvNamespace,
	WorkersNamespace,
} from "../api";

export const Route = createRootRoute({
	component: RootLayout,
	loader: async () => {
		const [kvResponse, d1Response, doResponse, r2Response] =
			await Promise.allSettled([
				workersKvNamespaceListNamespaces(),
				d1ListDatabases(),
				durableObjectsNamespaceListNamespaces(),
				r2ListBuckets(),
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

		let r2Buckets = new Array<R2Bucket>();
		let r2Error: string | null = null;
		if (r2Response.status === "fulfilled") {
			r2Buckets = r2Response.value.data?.result?.buckets ?? [];
		} else {
			r2Error = `R2 Error: ${r2Response.reason instanceof Error ? r2Response.reason.message : JSON.stringify(r2Response.reason)}`;
		}

		return {
			d1Error,
			databases,
			doError,
			doNamespaces,
			kvError,
			kvNamespaces,
			r2Buckets,
			r2Error,
		};
	},
});

function RootLayout() {
	const loaderData = Route.useLoaderData();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	return (
		<Toasty>
			<div className="flex min-h-screen">
				<Sidebar
					currentPath={currentPath}
					d1Error={loaderData.d1Error}
					databases={loaderData.databases}
					doError={loaderData.doError}
					doNamespaces={loaderData.doNamespaces}
					kvError={loaderData.kvError}
					kvNamespaces={loaderData.kvNamespaces}
					r2Buckets={loaderData.r2Buckets}
					r2Error={loaderData.r2Error}
				/>
				<main className="flex flex-1 flex-col overflow-y-auto">
					<Outlet />
				</main>
			</div>
		</Toasty>
	);
}
