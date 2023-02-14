import { Heading, VStack } from '@chakra-ui/react';
import Comment from './Comment';
import { Comments } from 'types';

interface Props {
	comments: Comments;
}

// This component is a list of comments

const CommentsList: React.FC<Props> = ({ comments }) => {
	return (
		<VStack spacing={8} w="100%">
			{comments.length === 0 ? (
				<Heading size="xl">No comments added</Heading>
			) : (
				comments.map(comment => <Comment key={comment.uuid} comment={comment} />)
			)}
		</VStack>
	);
};

export default CommentsList;
