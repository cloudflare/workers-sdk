import { Button } from "@cloudflare/kumo";
import { Link, type NotFoundRouteProps } from "@tanstack/react-router";
import { PageLayout } from "./layout";

export function NotFound(_props: NotFoundRouteProps) {
	return (
		<PageLayout>
			<div className="flex flex-1 flex-col items-center justify-center space-y-4 p-12 text-center text-text-secondary">
				<h2 className="text-3xl font-bold text-text">Page not found</h2>

				<p className="text-sm font-light text-text-secondary">
					The resource you&apos;re looking for doesn&apos;t exist or has been
					removed.
				</p>

				<Link to="/">
					<Button variant="secondary">Go home</Button>
				</Link>
			</div>
		</PageLayout>
	);
}
