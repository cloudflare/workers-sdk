import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/d1/$databaseId")({
	component: DatabaseView,
});

function DatabaseView() {
	const { databaseId } = Route.useParams();

	return (
		<div>
			<div className="breadcrumb-bar">
				<span className="breadcrumb-item">D1</span>
				<span className="breadcrumb-separator">&gt;</span>
				<span className="breadcrumb-item current">{databaseId}</span>
			</div>

			<div className="empty-state">
				<p>D1 database view coming soon.</p>
			</div>
		</div>
	);
}
