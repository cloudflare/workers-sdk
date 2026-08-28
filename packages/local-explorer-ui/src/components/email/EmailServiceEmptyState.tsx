import { type JSX } from "react";

interface EmailServiceEmptyStateProps {
	title: string;
	description: string;
}

/**
 * Full-width empty state shown when the selected worker has not configured the
 * relevant email capability (e.g. no Send Email bindings).
 */
export function EmailServiceEmptyState({
	title,
	description,
}: EmailServiceEmptyStateProps): JSX.Element {
	return (
		<div className="px-8 py-6">
			<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-12 text-center">
				<p className="text-sm font-medium text-kumo-default">{title}</p>
				<p className="mx-auto mt-1 max-w-md text-sm text-kumo-subtle">
					{description}
				</p>
			</div>
		</div>
	);
}
