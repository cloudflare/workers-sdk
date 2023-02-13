import { FC, useState } from 'react';
import { Header } from '../components/Header';
import { ExternalLink } from '../components/ExternalLink';
import { AccountSelector } from '../components/AccountSelector';
import { ImagesConfigurator } from '../components/ImagesConfigurator';
import { AccessConfigurator } from '../components/AccessConfigurator';

export const Setup: FC = () => {
	const [accountId, setAccountId] = useState('');
	const [imagesComplete, setImagesComplete] = useState(false);

	return (
		<div>
			<Header login={false} />
			<main className="max-w-6xl mx-auto p-4 pb-12">
				<main>
					<p>Thanks for trying out our full-stack application built on Cloudflare Pages.</p>
					<p className="mt-2">
						This demo app uses{' '}
						<ExternalLink href="https://dash.cloudflare.com/sign-up/images" className="underline">
							Cloudflare Images
						</ExternalLink>{' '}
						and{' '}
						<ExternalLink href="https://dash.cloudflare.com/sign-up/teams" className="underline">
							Cloudflare Access
						</ExternalLink>
						, so make sure you've activated these in the Cloudflare Dashboard.
					</p>
					<form className="mt-4" action="#">
						<AccountSelector onSelectAccount={setAccountId} />

						{accountId !== '' ? (
							<ImagesConfigurator onComplete={() => setImagesComplete(true)} />
						) : undefined}

						{imagesComplete ? <AccessConfigurator onComplete={() => {}} /> : undefined}
					</form>
				</main>
			</main>
		</div>
	);
};
