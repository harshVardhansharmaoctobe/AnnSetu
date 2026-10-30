import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Hourglass, XCircle } from 'lucide-react';
import prisma from '@/lib/db';
import { requirePageUser, ROLE_HOME } from '@/lib/page-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default async function PendingPage() {
  const user = await requirePageUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  if (user.accountStatus === 'APPROVED') redirect(ROLE_HOME[user.role]);

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { donorProfile: { select: { id: true } }, ngoProfile: { select: { id: true } }, volunteerProfile: { select: { address: true } } },
  });
  const profileDone =
    user.role === 'DONOR' ? Boolean(profile?.donorProfile)
      : user.role === 'NGO' ? Boolean(profile?.ngoProfile)
        : Boolean(profile?.volunteerProfile?.address);
  const rejected = user.accountStatus === 'REJECTED';

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card>
        <CardContent className="p-8 text-center">
          {rejected ? <XCircle className="mx-auto h-12 w-12 text-rose-500" /> : <Hourglass className="mx-auto h-12 w-12 text-amber-500" />}
          <h1 className="mt-4 text-2xl font-bold" data-testid="account-status-heading">
            {rejected ? 'Application not approved' : 'Your account is awaiting approval'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {rejected
              ? 'A FoodBridge admin reviewed your application and did not approve it. Contact the FoodBridge team if you believe this is a mistake.'
              : 'A FoodBridge admin reviews every new donor, NGO and volunteer before they can coordinate food. You will get a notification as soon as you are approved.'}
          </p>
          {!rejected && (
            <div className="mt-6 rounded-lg bg-muted p-4 text-left text-sm">
              <p className="font-medium">{profileDone ? '✓ Your profile is complete.' : 'Next step: complete your profile'}</p>
              <p className="mt-1 text-muted-foreground">
                {profileDone
                  ? 'Admins can now review your details. You can still update them at any time.'
                  : 'Admins approve accounts faster when your organisation details and location are filled in.'}
              </p>
            </div>
          )}
          <div className="mt-6 flex justify-center gap-3">
            {!rejected && <Button asChild><Link href="/dashboard/profile">{profileDone ? 'View profile' : 'Complete profile'}</Link></Button>}
            <Button asChild variant="outline"><Link href="/dashboard/notifications">Notifications</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
