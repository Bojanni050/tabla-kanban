// Built-in list templates.
//
// These are static application templates (no database model): selecting one
// simply creates its lists on the current board through the existing lists
// API. No cards are ever created from a template.

export interface ListTemplate {
  id: string;
  name: string;
  description: string;
  lists: string[];
}

export const LIST_TEMPLATES: ListTemplate[] = [
  {
    id: 'simple',
    name: 'Simple',
    description: 'A minimal flow for getting things done.',
    lists: ['To Do', 'Doing', 'Done'],
  },
  {
    id: 'project',
    name: 'Project',
    description: 'Track work from backlog to delivery.',
    lists: ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'],
  },
  {
    id: 'software-development',
    name: 'Software Development',
    description: 'From ideas through code review and testing.',
    lists: ['Ideas', 'Backlog', 'Development', 'Code Review', 'Testing', 'Done'],
  },
  {
    id: 'website',
    name: 'Website',
    description: 'Plan, design, build and launch a site.',
    lists: ['Ideas', 'Content', 'Design', 'Development', 'Testing', 'Live'],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Take campaigns from idea to published.',
    lists: ['Ideas', 'Planning', 'Content Creation', 'Review', 'Scheduled', 'Published'],
  },
  {
    id: 'content',
    name: 'Content',
    description: 'Draft, review and schedule content.',
    lists: ['Ideas', 'Draft', 'Review', 'Scheduled', 'Published'],
  },
  {
    id: 'personal',
    name: 'Personal',
    description: 'A lightweight personal productivity flow.',
    lists: ['Inbox', 'Next', 'In Progress', 'Waiting', 'Done'],
  },
  {
    id: 'bug-tracking',
    name: 'Bug Tracking',
    description: 'Follow bugs from report to resolution.',
    lists: ['Reported', 'Confirmed', 'In Progress', 'Testing', 'Resolved', 'Closed'],
  },
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'The classic Kanban flow with a blocked lane.',
    lists: ['Backlog', 'Ready', 'Doing', 'Blocked', 'Done'],
  },
  {
    id: 'sprint',
    name: 'Sprint',
    description: 'Plan and run development sprints.',
    lists: ['Product Backlog', 'Sprint Backlog', 'In Progress', 'Review', 'Done'],
  },
];
