import { FC } from 'react';
import { Link } from 'react-router-dom';

export const Header: FC<{ login?: boolean }> = ({ login = true }) => {
	return (
		<div className="pt-4 pb-6 mb-8 bg-blue-900 sticky top-0 z-10">
			<header className="flex items-center text-blue-50 max-w-6xl mx-auto">
				<h1 className="flex-1 text-lg md:text-xl lg:text-2xl">
					Image sharing platform built on{' '}
					<a
						href="https://pages.cloudflare.com/"
						target="_blank"
						rel="noopener noreferrer"
						className="underline"
					>
						Cloudflare Pages
					</a>
				</h1>
				{login ? (
					<nav className="ml-4">
						<ul>
							<li>
								<Link to="admin" className="underline">
									Log in
								</Link>
							</li>
						</ul>
					</nav>
				) : undefined}
			</header>
		</div>
	);
};
