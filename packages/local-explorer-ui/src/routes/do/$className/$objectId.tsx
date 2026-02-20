import { Select } from "@base-ui/react/select";
import {
	CaretUpDownIcon,
	CheckIcon,
	CubeIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { durableObjectsNamespaceListNamespaces } from "../../../api";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { Studio } from "../../../components/studio";
import { LocalDODriver } from "../../../drivers/do";
import type { StudioResource } from "../../../types/studio";

export const Route = createFileRoute("/do/$className/$objectId")({
	component: ObjectView,
	loader: async ({ params }) => {
		// Resolve className to a namespace ID
		const response = await durableObjectsNamespaceListNamespaces();
		const namespaces = response.data?.result ?? [];
		const namespace = namespaces.find(
			(ns) => ns.class === params.className || ns.name === params.className
		);
		if (!namespace?.id) {
			throw new Error(`Durable Object class "${params.className}" not found`);
		}

		// Fetch tables using the resolved namespace ID
		const driver = new LocalDODriver(namespace.id, params.objectId);
		const schemas = await driver.schemas();
		const mainSchema = schemas["main"] ?? [];
		const tables = mainSchema
			.filter((item) => item.type === "table" || item.type === "view")
			.map((t) => ({ label: t.name, value: t.name }))
			.sort((a, b) => a.label.localeCompare(b.label));

		return {
			namespaceId: namespace.id,
			tables,
		};
	},
	validateSearch: (search) => ({
		table: typeof search.table === "string" ? search.table : undefined,
	}),
});

function ObjectView(): JSX.Element {
	const params = Route.useParams();
	const loaderData = Route.useLoaderData();
	const searchParams = Route.useSearch();
	const navigate = useNavigate();

	const { namespaceId } = loaderData;

	const driver = useMemo<LocalDODriver>(
		() => new LocalDODriver(namespaceId, params.objectId),
		[namespaceId, params.objectId]
	);

	const resource = useMemo<StudioResource>(
		() => ({
			namespaceId,
			objectId: params.objectId,
			type: "do",
		}),
		[namespaceId, params.objectId]
	);

	const handleTableChange = useCallback(
		(tableName: string | null) => {
			void navigate({
				search: {
					table: tableName ?? undefined,
				},
				to: ".",
			});
		},
		[navigate]
	);

	// Truncate the object ID for display
	const shortObjectId =
		params.objectId.length > 16
			? `${params.objectId.slice(0, 8)}...${params.objectId.slice(-8)}`
			: params.objectId;

	return (
		<div className="flex flex-col h-full">
			<Breadcrumbs
				icon={CubeIcon}
				items={[
					<Link
						className="flex items-center gap-1.5"
						key="class-name"
						params={{ className: params.className }}
						to="/do/$className"
					>
						{params.className}
					</Link>,
					<span
						className="flex items-center gap-1.5 font-mono text-xs"
						key="object-id"
						title={params.objectId}
					>
						{shortObjectId}
					</span>,
					<TableSelect key="table-selector" />,
				]}
				title="Durable Objects"
			/>

			<div className="flex-1 overflow-hidden">
				<Studio
					driver={driver}
					initialTable={searchParams.table}
					key={`${namespaceId}-${params.objectId}`}
					onTableChange={handleTableChange}
					resource={resource}
				/>
			</div>
		</div>
	);
}

function TableSelect(): JSX.Element {
	const data = Route.useLoaderData();
	const navigate = useNavigate();
	const searchParams = Route.useSearch();

	const handleTableChange = useCallback(
		(tableName: string | null) => {
			if (tableName === null) {
				return;
			}

			void navigate({
				search: {
					table: tableName,
				},
				to: ".",
			});
		},
		[navigate]
	);

	if (data.tables.length <= 0) {
		return (
			<span className="flex items-center gap-1.5" key="empty-tables-select">
				No tables
			</span>
		);
	}

	return (
		<Select.Root
			key="table-select"
			onValueChange={handleTableChange}
			value={searchParams.table ?? null}
		>
			<Select.Trigger className="inline-flex items-center gap-1 px-2 py-1 -mx-1.5 rounded-md bg-transparent text-sm text-text cursor-pointer border-none transition-colors hover:bg-border/50 data-popup-open:bg-border/50">
				<Select.Value placeholder="Select table" />
				<Select.Icon>
					<CaretUpDownIcon className="w-3.5 h-3.5 text-text-secondary" />
				</Select.Icon>
			</Select.Trigger>

			<Select.Portal>
				<Select.Positioner
					align="start"
					alignItemWithTrigger={false}
					side="bottom"
					sideOffset={4}
				>
					<Select.Popup className="min-w-36 max-h-72 bg-bg border border-border rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15)] z-100 overflow-hidden transition-[opacity,transform] duration-150 data-starting-style:opacity-0 data-starting-style:-translate-y-1 data-ending-style:opacity-0 data-ending-style:-translate-y-1">
						<Select.List className="p-1">
							{data.tables.map((table) => {
								const Icon =
									searchParams.table === table.value ? CheckIcon : TableIcon;

								return (
									<Select.Item
										className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-sm text-text cursor-pointer transition-colors select-none outline-none data-highlighted:bg-bg-secondary dark:data-highlighted:bg-bg-tertiary"
										key={table.value}
										value={table.value}
									>
										<span className="flex items-center w-4">
											<Icon className="w-3.5 h-3.5" />
										</span>
										<Select.ItemText>{table.label}</Select.ItemText>
									</Select.Item>
								);
							})}
						</Select.List>
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
	);
}
