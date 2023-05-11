import { Comment, Comments, CreateCommentType, Operation } from 'types';

class CommentServices {
	async getComments() {
		const response = await fetch('/api/getComments');
		const data = await response.json();
		return data as Comments;
	}

	// The code below sends a POST request to the server to add a comment to the KV store which
	// is then displayed in the CommentList component.
	async postComment(comment: CreateCommentType) {
		const response = await fetch('/api/form', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json;charset=utf-8',
			},
			body: JSON.stringify(comment),
		});
		//Parse the response as JSON
		const data = await response.json();
		return data as Comment; //This is the comment that was added to the KV store
	}

	async updateComment(comment: Comment) {
		const response = await fetch('/api/updateComment', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json;charset=utf-8',
			},
			body: JSON.stringify(comment),
		});
		//Parse the response as JSON
		const data = await response.json();
		return data as Comment;
	}
	// The code below sends a request to the Durable Object
	async updateLikesByID(commentID: string, operation: Operation) {
		const response = await fetch(
			`https://worker-durable.obinnacodes.workers.dev/${commentID}/${operation}`
		);
		const data = await response.text();
		return Number(data);
	}
}

export default new CommentServices();
