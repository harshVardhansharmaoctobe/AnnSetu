import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, Hourglass, XCircle } from 'lucide-react';
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

  const steps = [
    { label: 'Account created', detail: 'You can sign in and edit your details.', state: 'done' as const },
    {
      label: 'Profile and location',
      detail: profileDone ? 'Complete – admins can review your details.' : 'Add your organisation details and address so admins can verify you.',
      state: profileDone ? ('done' as const) : ('current' as const),
    },
    {
      label: 'Admin verification',
      detail: rejected ? 'Not approved. Contact the FoodBridge team if you think this is a mistake.' : 'A FoodBridge admin checks every new account. You will be notified when it is done.',
      state: rejected ? ('failed' as const) : profileDone ? ('current' as const) : ('todo' as const),
    },
    { label: 'Start rescuing food', detail: 'Your dashboard unlocks as soon as you are approved.', state: 'todo' as const },
  ];

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Card className="overflow-hidden">
        <div className={rejected ? 'bg-rose-50 px-8 py-6' : 'bg-green-50 px-8 py-6'}>
          {rejected ? <XCircle className="h-10 w-10 text-rose-500" /> : <Hourglass className="h-10 w-10 text-green-700" />}
          <h1 className="mt-3 text-2xl font-bold" data-testid="account-status-heading">
            {rejected ? 'Application not approved' : 'Your account is awaiting approval'}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {rejected
              ? 'A FoodBridge admin reviewed your application and did not approve it.'
              : 'Thanks for joining FoodBridge. Every donor, NGO and volunteer is verified before they can coordinate food.'}
          </p>
        </div>
        <CardContent className="p-8">
          <ol className="space-y-5" aria-label="Approval progress">
            {steps.map((step, i) => (
              <li key={step.label} className="flex gap-4" aria-current={step.state === 'current' ? 'step' : undefined}>
                <span
                  className={
                    step.state === 'done' ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white'
                      : step.state === 'current' ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-green-600 font-semibold text-green-700'
                        : step.state === 'failed' ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white'
                          : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted text-sm text-muted-foreground'
                  }
                >
                  {step.state === 'done' ? <Check className="h-4 w-4" /> : step.state === 'failed' ? <XCircle className="h-4 w-4" /> : i + 1}
                </span>
                <div>
                  <p className="font-medium">{step.label}</p>
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            {!rejected && <Button asChild><Link href="/dashboard/profile">{profileDone ? 'View profile' : 'Complete profile'}</Link></Button>}
            <Button asChild variant="outline"><Link href="/dashboard/notifications">Notifications</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
