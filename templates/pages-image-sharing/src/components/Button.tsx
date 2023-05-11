import { FC } from 'react';

export const Button: FC<{ type?: 'default'; onClick: () => void }> = ({
	type = 'default',
	onClick,
	children,
}) => {
	const color = type === 'default' ? 'bg-blue-100 text-blue-800' : '';
	return (
		<div
			onClick={onClick}
			className={`rounded-lg shadow-md py-3 px-5 cursor-pointer inline-block ${color}`}
		>
			{children}
		</div>
	);
};
