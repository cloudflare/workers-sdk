import { Button } from "@cloudflare/kumo";
import { WarningIcon } from "@phosphor-icons/react";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import type { WorkersApiResponseCommonFailure } from "../api";

const DEFAULT_ERROR_DESCRIPTION =
	"An unknown error occured. Please report this issue to Cloudflare.";

export function ResourceError({
	error,
}: ErrorComponentProps<Error | WorkersApiResponseCommonFailure>): JSX.Element {
	const details =
		("errors" in error ? error.errors?.[0]?.message : error.message) ??
		DEFAULT_ERROR_DESCRIPTION;

	return (
		<div className="text-text-secondary flex flex-1 flex-col items-center justify-center space-y-4 p-12 text-center">
			<WarningIcon size={48} />

			<h2 className="text-text text-3xl font-bold">Something went wrong</h2>

			<p className="text-text-secondary text-sm font-light">{details}</p>

			<Link to="/">
				<Button variant="secondary">Go home</Button>
			</Link>
		</div>
	);
}
