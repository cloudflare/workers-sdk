import { Button } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	PencilIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import {
	createFileRoute,
	getRouteApi,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import D1Icon from "../../assets/icons/d1.svg?react";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { Studio } from "../../components/studio";
import { DropTableConfirmationModal } from "../../components/studio/Modal/DropTableConfirmation";
import { StudioTableActionsDropdown } from "../../components/studio/Table/ActionsDropdown";
import { TableSelect } from "../../components/TableSelect";
import { LocalD1Driver } from "../../drivers/d1";
import type { StudioRef } from "../../components/studio";
import type { StudioResource } from "../../types/studio";

export const Route = createFileRoute("/d1/$databaseId")({
	component: DatabaseView,
	loader: async (ctx) => {
		const driver = new LocalD1Driver(ctx.params.databaseId);
		const schemas = await driver.schemas();
		const mainSchema = schemas["main"] ?? [];
		const tables = mainSchema
			.filter((item) => item.type === "table" || item.type === "view")
			.map((t) => ({ label: t.name, value: t.name }))
			.sort((a, b) => a.label.localeCompare(b.label));

		return {
			tables,
		};
	},
	validateSearch: (search) => ({
		table: typeof search.table === "string" ? search.table : undefined,
	}),
});

const rootRoute = getRouteApi("__root__");

function DatabaseView(): JSX.Element {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();
	const searchParams = Route.useSearch();
	const navigate = useNavigate();
	const router = useRouter();
	const rootData = rootRoute.useLoaderData();

	const lastSyncedTable = useRef<string | undefined>(searchParams.table);
	const studioRef = useRef<StudioRef>(null);

	const [currentTable, setCurrentTable] = useState<string | undefined>(
		searchParams.table
	);
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
	const [deleteTarget, setDeleteTarget] = useState<{
		schemaName: string;
		tableName: string;
	} | null>(null);

	const driver = useMemo<LocalD1Driver>(
		() => new LocalD1Driver(params.databaseId),
		[params.databaseId]
	);

	// Get database name (binding) from root loader data
	const databaseName = useMemo(() => {
		const database = rootData.databases.find(
			(db) => db.uuid === params.databaseId
		);
		return database?.name;
	}, [rootData.databases, params.databaseId]);

	const resource = useMemo<StudioResource>(
		() => ({
			databaseId: params.databaseId,
			type: "d1",
		}),
		[params.databaseId]
	);

	const handleTableChange = useCallback(
		(tableName: string | undefined) => {
			setCurrentTable(tableName);

			// Skip URL navigation if the table hasn't changed
			if (lastSyncedTable.current === tableName) {
				return;
			}

			lastSyncedTable.current = tableName;

			void navigate({
				replace: true,
				search: {
					table: tableName,
				},
				to: ".",
			});
		},
		[navigate]
	);

	const handleTableRefresh = useCallback(async (): Promise<void> => {
		setIsRefreshing(true);
		try {
			// Route invalidation can often be so quick the loading state doesn't show
			// so we add an artificial delay to ensure the user see's something happen.
			await Promise.all([
				router.invalidate(),
				studioRef.current?.refreshSchema(),
				new Promise((resolve) => setTimeout(resolve, 250)),
			]);
		} finally {
			setIsRefreshing(false);
		}
	}, [router]);

	const handleTableDeleted = useCallback(async (): Promise<void> => {
		await handleTableRefresh();
		void navigate({
			replace: true,
			search: {
				table: undefined,
			},
			to: ".",
		});
	}, [handleTableRefresh, navigate]);

	const handleDeleteClick = useCallback((): void => {
		if (!currentTable) {
			return;
		}

		setDeleteTarget({
			schemaName: "main",
			tableName: currentTable,
		});
	}, [currentTable]);

	const handleCloseDeleteModal = useCallback((): void => {
		setDeleteTarget(null);
	}, []);

	const handleDeleteSuccess = useCallback((): void => {
		if (!deleteTarget) {
			return;
		}

		studioRef.current?.closeTableTabs(
			deleteTarget.schemaName,
			deleteTarget.tableName
		);
		void handleTableDeleted();
	}, [deleteTarget, handleTableDeleted]);

	return (
		<div className="flex h-full flex-col">
			<Breadcrumbs
				icon={D1Icon}
				title="D1"
				items={[
					<span className="flex items-center gap-1.5" key="database-id">
						{databaseName && databaseName !== params.databaseId ? (
							<>
								{databaseName}
								<span className="text-kumo-subtle">({params.databaseId})</span>
							</>
						) : (
							params.databaseId
						)}
					</span>,
					<TableSelect
						key="table-selector"
						selectedTable={searchParams.table}
						studioRef={studioRef}
						tables={loaderData.tables}
					/>,
				]}
			>
				<div className="flex-1" />

				<Button
					aria-label="Refresh tables"
					className="disabled:cursor-progress"
					disabled={isRefreshing}
					onClick={handleTableRefresh}
					shape="square"
				>
					<ArrowsCounterClockwiseIcon
						className={isRefreshing ? "animate-spin" : undefined}
						size={14}
					/>
				</Button>

				<StudioTableActionsDropdown
					currentTable={currentTable}
					driver={driver}
				/>

				<Button
					aria-label="Edit table schema"
					disabled={!currentTable}
					icon={PencilIcon}
					onClick={(): void => {
						if (currentTable) {
							studioRef.current?.openEditTableTab("main", currentTable);
						}
					}}
				>
					Edit Schema
				</Button>

				<Button
					aria-label="Delete table"
					disabled={!currentTable}
					icon={TrashIcon}
					onClick={handleDeleteClick}
					variant="secondary-destructive"
				>
					Delete Table
				</Button>
			</Breadcrumbs>

			{deleteTarget && (
				<DropTableConfirmationModal
					closeModal={handleCloseDeleteModal}
					driver={driver}
					isOpen={true}
					onSuccess={handleDeleteSuccess}
					schemaName={deleteTarget.schemaName}
					tableName={deleteTarget.tableName}
				/>
			)}

			<div className="flex-1 overflow-hidden bg-kumo-elevated">
				<Studio
					driver={driver}
					initialTable={searchParams.table}
					key={params.databaseId}
					onTableChange={handleTableChange}
					ref={studioRef}
					resource={resource}
				/>
			</div>
		</div>
	);
}
