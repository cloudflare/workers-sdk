import type { FC } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useSWR, { SWRConfig } from 'swr';
import { Home } from './pages/Home';
import { Setup } from './pages/Setup';
import { Admin } from './pages/Admin';
import { jsonFetcher } from './utils/jsonFetcher';

const Router: FC = () => {
	// const { data: setup, error } = useSWR("/api/setup");

	// if (error) return <div>{`Error loading setup information: ${error}`}</div>;
	const setup = true;

	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={setup ? <Home /> : <Navigate to="admin/setup" />} />
				{/* <Route path="admin/setup" element={<Setup />} />
        <Route path="admin" element={<Admin />} /> */}
			</Routes>
		</BrowserRouter>
	);
};

export const App: FC = () => {
	return (
		<SWRConfig value={{ fetcher: jsonFetcher }}>
			<Router />
		</SWRConfig>
	);
};
