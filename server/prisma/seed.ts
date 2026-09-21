import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Clean existing data
  await prisma.checklistItem.deleteMany();
  await prisma.card.deleteMany();
  await prisma.label.deleteMany();
  await prisma.list.deleteMany();
  await prisma.board.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  // Create demo user with hashed password
  const passwordHash = await bcrypt.hash('password', 10);
  const user = await prisma.user.create({
    data: {
      email: 'demo@kanban.app',
      name: 'Demo User',
      passwordHash,
    },
  });

  // Create demo workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: 'My Workspace',
      userId: user.id,
    },
  });

  // Create demo board
  const board = await prisma.board.create({
    data: {
      name: 'Product Roadmap',
      workspaceId: workspace.id,
    },
  });

  // Create reusable board labels
  const labelDesign = await prisma.label.create({
    data: { name: 'Design', color: '#8b5cf6', boardId: board.id },
  });
  const labelDev = await prisma.label.create({
    data: { name: 'Engineering', color: '#3b82f6', boardId: board.id },
  });
  const labelResearch = await prisma.label.create({
    data: { name: 'Research', color: '#10b981', boardId: board.id },
  });
  const labelUrgent = await prisma.label.create({
    data: { name: 'Urgent', color: '#f43f5e', boardId: board.id },
  });

  // Create lists
  const backlog = await prisma.list.create({
    data: { title: 'Backlog', position: 0, boardId: board.id },
  });
  const todo = await prisma.list.create({
    data: { title: 'To Do', position: 1, boardId: board.id },
  });
  const inProgress = await prisma.list.create({
    data: { title: 'In Progress', position: 2, boardId: board.id },
  });
  const done = await prisma.list.create({
    data: { title: 'Done', position: 3, boardId: board.id },
  });

  // Backlog cards
  await prisma.card.create({
    data: {
      title: 'Research competitor pricing',
      description: 'Analyze pricing tiers of top 5 competitors and identify opportunity areas.',
      position: 0,
      priority: 'MEDIUM',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      listId: backlog.id,
      labels: { connect: [{ id: labelResearch.id }] },
      checklistItems: {
        create: [
          { title: 'Identify top 5 direct competitors', completed: true, position: 0 },
          { title: 'Compare feature matrices and pricing models', completed: true, position: 1 },
          { title: 'Summarize key takeaways in slide deck', completed: false, position: 2 },
        ],
      },
    },
  });
  await prisma.card.create({
    data: {
      title: 'Design new landing page hero',
      description: 'Create responsive Figma mockups for desktop and mobile hero sections.',
      position: 1,
      priority: 'HIGH',
      listId: backlog.id,
      labels: { connect: [{ id: labelDesign.id }] },
    },
  });
  await prisma.card.create({
    data: {
      title: 'Collect user feedback from survey',
      position: 2,
      priority: 'LOW',
      listId: backlog.id,
      labels: { connect: [{ id: labelResearch.id }] },
    },
  });

  // To Do cards
  await prisma.card.create({
    data: {
      title: 'Set up CI/CD pipeline',
      description: 'Configure GitHub Actions for automated testing and deployment.',
      position: 0,
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      listId: todo.id,
      labels: { connect: [{ id: labelDev.id }] },
    },
  });
  await prisma.card.create({
    data: {
      title: 'Write API documentation',
      position: 1,
      priority: 'MEDIUM',
      listId: todo.id,
      labels: { connect: [{ id: labelDev.id }] },
    },
  });
  await prisma.card.create({
    data: {
      title: 'Implement user authentication',
      position: 2,
      priority: 'HIGH',
      listId: todo.id,
      labels: { connect: [{ id: labelDev.id }, { id: labelUrgent.id }] },
      checklistItems: {
        create: [
          { title: 'Design session schema', completed: true, position: 0 },
          { title: 'Create sign up / sign in endpoints', completed: false, position: 1 },
          { title: 'Add password hashing with bcrypt', completed: false, position: 2 },
        ],
      },
    },
  });

  // In Progress cards
  await prisma.card.create({
    data: {
      title: 'Build kanban board component',
      description: 'Develop interactive drag-and-drop board with list and card reordering.',
      position: 0,
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      listId: inProgress.id,
      labels: { connect: [{ id: labelDev.id }, { id: labelDesign.id }] },
      checklistItems: {
        create: [
          { title: 'Implement list drag and drop', completed: true, position: 0 },
          { title: 'Implement card reordering', completed: true, position: 1 },
          { title: 'Add card detail modal', completed: true, position: 2 },
          { title: 'Support labels and checklist', completed: false, position: 3 },
        ],
      },
    },
  });
  await prisma.card.create({
    data: {
      title: 'Migrate database to PostgreSQL',
      description: 'Migrated Prisma schema to PostgreSQL with Prisma client integration.',
      position: 1,
      priority: 'MEDIUM',
      listId: inProgress.id,
      labels: { connect: [{ id: labelDev.id }] },
    },
  });

  // Done cards
  await prisma.card.create({
    data: {
      title: 'Initialize project repository',
      position: 0,
      priority: 'LOW',
      listId: done.id,
      labels: { connect: [{ id: labelDev.id }] },
    },
  });
  await prisma.card.create({
    data: {
      title: 'Define database schema',
      position: 1,
      priority: 'HIGH',
      listId: done.id,
      labels: { connect: [{ id: labelDev.id }] },
    },
  });
  await prisma.card.create({
    data: {
      title: 'Set up Docker Compose',
      position: 2,
      priority: 'LOW',
      listId: done.id,
      labels: { connect: [{ id: labelDev.id }] },
    },
  });

  console.log('Seed completed successfully');
  console.log(`  User: ${user.email}`);
  console.log(`  Workspace: ${workspace.name}`);
  console.log(`  Board: ${board.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
