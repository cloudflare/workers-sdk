import { FC, useState } from 'react';
import { Banner } from './Banner';
import { Button } from './Button';
import { ExternalLink } from './ExternalLink';

export const AccessConfigurator: FC<{ onComplete: () => void }> = ({ onComplete }) => {
	const [accessAud, setAccessAud] = useState('');
	const [success, setSuccess] = useState<boolean>();
	const [error, setError] = useState('');

	const configureAccess = () => {
		(async () => {
			const response = await fetch('/admin/api/setup/access', {
				method: 'POST',
				body: JSON.stringify({ aud: accessAud }),
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
				<h2 className="font-bold text-lg mt-8">Configure Cloudflare Access</h2>
				<p className="mt-4">
					Using{' '}
					<ExternalLink href="https://dash.teams.cloudflare.com/">Cloudflare Access</ExternalLink>,
					protect the `/admin` path of wherever you're deploying this app. Create a "Self-hosted"
					application
				</p>
			</div>

			<label className="block mt-6">
				Access `aud`
				<input
					type="password"
					name="apiToken"
					value={accessAud}
					onChange={event => setAccessAud(event.target.value)}
					className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
					autoFocus
				/>
			</label>

			<div className="mt-2 text-right">
				<Button onClick={configureAccess}>Save →</Button>
			</div>

			{success ? <Banner type="success" title="Success" /> : undefined}
			{error ? <Banner type="error" title="Error" description={error} /> : undefined}
		</>
	);
};
