import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
// import { Studio } from "../../components/studio";
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
	const _searchParams = Route.useSearch();
	const navigate = useNavigate();

	const _driver = useMemo<LocalD1Driver>(
		() => new LocalD1Driver(params.databaseId),
		[params.databaseId]
	);

	const _resource = useMemo<StudioResource>(
		() => ({
			databaseId: params.databaseId,
			type: "d1",
		}),
		[params.databaseId]
	);

	const _handleTableChange = useCallback(
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
		<div>
			<div className="breadcrumb-bar">
				<span className="breadcrumb-item">D1</span>
				<span className="breadcrumb-separator">&gt;</span>
				<span className="breadcrumb-item current">{params.databaseId}</span>
			</div>
			{/* <Studio
				category="d1"
				driver={driver}
				initialTable={searchParams.table}
				onTableChange={handleTableChange}
				resource={resource}
			/> */}
		</div>
	);
}
