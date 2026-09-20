import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clean existing data
  await prisma.card.deleteMany();
  await prisma.list.deleteMany();
  await prisma.board.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  // Create demo user
  const user = await prisma.user.create({
    data: {
      email: 'demo@kanban.app',
      name: 'Demo User',
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
  await prisma.card.create({ data: { title: 'Research competitor pricing', position: 0, listId: backlog.id } });
  await prisma.card.create({ data: { title: 'Design new landing page hero', position: 1, listId: backlog.id } });
  await prisma.card.create({ data: { title: 'Collect user feedback from survey', position: 2, listId: backlog.id } });

  // To Do cards
  await prisma.card.create({ data: { title: 'Set up CI/CD pipeline', position: 0, listId: todo.id } });
  await prisma.card.create({ data: { title: 'Write API documentation', position: 1, listId: todo.id } });
  await prisma.card.create({ data: { title: 'Implement user authentication', position: 2, listId: todo.id } });

  // In Progress cards
  await prisma.card.create({ data: { title: 'Build kanban board component', position: 0, listId: inProgress.id } });
  await prisma.card.create({ data: { title: 'Migrate database to PostgreSQL', position: 1, listId: inProgress.id } });

  // Done cards
  await prisma.card.create({ data: { title: 'Initialize project repository', position: 0, listId: done.id } });
  await prisma.card.create({ data: { title: 'Define database schema', position: 1, listId: done.id } });
  await prisma.card.create({ data: { title: 'Set up Docker Compose', position: 2, listId: done.id } });

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
