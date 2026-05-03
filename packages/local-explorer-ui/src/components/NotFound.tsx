import { Button } from "@cloudflare/kumo";
import { Link, type NotFoundRouteProps } from "@tanstack/react-router";

export function NotFound(_props: NotFoundRouteProps): JSX.Element {
	return (
		<div className="text-text-secondary flex flex-1 flex-col items-center justify-center space-y-4 p-12 text-center">
			<h2 className="text-text text-3xl font-bold">Page not found</h2>

			<p className="text-text-secondary text-sm font-light">
				The resource you&apos;re looking for doesn&apos;t exist or has been
				removed.
			</p>

			<Link to="/">
				<Button variant="secondary">Go home</Button>
			</Link>
		</div>
	);
}
