// apps/app/app/(authenticated)/dashboard/memories/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { database } from '@repo/database';
import { Header } from '../../components/header';
import { MemoriesClient } from './components/memories-client';

export const metadata = {
  title: 'Memories',
  description: 'View and manage your AI memories',
};

export default async function MemoriesPage() {
  const { userId: clerkUserId } = await auth();
  const user = await currentUser();
  
  if (!clerkUserId || !user) {
    redirect('/sign-in');
  }
  
  const dbUser = await database.user.findUnique({
    where: { clerkId: clerkUserId },
    select: {
      id: true,
      postgresSchemaInitialized: true,
      n8nPostgresCredentialId: true,
      postgresSetupError: true,
      northflankProjectStatus: true,
    },
  });
  
  if (!dbUser) {
    redirect('/sign-in');
  }
  
  return (
    <>
      <Header pages={['Dashboard', 'Memories']} page="Memories" />
      <MemoriesClient 
        userId={dbUser.id}
        isInitialized={dbUser.postgresSchemaInitialized}
        hasCredential={!!dbUser.n8nPostgresCredentialId}
        setupError={dbUser.postgresSetupError}
        projectStatus={dbUser.northflankProjectStatus}
      />
    </>
  );
}
