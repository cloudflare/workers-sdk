import { FC, useState } from 'react';
import { Banner } from './Banner';
import { Button } from './Button';

export const ImagesConfigurator: FC<{ onComplete: () => void }> = ({ onComplete }) => {
	const [success, setSuccess] = useState<boolean>();
	const [error, setError] = useState('');

	const configureImages = () => {
		(async () => {
			const response = await fetch('/admin/api/setup/images', {
				method: 'POST',
			});
			const data = await response.json<true | { error: string }>();
			if (data === true) {
				setSuccess(true);
				onComplete();
			} else {
				setError(data.error);
			}
		})();
	};

	return (
		<>
			<div>
				<h2 className="font-bold text-lg mt-8">Create Cloudflare Image variants</h2>
				<p className="mt-4">
					We will automatically create three variants for you: 'preview', 'blurred', and 'highres'.
				</p>
			</div>
			<div className="mt-2 text-right">
				<Button onClick={configureImages}>Create →</Button>
			</div>

			{success ? <Banner type="success" title="Success" /> : undefined}
			{error ? <Banner type="error" title="Error" description={error} /> : undefined}
		</>
	);
};
