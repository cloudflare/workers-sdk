import { Toasty } from "@cloudflare/kumo";
import {
	createRootRoute,
	Outlet,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import {
	d1ListDatabases,
	durableObjectsNamespaceListNamespaces,
	localExplorerListWorkers,
	r2ListBuckets,
	workersKvNamespaceListNamespaces,
	workflowsListWorkflows,
} from "../api";
import { Sidebar } from "../components/Sidebar";
import { filterVisibleWorkers } from "../components/WorkerSelector";
import type {
	D1DatabaseResponse,
	LocalExplorerWorker,
	R2Bucket,
	WorkersKvNamespace,
	WorkersNamespace,
	WorkflowsWorkflow,
} from "../api";

// Extended types with workerName for filtering
type KvNamespaceWithWorker = WorkersKvNamespace & { workerName?: string };
type D1DatabaseWithWorker = D1DatabaseResponse & { workerName?: string };
type DoNamespaceWithWorker = WorkersNamespace & { workerName?: string };
type R2BucketWithWorker = R2Bucket & { workerName?: string };

export const Route = createRootRoute({
	component: RootLayout,
	loader: async () => {
		const [
			workersResponse,
			kvResponse,
			d1Response,
			doResponse,
			r2Response,
			workflowsResponse,
		] = await Promise.allSettled([
			localExplorerListWorkers(),
			workersKvNamespaceListNamespaces(),
			d1ListDatabases(),
			durableObjectsNamespaceListNamespaces(),
			r2ListBuckets(),
			workflowsListWorkflows(),
		]);

		let workers = new Array<LocalExplorerWorker>();
		if (workersResponse.status === "fulfilled") {
			workers = workersResponse.value.data?.result ?? [];
		}

		let kvNamespaces = new Array<KvNamespaceWithWorker>();
		let kvError: string | null = null;
		if (kvResponse.status === "fulfilled") {
			kvNamespaces = (kvResponse.value.data?.result ??
				[]) as KvNamespaceWithWorker[];
		} else {
			kvError = `KV Error: ${kvResponse.reason instanceof Error ? kvResponse.reason.message : JSON.stringify(kvResponse.reason)}`;
		}

		let databases = new Array<D1DatabaseWithWorker>();
		let d1Error: string | null = null;
		if (d1Response.status === "fulfilled") {
			databases = (d1Response.value.data?.result ??
				[]) as D1DatabaseWithWorker[];
		} else {
			d1Error = `D1 Error: ${d1Response.reason instanceof Error ? d1Response.reason.message : JSON.stringify(d1Response.reason)}`;
		}

		let doNamespaces = new Array<DoNamespaceWithWorker>();
		let doError: string | null = null;
		if (doResponse.status === "fulfilled") {
			// Only show namespaces that use SQLite storage
			const allDoNamespaces = (doResponse.value.data?.result ??
				[]) as DoNamespaceWithWorker[];
			doNamespaces = allDoNamespaces.filter((ns) => ns.use_sqlite === true);
		} else {
			doError = `DO Error: ${doResponse.reason instanceof Error ? doResponse.reason.message : JSON.stringify(doResponse.reason)}`;
		}

		let r2Buckets = new Array<R2BucketWithWorker>();
		let r2Error: string | null = null;
		if (r2Response.status === "fulfilled") {
			r2Buckets = (r2Response.value.data?.result?.buckets ??
				[]) as R2BucketWithWorker[];
		} else {
			r2Error = `R2 Error: ${r2Response.reason instanceof Error ? r2Response.reason.message : JSON.stringify(r2Response.reason)}`;
		}

		let workflows = new Array<WorkflowsWorkflow>();
		let workflowsError: string | null = null;
		if (workflowsResponse.status === "fulfilled") {
			workflows = workflowsResponse.value.data?.result ?? [];
		} else {
			workflowsError = `Workflows Error: ${workflowsResponse.reason instanceof Error ? workflowsResponse.reason.message : JSON.stringify(workflowsResponse.reason)}`;
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
			workers,
			workflows,
			workflowsError,
		};
	},
});

function RootLayout() {
	const loaderData = Route.useLoaderData();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const workerFromUrl = useMemo(
		() => new URLSearchParams(routerState.location.searchStr).get("worker"),
		[routerState.location.searchStr]
	);
	const router = useRouter();

	// Filter out internal workers (like __asset-worker__, __router-worker__, etc.)
	const visibleWorkers = useMemo(
		() => filterVisibleWorkers(loaderData.workers),
		[loaderData.workers]
	);

	// Determine the default worker (self worker or first visible worker)
	const defaultWorker = useMemo(() => {
		const selfWorker = visibleWorkers.find((w) => w.isSelf);
		if (selfWorker) {
			return selfWorker.name;
		}
		return visibleWorkers[0]?.name ?? "";
	}, [visibleWorkers]);

	// The selected worker is either from URL or the default
	// We don't update the URL if using the default - only when user explicitly selects
	const selectedWorker = useMemo(() => {
		// If URL specifies a valid worker, use it
		if (workerFromUrl && visibleWorkers.some((w) => w.name === workerFromUrl)) {
			return workerFromUrl;
		}
		// Otherwise use the default
		return defaultWorker;
	}, [workerFromUrl, visibleWorkers, defaultWorker]);

	const handleWorkerChange = useCallback(
		(workerName: string) => {
			// Preserve existing search params (e.g. ?table=) and update worker.
			// Use window.location.pathname (full path including basepath) so that
			// router.history.push navigates within /cdn-cgi/explorer/... not /.
			const currentSearch = new URLSearchParams(routerState.location.searchStr);
			currentSearch.set("worker", workerName);
			router.history.push(
				`${window.location.pathname}?${currentSearch.toString()}`
			);
		},
		[router, routerState.location.searchStr]
	);

	// Filter resources based on selected worker
	const filteredData = useMemo(() => {
		if (!selectedWorker) {
			// No worker selected — no dev registry or single-worker case.
			// Return all resources unfiltered to preserve backward compatibility.
			return {
				kvNamespaces: loaderData.kvNamespaces,
				databases: loaderData.databases,
				doNamespaces: loaderData.doNamespaces,
				r2Buckets: loaderData.r2Buckets,
				workflows: loaderData.workflows,
			};
		}

		// Filter each resource type by workerName
		return {
			kvNamespaces: loaderData.kvNamespaces.filter(
				(ns) => ns.workerName === selectedWorker
			),
			databases: loaderData.databases.filter(
				(db) => db.workerName === selectedWorker
			),
			doNamespaces: loaderData.doNamespaces.filter(
				(ns) => ns.workerName === selectedWorker
			),
			r2Buckets: loaderData.r2Buckets.filter(
				(bucket) => bucket.workerName === selectedWorker
			),
			workflows: loaderData.workflows.filter(
				(wf) => wf.script_name === selectedWorker
			),
		};
	}, [
		selectedWorker,
		loaderData.kvNamespaces,
		loaderData.databases,
		loaderData.doNamespaces,
		loaderData.r2Buckets,
		loaderData.workflows,
	]);

	return (
		<Toasty>
			<div className="flex min-h-screen">
				<Sidebar
					currentPath={currentPath}
					d1Error={loaderData.d1Error}
					databases={filteredData.databases}
					doError={loaderData.doError}
					doNamespaces={filteredData.doNamespaces}
					kvError={loaderData.kvError}
					kvNamespaces={filteredData.kvNamespaces}
					r2Buckets={filteredData.r2Buckets}
					r2Error={loaderData.r2Error}
					workers={visibleWorkers}
					selectedWorker={selectedWorker}
					onWorkerChange={handleWorkerChange}
					workflows={filteredData.workflows}
					workflowsError={loaderData.workflowsError}
				/>
				<main className="flex flex-1 flex-col overflow-y-auto">
					<Outlet />
				</main>
			</div>
		</Toasty>
	);
}
