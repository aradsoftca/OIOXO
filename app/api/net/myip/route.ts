import { NextResponse } from 'next/server';
import net from 'net';
import { clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET → the caller's public IP, as seen by our server (read off the proxy
// headers Caddy forwards). No third-party API: the request itself carries it.
export async function GET(req: Request) {
  const ip = clientIp(req.headers);
  const family = net.isIP(ip); // 4, 6, or 0
  return NextResponse.json(
    {
      ip: ip === 'unknown' ? null : ip,
      family: family === 6 ? 'IPv6' : family === 4 ? 'IPv4' : null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
