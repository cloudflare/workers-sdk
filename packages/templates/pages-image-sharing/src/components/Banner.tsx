import { FC } from 'react';

export const Banner: FC<{
	type: 'success' | 'error';
	title: string;
	description?: string;
}> = ({ type, title, description }) => {
	const color =
		type === 'success'
			? 'bg-green-100 text-green-800'
			: type === 'error'
			? 'bg-red-100 text-red-800'
			: '';
	return (
		<div className={`py-4 px-4 ${color} my-4 rounded-md`}>
			<p className="font-bold">{title}</p>
			{description && <p className="mt-2">{description}</p>}
		</div>
	);
};
