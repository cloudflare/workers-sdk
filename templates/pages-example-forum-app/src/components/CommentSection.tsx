import React, { useState, useEffect } from 'react';
import { Box, HStack, StackDivider } from '@chakra-ui/react';
import AddComment from './AddComment';
import Loading from './Loading';
import CommentList from './CommentList';
import commentServices from '../services/commentServices';
import { Comment, Comments } from 'types';

const CommentSection: React.FC = () => {
	const [loading, setloading] = useState(false);
	const [comments, setComments] = useState<Comments>([]);

	const handleFetchComments = async () => {
		try {
			setloading(true);
			const comments = await commentServices.getComments();
			setComments(comments);
		} catch (error) {
			console.log('error');
		} finally {
			setloading(false);
		}
	};
	// adds a new comment to the list of comments
	const handleAddComment = (comment: Comment) => {
		setComments([comment, ...comments]);
	};

	// Fetch the existing comments on component mount and set the loading state to false
	useEffect(() => {
		handleFetchComments();
	}, []);

	return (
		<HStack
			divider={<StackDivider borderColor="gray.200" />}
			flexDir={{ base: 'column', md: 'row' }}
			position="relative"
			align="flex-start"
			spacing={4}
			width="100%"
			my={16}
		>
			<Box
				w={{ base: '100%', md: '40%' }}
				mb={{ base: 8, md: 0 }}
				position={{ base: 'static', md: 'sticky' }}
				top={{ base: 0, md: 8 }}
				left={0}
			>
				<AddComment handleAddComment={handleAddComment} />
			</Box>
			<Box w={{ base: '100%', md: '60%' }}>
				{loading ? <Loading /> : <CommentList comments={comments} />}
			</Box>
		</HStack>
	);
};

export default CommentSection;
