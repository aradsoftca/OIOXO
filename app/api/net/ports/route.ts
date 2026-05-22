import { NextResponse } from 'next/server';
import net from 'net';
import { validHost, validPort, resolvePublic, rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';

// POST { host, ports?: number[] } → which of up to 10 ports accept TCP. This is
// a connectivity CHECKER (small fixed/user list, single host), not a scanner.
const COMMON = [21, 22, 25, 53, 80, 110, 143, 443, 3306, 3389, 5432, 6379, 8080, 8443];

function check(addr: string, port: number, timeout = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (open: boolean) => { if (!done) { done = true; s.destroy(); resolve(open); } };
    s.setTimeout(timeout);
    s.once('connect', () => finish(true));
    s.once('timeout', () => finish(false));
    s.once('error', () => finish(false));
    s.connect(port, addr);
  });
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers))) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  let host = '';
  let ports: number[] = [];
  try {
    const b = await req.json();
    host = String(b.host || '').trim().replace(/^https?:\/\//, '').split('/')[0];
    if (Array.isArray(b.ports)) ports = b.ports.map(Number).filter(validPort);
  } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  if (!validHost(host)) return NextResponse.json({ error: 'Enter a valid hostname or IP.' }, { status: 400 });
  if (!ports.length) ports = COMMON;
  ports = Array.from(new Set(ports)).slice(0, 10); // cap to keep it a checker, not a scanner

  let addr: string;
  try { addr = await resolvePublic(host); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

  const results = await Promise.all(ports.map(async (p) => ({ port: p, open: await check(addr, p) })));
  return NextResponse.json({ host, results: results.sort((a, b) => a.port - b.port) });
}
