import { Box, Heading, Icon } from '@chakra-ui/react';
import { useEffect } from 'react';
import CommentSection from './components/CommentSection';
import Navbar from './components/Navbar';
import qs from 'query-string';
import { useAuth } from './context/AuthContext';

function App() {
	const { login } = useAuth();

	useEffect(() => {
		const parsedQuery = qs.parseUrl(window.location.href);
		const handleLogin = async () => {
			await login();
		};

		if (parsedQuery.query.code) {
			handleLogin();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<>
			<Navbar />
			<Box px={8} py={16}>
				<CommentSection />
			</Box>
		</>
	);
}

export default App;
