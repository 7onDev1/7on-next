// apps/app/app/(authenticated)/dashboard/memories/page.tsx
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { database } from '@repo/database';
import { Header } from '../../components/header';
import dynamic from 'next/dynamic';

// ✅ FIX: Dynamic import with ssr: false
const MemoriesClient = dynamic(
  () => import('./components/memories-client').then(mod => ({ 
    default: mod.MemoriesClient 
  })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    )
  }
);

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