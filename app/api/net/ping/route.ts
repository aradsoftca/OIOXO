import { NextResponse } from 'next/server';
import net from 'net';
import { validHost, validPort, resolvePublic, rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';

// POST { host, port? } → TCP-connect latency (browser-safe "ping"). ICMP needs
// raw sockets/root and is widely blocked; TCP latency to a port is reliable.
function timeConnect(addr: string, port: number, timeout = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const start = process.hrtime.bigint();
    let done = false;
    const finish = (ms: number | null) => { if (!done) { done = true; s.destroy(); resolve(ms); } };
    s.setTimeout(timeout);
    s.once('connect', () => finish(Number(process.hrtime.bigint() - start) / 1e6));
    s.once('timeout', () => finish(null));
    s.once('error', () => finish(null));
    s.connect(port, addr);
  });
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers))) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  let host = '', port = 443;
  try {
    const b = await req.json();
    host = String(b.host || '').trim().replace(/^https?:\/\//, '').split('/')[0];
    if (b.port) port = Number(b.port);
  } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  if (!validHost(host) || !validPort(port)) {
    return NextResponse.json({ error: 'Enter a valid host and port.' }, { status: 400 });
  }

  let addr: string;
  try { addr = await resolvePublic(host); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

  const samples: (number | null)[] = [];
  for (let i = 0; i < 4; i++) samples.push(await timeConnect(addr, port));
  const ok = samples.filter((s): s is number => s != null);
  return NextResponse.json({
    host, addr, port,
    samples: samples.map((s) => (s == null ? null : Math.round(s * 10) / 10)),
    min: ok.length ? Math.round(Math.min(...ok) * 10) / 10 : null,
    avg: ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10 : null,
    max: ok.length ? Math.round(Math.max(...ok) * 10) / 10 : null,
    loss: Math.round(((samples.length - ok.length) / samples.length) * 100),
  });
}
