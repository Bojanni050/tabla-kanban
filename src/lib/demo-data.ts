import type { BoardWithDetails, Workspace } from '@/types';

export const DEMO_WORKSPACES: Workspace[] = [
  {
    id: 'demo-workspace',
    name: 'My Workspace',
    userId: 'demo-user',
    boards: [
      {
        id: 'demo-board',
        name: 'Product Roadmap',
        workspaceId: 'demo-workspace',
      },
    ],
  },
];

export const DEMO_BOARD: BoardWithDetails = {
  id: 'demo-board',
  name: 'Product Roadmap',
  myRole: 'OWNER',
  workspaceId: 'demo-workspace',
  workspace: {
    id: 'demo-workspace',
    name: 'My Workspace',
    userId: 'demo-user',
    boards: [],
  },
  labels: [],
  lists: [
    {
      id: 'list-backlog',
      title: 'Backlog',
      position: 0,
      boardId: 'demo-board',
      cards: [
        { id: 'c1', title: 'Research competitor pricing', description: null, position: 0, listId: 'list-backlog' },
        { id: 'c2', title: 'Design new landing page hero', description: null, position: 1, listId: 'list-backlog' },
        { id: 'c3', title: 'Collect user feedback from survey', description: null, position: 2, listId: 'list-backlog' },
      ],
    },
    {
      id: 'list-todo',
      title: 'To Do',
      position: 1,
      boardId: 'demo-board',
      cards: [
        { id: 'c4', title: 'Set up CI/CD pipeline', description: null, position: 0, listId: 'list-todo' },
        { id: 'c5', title: 'Write API documentation', description: null, position: 1, listId: 'list-todo' },
        { id: 'c6', title: 'Implement user authentication', description: null, position: 2, listId: 'list-todo' },
      ],
    },
    {
      id: 'list-inprogress',
      title: 'In Progress',
      position: 2,
      boardId: 'demo-board',
      cards: [
        { id: 'c7', title: 'Build kanban board component', description: null, position: 0, listId: 'list-inprogress' },
        { id: 'c8', title: 'Migrate database to PostgreSQL', description: null, position: 1, listId: 'list-inprogress' },
      ],
    },
    {
      id: 'list-done',
      title: 'Done',
      position: 3,
      boardId: 'demo-board',
      cards: [
        { id: 'c9', title: 'Initialize project repository', description: null, position: 0, listId: 'list-done' },
        { id: 'c10', title: 'Define database schema', description: null, position: 1, listId: 'list-done' },
        { id: 'c11', title: 'Set up Docker Compose', description: null, position: 2, listId: 'list-done' },
      ],
    },
  ],
};
