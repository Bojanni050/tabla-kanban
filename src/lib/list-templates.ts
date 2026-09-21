// Built-in list templates.
//
// These are static application templates (no database model): selecting one
// simply creates its lists and labels on the current board through the
// existing lists and labels APIs. No cards are ever created from a template.

export interface ListTemplate {
  id: string;
  name: string;
  description: string;
  lists: string[];
  labels: string[];
}

// Fixed colors for the standard template labels.
export const TEMPLATE_LABEL_COLORS: Record<string, string> = {
  Urgent: '#CE6F51',
  Important: '#D9A03F',
  Critical: '#DC5A5A',
  Bug: '#DC5A5A',
  Feature: '#5B8DD9',
  Improvement: '#7FA693',
  Blocked: '#A94442',
  'Needs Review': '#8B6FC7',
  Review: '#8B6FC7',
  Content: '#4FA3A3',
  Design: '#D96A9B',
  Development: '#5B8DD9',
  Campaign: '#D9A03F',
  Article: '#5B8DD9',
  Social: '#8B6FC7',
  Video: '#4FA3A3',
  Personal: '#7FA693',
  Errand: '#D9A03F',
  Waiting: '#64748B',
  Regression: '#D9A03F',
  'Technical Debt': '#64748B',
};

export const LIST_TEMPLATES: ListTemplate[] = [
  {
    id: 'simple',
    name: 'Simple',
    description: 'A minimal flow for getting things done.',
    lists: ['To Do', 'Doing', 'Done'],
    labels: ['Important', 'Urgent', 'Waiting'],
  },
  {
    id: 'project',
    name: 'Project',
    description: 'Track work from backlog to delivery.',
    lists: ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'],
    labels: ['Feature', 'Bug', 'Improvement', 'Urgent'],
  },
  {
    id: 'software-development',
    name: 'Software Development',
    description: 'From ideas through code review and testing.',
    lists: ['Ideas', 'Backlog', 'Development', 'Code Review', 'Testing', 'Done'],
    labels: ['Feature', 'Bug', 'Improvement', 'Blocked', 'Needs Review'],
  },
  {
    id: 'website',
    name: 'Website',
    description: 'Plan, design, build and launch a site.',
    lists: ['Ideas', 'Content', 'Design', 'Development', 'Testing', 'Live'],
    labels: ['Content', 'Design', 'Development', 'Bug', 'Review'],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Take campaigns from idea to published.',
    lists: ['Ideas', 'Planning', 'Content Creation', 'Review', 'Scheduled', 'Published'],
    labels: ['Content', 'Campaign', 'Design', 'Review', 'Urgent'],
  },
  {
    id: 'content',
    name: 'Content',
    description: 'Draft, review and schedule content.',
    lists: ['Ideas', 'Draft', 'Review', 'Scheduled', 'Published'],
    labels: ['Article', 'Social', 'Video', 'Review', 'Urgent'],
  },
  {
    id: 'personal',
    name: 'Personal',
    description: 'A lightweight personal productivity flow.',
    lists: ['Inbox', 'Next', 'In Progress', 'Waiting', 'Done'],
    labels: ['Personal', 'Errand', 'Important', 'Waiting'],
  },
  {
    id: 'bug-tracking',
    name: 'Bug Tracking',
    description: 'Follow bugs from report to resolution.',
    lists: ['Reported', 'Confirmed', 'In Progress', 'Testing', 'Resolved', 'Closed'],
    labels: ['Bug', 'Critical', 'Regression', 'Needs Review'],
  },
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'The classic Kanban flow with a blocked lane.',
    lists: ['Backlog', 'Ready', 'Doing', 'Blocked', 'Done'],
    labels: ['Blocked', 'Urgent', 'Review', 'Improvement'],
  },
  {
    id: 'sprint',
    name: 'Sprint',
    description: 'Plan and run development sprints.',
    lists: ['Product Backlog', 'Sprint Backlog', 'In Progress', 'Review', 'Done'],
    labels: ['Feature', 'Bug', 'Technical Debt', 'Blocked'],
  },
];
