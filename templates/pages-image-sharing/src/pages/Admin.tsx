import type { FC } from 'react';
import { Header } from '../components/Header';

export const Admin: FC = () => {
	return (
		<div>
			<Header login={false} />
			<main className="max-w-6xl mx-auto p-4 pb-12">
				<form method="POST" action="/admin/api/upload">
					<input type="file" name="file" />
					<button
						type="submit"
						className="rounded-lg shadow-md py-3 px-5 cursor-pointer inline-block bg-blue-100 text-blue-800"
					>
						Submit →
					</button>
				</form>
			</main>
		</div>
	);
};
