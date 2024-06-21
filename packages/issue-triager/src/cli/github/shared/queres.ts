/**
 * GraphQL query segment representing an issue.
 */
export const issueQuery = `
    number
    title
    url
    body
    updatedAt
    labels(first: 10) {
        nodes {
            name
        }
    }
    assignees(first: 10) {
        nodes {
            login
        }
    }
    comments(first: 100) {
        nodes {
            author {
                login
            }
            body
            createdAt
        }
    }
`;
