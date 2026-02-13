import { DatabaseIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { Breadcrumbs } from "../../components/Breadcrumbs";

export const Route = createFileRoute("/d1/$databaseId")({
	component: DatabaseView,
	validateSearch: (search) => ({
		table: typeof search.table === "string" ? search.table : undefined,
	}),
});

function DatabaseView(): JSX.Element {
	const params = Route.useParams();

	return (
		<div className="flex flex-col h-full">
			<Breadcrumbs icon={DatabaseIcon} title="D1" items={[params.databaseId]} />

			<div className="flex-1 overflow-hidden">
				{/* TODO: Add `<Studio />` component */}
			</div>
		</div>
	);
}
