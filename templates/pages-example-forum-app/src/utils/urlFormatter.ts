import qs from 'query-string';

// This is a service class that handles the authentication of the user by sending a request to the server to get a code.
export const getFormattedGithubUrl = () => {
	const oAuthQueryParams = {
		response_type: 'code',
		scope: 'user',
		redirect_url: process.env.REACT_APP_REDIRECT_URL,
		client_id: process.env.REACT_APP_CLIENT_ID,
		state: 'random_state_string',
	};

	const query = qs.stringify(oAuthQueryParams);
	const url = `${process.env.REACT_APP_AUTHORIZATION_ENDPOINT}?${query}`;

	return url;
};
