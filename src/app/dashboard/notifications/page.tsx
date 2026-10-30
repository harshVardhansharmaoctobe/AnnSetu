'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingCards, PageHeader, Pagination } from '@/components/states';
import { useToast } from '@/components/toaster';
import { api, useApi, toQuery, type ApiClientError, type ListResult } from '@/lib/client';
import { cn, formatDateTime } from '@/lib/utils';

interface Notification { id: string; title: string; message: string; link: string | null; isRead: boolean; createdAt: string }

export default function NotificationsPage() {
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<ListResult<Notification>>(`/api/notifications${toQuery({ unreadOnly, page })}`);

  async function markRead(body: { id: string } | { all: true }) {
    try {
      await api('/api/notifications/read', { body });
      window.dispatchEvent(new Event('notifications:changed'));
      reload();
    } catch (e) {
      toast.error('Could not update notifications', (e as ApiClientError).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => { setUnreadOnly((u) => !u); setPage(1); }}>{unreadOnly ? 'Show all' : 'Unread only'}</Button>
            <Button size="sm" onClick={() => markRead({ all: true })}><CheckCheck className="mr-2 h-4 w-4" /> Mark all as read</Button>
          </>
        }
      />
      {loading && !data ? <LoadingCards count={2} />
        : error ? <ErrorState message={error.message} onRetry={reload} />
          : data!.items.length === 0 ? <EmptyState icon={Bell} title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} />
            : (
              <ul className="divide-y rounded-xl border bg-white">
                {data!.items.map((n) => (
                  <li key={n.id} className={cn('flex gap-3 p-4', !n.isRead && 'bg-green-50/60')} data-testid="notification">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : 'bg-green-600')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{n.title}</p>
                      <p className="text-sm text-muted-foreground">{n.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {n.link && (
                        <Button asChild size="sm" variant="outline" onClick={() => !n.isRead && markRead({ id: n.id })}>
                          <Link href={n.link}>Open</Link>
                        </Button>
                      )}
                      {!n.isRead && <Button size="sm" variant="ghost" onClick={() => markRead({ id: n.id })}>Mark read</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
