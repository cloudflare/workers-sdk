import { FC, useState, useEffect } from 'react';
import { ExternalLink } from './ExternalLink';
import { Banner } from './Banner';
import createTokenButton from '../assets/create_token_button.png';
import customToken from '../assets/custom_token.png';
import tokenConfiguration from '../assets/token_configuration.png';
import createToken from '../assets/create_token.png';

export const AccountSelector: FC<{
	onSelectAccount: (accountId: string) => void;
}> = ({ onSelectAccount }) => {
	const [error, setError] = useState('');
	const [apiToken, setApiToken] = useState('');
	const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
	const [accountId, setAccountId] = useState('');

	useEffect(() => {
		(async () => {
			if (apiToken === '') return;

			const response = await fetch(`/admin/api/setup/apiToken`, {
				method: 'POST',
				body: JSON.stringify({ apiToken }),
			});
			const data = await response.json<{
				error?: string;
				accountId?: string;
				accounts?: { id: string; name: string }[];
			}>();

			if (data.accountId) {
				setError('');
				setAccountId(data.accountId);
				setAccounts([]);
			} else if (data.accounts && data.accounts.length > 0) {
				setError('');
				setAccountId(data.accounts[0].id);
				setAccounts(data.accounts);
			} else {
				setError(
					data.error ||
						'An unknown error has occurred while configuring your API token. Please try again.'
				);
				setAccountId('');
				setAccounts([]);
			}
		})();
	}, [apiToken]);

	useEffect(() => {
		(async () => {
			if (accountId === '') return;

			const response = await fetch('/admin/api/setup/accountId', {
				method: 'POST',
				body: JSON.stringify({ accountId }),
			});
			const data = await response.json<{ error?: string } | true>();
			if (data === true) {
				setError('');
				onSelectAccount(accountId);
			} else {
				setError(
					data.error ||
						'An unknown error has occurred while selecting your account. Please try again.'
				);
				setAccountId('');
			}
		})();
	}, [accountId, onSelectAccount]);

	return (
		<>
			<div>
				<h2 className="font-bold text-lg mt-8">Create an API Token</h2>
				<ol className="space-y-4 list-decimal ml-8 mt-4">
					<li>
						Navigate to the{' '}
						<ExternalLink
							href="https://dash.cloudflare.com/profile/api-tokens"
							className="underline"
						>
							API Tokens page on the Cloudflare dashboard
						</ExternalLink>
						.
					</li>
					<li>
						<details className="ml-2">
							<summary>Click the blue "Create Token" button.</summary>
							<img
								src={createTokenButton}
								alt="Screenshot of the blue 'Create Token' button in the Cloudflare dashboard"
								className="my-2"
							/>
						</details>
					</li>
					<li>
						<details className="ml-2">
							<summary>
								Under the "Custom token" heading, click the blue "Get started" button.
							</summary>
							<img
								src={customToken}
								alt="Screenshot of the blue 'Get started' button under the 'Custom token' heading in the Cloudflare dashboard"
								className="my-2"
							/>
						</details>
					</li>
					<li>
						<details className="ml-2">
							<summary>
								Give the token a name, set read permissions for "Account Settings", edit permissions
								for "Cloudflare Images" and "Access: Apps and Policies", and click the blue
								"Continue to summary" button.
							</summary>
							{/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
							<img
								src={tokenConfiguration}
								alt="Screenshot of the token configuration screen with the following options. Token name: 'Image Sharing Platform'; Permissions: 'Account Settings — Read', 'Account — Cloudflare Images — Edit', 'Account — Access: Apps and Policies — Edit'"
								className="my-2"
							/>
						</details>
					</li>
					<li>
						<details className="ml-2">
							<summary>Finally, click the blue "Create Token" button.</summary>
							{/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
							<img
								src={createToken}
								alt="Screenshot of the blue 'Create Token' button in the Cloudflare dashboard"
								className="my-2"
							/>
						</details>
					</li>
				</ol>

				<label className="block mt-6">
					API Token
					<input
						type="password"
						name="apiToken"
						value={apiToken}
						onChange={event => setApiToken(event.target.value)}
						className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
						autoFocus
					/>
				</label>

				{error ? <Banner type="error" title="Error" description={error} /> : undefined}
			</div>

			{accounts.length > 0 ? (
				<div>
					<h2 className="font-bold text-lg mt-8">Select an account</h2>
					<label className="block mt-4">
						Account
						<select
							className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
							value={accountId}
							onChange={event => setAccountId(event.target.value)}
						>
							{accounts.map(account => (
								<option key={account.id} value={account.id}>
									{account.name}
								</option>
							))}
						</select>
					</label>
				</div>
			) : undefined}
		</>
	);
};
