import { LoadingCards, Skeleton } from '@/components/states';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <LoadingCards count={3} />
    </div>
  );
}
