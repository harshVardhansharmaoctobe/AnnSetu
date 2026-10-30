import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/health – liveness plus database connectivity; reveals no configuration details.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'up' });
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'down' }, { status: 503 });
  }
}
