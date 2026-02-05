import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Studio } from "../../components/studio";
import { StudioD1Connection, StudioD1Driver } from "../../drivers/d1";
import type { StudioResource } from "../../types/studio";

export const Route = createFileRoute("/d1/$databaseId")({
	component: DatabaseView,
});

function DatabaseView() {
	const { databaseId } = Route.useParams();

	const accountId = "1234";

	const driver = useMemo<StudioD1Driver>(() => {
		const connection = new StudioD1Connection(accountId, databaseId);
		return new StudioD1Driver(connection);
	}, [accountId, databaseId]);

	const resource = useMemo<StudioResource>(() => {
		return {
			type: "d1",
			accountId,
			databaseId,
		};
	}, [accountId, databaseId]);

	return (
		<div>
			<div className="breadcrumb-bar">
				<span className="breadcrumb-item">D1</span>
				<span className="breadcrumb-separator">&gt;</span>
				<span className="breadcrumb-item current">{databaseId}</span>
			</div>

			{/* <div className="empty-state">
				<p>D1 database view coming soon.</p>
			</div> */}
			<Studio driver={driver} resource={resource} category="d1" />
		</div>
	);
}
