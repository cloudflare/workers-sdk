import { Button } from "@cloudflare/kumo";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { PageLayout } from "./layout";

export function RouteError(_props: ErrorComponentProps) {
	return (
		<PageLayout>
			<div className="flex flex-1 flex-col items-center justify-center space-y-4 p-12 text-center text-text-secondary">
				<h2 className="text-3xl font-bold text-text">Resource not found</h2>

				<p className="text-sm font-light text-text-secondary">
					This binding doesn&apos;t exist in your current dev session.
				</p>

				<Link to="/">
					<Button variant="secondary">Go home</Button>
				</Link>
			</div>
		</PageLayout>
	);
}
