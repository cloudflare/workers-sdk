import type { FC } from 'react';
import useSWR from 'swr';
import moment from 'moment';
import { DownloadIcon } from './DownloadIcon';
import { LockIcon } from './LockIcon';
import { EyeIcon } from './EyeIcon';

const ImageCard: FC<{ image: Image }> = ({
	image: { id, previewURL, name, alt, uploaded, isPrivate, downloadCount },
}) => {
	return (
		<div className="my-3 shadow-lg rounded-b-xl bg-white">
			<figure>
				<div className="sm:aspect-w-1 sm:aspect-h-1">
					<img src={previewURL} className="w-full object-contain" alt={alt} />
				</div>
				<figcaption className="m-3">
					<code>{name}</code>
					<p>
						<time dateTime={uploaded} className="text-sm">
							{moment(uploaded).fromNow()}
						</time>
					</p>
				</figcaption>
			</figure>
			<div className="flex justify-end p-2">
				<div className="flex items-center mr-2">
					<svg className="h-8 w-8 p-1">
						<EyeIcon />
					</svg>
					<span className="tabular-nums">{downloadCount}</span>
				</div>
				{!isPrivate ? (
					<a
						className="text-green-800 bg-green-200 rounded-md h-8 w-8 p-1"
						aria-label="Download"
						href={`/api/download?id=${id}`}
						download
					>
						<DownloadIcon />
					</a>
				) : (
					<div className="text-gray-800 bg-gray-200 rounded-md h-8 w-8 p-1">
						<LockIcon />
					</div>
				)}
			</div>
		</div>
	);
};

export const ImageGrid: FC = () => {
	// const { data, error } = useSWR<{ images: Image[] }>("/api/images");

	// if (error || data === undefined) {
	//   return (
	//     <div>
	//       An unexpected error has occurred when fetching the list of images.
	//       Please try again.
	//     </div>
	//   );
	// }

	const data = {
		images: [
			{
				id: '8277aeb6-f3fb-445d-43f9-ae710b3ffc00',
				previewURL:
					'https://imagedelivery.net/c_kvDVNdc0jEhXS4gDzgVA/8277aeb6-f3fb-445d-43f9-ae710b3ffc00/blurred',
				name: 'hannah-grace-fk4tiMlDFF0-unsplash.jpg',
				alt: 'string',
				uploaded: '2021-11-17T06:31:25.203Z',
				isPrivate: true,
				downloadCount: 2,
			},
			{
				id: 'e45bc50e-814f-4f2a-e6ab-d68a3f457500',
				previewURL:
					'https://imagedelivery.net/c_kvDVNdc0jEhXS4gDzgVA/e45bc50e-814f-4f2a-e6ab-d68a3f457500/blurred',
				name: 'parttime-portraits-atOlntWcO4k-unsplash.jpg',
				alt: 'string',
				uploaded: '2021-11-17T06:32:39.845Z',
				isPrivate: true,
				downloadCount: 4,
			},
			{
				id: '4f7fb54c-8469-4be1-eba1-f43f4286e800',
				previewURL:
					'https://imagedelivery.net/c_kvDVNdc0jEhXS4gDzgVA/4f7fb54c-8469-4be1-eba1-f43f4286e800/blurred',
				name: 'andrew-schultz-DTSDD968Mpw-unsplash.jpg',
				alt: 'string',
				uploaded: '2021-11-17T06:33:43.406Z',
				isPrivate: true,
				downloadCount: 1,
			},
			{
				id: '59384c25-66ac-4a0e-abf0-381b20c52a00',
				previewURL:
					'https://imagedelivery.net/c_kvDVNdc0jEhXS4gDzgVA/59384c25-66ac-4a0e-abf0-381b20c52a00/blurred',
				name: 'david-clarke-sVtcRzphxbk-unsplash.jpg',
				alt: 'string',
				uploaded: '2021-11-17T06:34:08.727Z',
				isPrivate: true,
				downloadCount: 1,
			},
			{
				id: '73d49242-64f0-4fce-c98b-5094a2ce2800',
				previewURL:
					'https://imagedelivery.net/c_kvDVNdc0jEhXS4gDzgVA/73d49242-64f0-4fce-c98b-5094a2ce2800/blurred',
				name: 'karsten-winegeart-Qb7D1xw28Co-unsplash.jpg',
				alt: 'string',
				uploaded: '2021-11-17T06:35:25.795Z',
				isPrivate: true,
				downloadCount: 2,
			},
			{
				id: '62fd1c2a-d41b-4256-fff7-8d4e855a7300',
				previewURL:
					'https://imagedelivery.net/c_kvDVNdc0jEhXS4gDzgVA/62fd1c2a-d41b-4256-fff7-8d4e855a7300/blurred',
				name: 'bill-stephan-9LkqymZFLrE-unsplash.jpg',
				alt: 'string',
				uploaded: '2021-11-17T06:59:35.151Z',
				isPrivate: true,
				downloadCount: 1,
			},
			{
				id: '91e684d1-940b-443c-b845-b67972fc9e00',
				previewURL:
					'https://imagedelivery.net/c_kvDVNdc0jEhXS4gDzgVA/91e684d1-940b-443c-b845-b67972fc9e00/blurred',
				name: 'karsten-winegeart-oU6KZTXhuvk-unsplash.jpg',
				alt: 'string',
				uploaded: '2021-11-17T06:59:37.854Z',
				isPrivate: true,
				downloadCount: 1,
			},
		],
	};

	return (
		<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{data.images.map(image => (
				<ImageCard image={image} key={image.id} />
			))}
		</div>
	);
};
