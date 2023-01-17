export interface Comment {
	user: User;
	uuid: string;
	message: string;
	likes: number;
	isLiked: boolean;
	timestamp: Date;
	comments: SubComment[];
}

export type Comments = Comment[];

export type Operation = 'increment' | 'decrement';

export type User = {
	name: string;
	username: string;
	id: number;
	avatar_url: string;
};

export type CreateCommentType = Omit<Comment, 'uuid'>;

export type SubComment = {
	user: User;
	message: string;
	timestamp: Date;
};
