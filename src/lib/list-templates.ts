// Built-in board templates.
//
// These are static application templates (no database model): applying one
// creates its lists, labels, swimlanes and card types on the current board
// through the existing board template endpoint. No cards are ever created from
// a template.

export interface ListTemplate {
  id: string;
  name: string;
  description: string;
  lists: string[];
  labels: string[];
  swimlanes?: string[];
  cardTypes?: string[];
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

// Fixed colors for the standard template card types. Reuses the same palette
// as the card type picker so template types look identical to hand-made ones.
export const TEMPLATE_CARD_TYPE_COLORS: Record<string, string> = {
  Task: '#5B8DD9',
  Feature: '#5B8DD9',
  Bug: '#DC5A5A',
  Story: '#8B6FC7',
  'Technical Debt': '#64748B',
  Content: '#4FA3A3',
  Campaign: '#D9A03F',
  Page: '#7FA693',
  Asset: '#D9A03F',
  Article: '#5B8DD9',
  'Social Post': '#8B6FC7',
  Video: '#4FA3A3',
  Regression: '#D9A03F',
  Errand: '#D9A03F',
  Project: '#5B8DD9',
};

const FALLBACK_CARD_TYPE_COLOR = '#5B8DD9';

export const templateCardTypeColor = (name: string): string =>
  TEMPLATE_CARD_TYPE_COLORS[name] || FALLBACK_CARD_TYPE_COLOR;

export const LIST_TEMPLATES: ListTemplate[] = [
  {
    id: 'simple',
    name: 'Simple',
    description: 'A minimal flow for getting things done.',
    lists: ['To Do', 'Doing', 'Done'],
    labels: ['Important', 'Urgent', 'Waiting'],
    swimlanes: ['General'],
    cardTypes: ['Task'],
  },
  {
    id: 'project',
    name: 'Project',
    description: 'Track work from backlog to delivery.',
    lists: ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'],
    labels: ['Feature', 'Bug', 'Improvement', 'Urgent'],
    swimlanes: ['General'],
    cardTypes: ['Task', 'Feature', 'Bug'],
  },
  {
    id: 'software-development',
    name: 'Software Development',
    description: 'From ideas through code review and testing.',
    lists: ['Ideas', 'Backlog', 'Development', 'Code Review', 'Testing', 'Done'],
    labels: ['Feature', 'Bug', 'Improvement', 'Blocked', 'Needs Review'],
    swimlanes: ['Features', 'Bugs', 'Technical Debt'],
    cardTypes: ['Feature', 'Bug', 'Task', 'Technical Debt'],
  },
  {
    id: 'website',
    name: 'Website',
    description: 'Plan, design, build and launch a site.',
    lists: ['Ideas', 'Content', 'Design', 'Development', 'Testing', 'Live'],
    labels: ['Content', 'Design', 'Development', 'Bug', 'Review'],
    swimlanes: ['Content', 'Design', 'Development', 'Bugs'],
    cardTypes: ['Page', 'Content', 'Task', 'Feature', 'Bug'],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Take campaigns from idea to published.',
    lists: ['Ideas', 'Planning', 'Content Creation', 'Review', 'Scheduled', 'Published'],
    labels: ['Content', 'Campaign', 'Design', 'Review', 'Urgent'],
    swimlanes: ['Campaigns', 'Content', 'Design'],
    cardTypes: ['Campaign', 'Content', 'Task', 'Asset'],
  },
  {
    id: 'content',
    name: 'Content',
    description: 'Draft, review and schedule content.',
    lists: ['Ideas', 'Draft', 'Review', 'Scheduled', 'Published'],
    labels: ['Article', 'Social', 'Video', 'Review', 'Urgent'],
    swimlanes: ['Articles', 'Social', 'Video'],
    cardTypes: ['Article', 'Social Post', 'Video', 'Task'],
  },
  {
    id: 'personal',
    name: 'Personal',
    description: 'A lightweight personal productivity flow.',
    lists: ['Inbox', 'Next', 'In Progress', 'Waiting', 'Done'],
    labels: ['Personal', 'Errand', 'Important', 'Waiting'],
    swimlanes: ['Personal', 'Work', 'Errands'],
    cardTypes: ['Task', 'Project', 'Errand'],
  },
  {
    id: 'bug-tracking',
    name: 'Bug Tracking',
    description: 'Follow bugs from report to resolution.',
    lists: ['Reported', 'Confirmed', 'In Progress', 'Testing', 'Resolved', 'Closed'],
    labels: ['Bug', 'Critical', 'Regression', 'Needs Review'],
    swimlanes: ['Critical', 'Normal', 'Low Priority'],
    cardTypes: ['Bug', 'Regression', 'Task'],
  },
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'The classic Kanban flow with a blocked lane.',
    lists: ['Backlog', 'Ready', 'Doing', 'Blocked', 'Done'],
    labels: ['Blocked', 'Urgent', 'Review', 'Improvement'],
    swimlanes: ['General'],
    cardTypes: ['Task', 'Feature', 'Bug'],
  },
  {
    id: 'sprint',
    name: 'Sprint',
    description: 'Plan and run development sprints.',
    lists: ['Product Backlog', 'Sprint Backlog', 'In Progress', 'Review', 'Done'],
    labels: ['Feature', 'Bug', 'Technical Debt', 'Blocked'],
    swimlanes: ['Features', 'Bugs', 'Technical Debt'],
    cardTypes: ['Story', 'Task', 'Bug', 'Technical Debt'],
  },
];
