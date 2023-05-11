import type { FC } from 'react';
import { Header } from '../components/Header';
import { ImageGrid } from '../components/ImageGrid';

export const Home: FC = () => {
	return (
		<div>
			<Header />
			<main className="max-w-6xl mx-auto p-4 pb-12">
				<ImageGrid />
			</main>
		</div>
	);
};
