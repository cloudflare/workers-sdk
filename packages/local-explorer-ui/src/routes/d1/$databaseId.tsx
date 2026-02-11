import { CaretRightIcon, DatabaseIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";

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
			<div className="flex items-center gap-2 py-4 px-6 min-h-16.75 box-border bg-bg-secondary border-b border-border text-sm shrink-0">
				<span className="flex items-center gap-1.5">
					<DatabaseIcon />
					D1
				</span>
				<CaretRightIcon className="w-4 h-4" />
				<span className="flex items-center gap-1.5">{params.databaseId}</span>
			</div>

			<div className="flex-1 overflow-hidden">
				{/* TODO: Add `<Studio />` component */}
			</div>
		</div>
	);
}
