import { DatabaseIcon } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { Studio } from "../../components/studio";
import { LocalD1Driver } from "../../drivers/d1";
import type { StudioResource } from "../../types/studio";

export const Route = createFileRoute("/d1/$databaseId")({
	component: DatabaseView,
	validateSearch: (search) => ({
		table: typeof search.table === "string" ? search.table : undefined,
	}),
});

function DatabaseView(): JSX.Element {
	const params = Route.useParams();
	const searchParams = Route.useSearch();
	const navigate = useNavigate();

	const driver = useMemo<LocalD1Driver>(
		() => new LocalD1Driver(params.databaseId),
		[params.databaseId]
	);

	const resource = useMemo<StudioResource>(
		() => ({
			databaseId: params.databaseId,
			type: "d1",
		}),
		[params.databaseId]
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

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-2 py-4 px-6 min-h-[67px] box-border bg-bg-secondary border-b border-border text-sm shrink-0">
				<span className="flex items-center gap-1.5 text-text-secondary">
					<DatabaseIcon />
					D1
				</span>
				<span className="text-text-secondary text-xs">&gt;</span>
				<span className="flex items-center gap-1.5 text-text font-medium">
					{params.databaseId}
				</span>
			</div>

			<div className="flex-1 overflow-hidden">
				<Studio
					category="d1"
					driver={driver}
					initialTable={searchParams.table}
					onTableChange={handleTableChange}
					resource={resource}
				/>
			</div>
		</div>
	);
}
