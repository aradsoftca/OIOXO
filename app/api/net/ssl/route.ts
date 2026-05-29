import { NextResponse } from 'next/server';
import tls from 'tls';
import { validHost, validPort, resolvePublic, rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';

// POST { host, port? } → TLS certificate details (read-only handshake).
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
    return NextResponse.json({ error: 'Enter a valid hostname and port.' }, { status: 400 });
  }

  let addr: string;
  try { addr = await resolvePublic(host); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

  try {
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      // Hard connect timeout — `tls.connect`'s `timeout` option only fires on
      // INACTIVITY after the connection succeeds, so a dead/unreachable host
      // would otherwise wait for the kernel TCP timeout (~60-75s) and tie up
      // server resources past the request deadline.
      let settled = false;
      const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
      const connectTimer = setTimeout(() => {
        settle(() => { try { socket.destroy(); } catch { /* */ } reject(new Error('TLS connect timed out.')); });
      }, 8000);
      const socket = tls.connect(
        { host: addr, servername: host, port, rejectUnauthorized: false, timeout: 8000 },
        () => {
          clearTimeout(connectTimer);
          const c = socket.getPeerCertificate(true) as tls.DetailedPeerCertificate;
          const chain: string[] = [];
          let cur: tls.DetailedPeerCertificate | undefined = c;
          const seen = new Set<string>();
          while (cur && cur.fingerprint256 && !seen.has(cur.fingerprint256)) {
            seen.add(cur.fingerprint256);
            chain.push(String(cur.issuer?.O || cur.issuer?.CN || 'Unknown'));
            cur = cur.issuerCertificate;
          }
          const validTo = new Date(c.valid_to);
          const daysLeft = Math.round((validTo.getTime() - Date.now()) / 86400000);
          settle(() => resolve({
            host, port,
            authorized: socket.authorized,
            authError: socket.authorizationError ? String(socket.authorizationError) : null,
            protocol: socket.getProtocol(),
            subject: c.subject?.CN || host,
            issuer: c.issuer?.O || c.issuer?.CN || 'Unknown',
            validFrom: c.valid_from,
            validTo: c.valid_to,
            daysRemaining: daysLeft,
            expired: daysLeft < 0,
            san: c.subjectaltname?.replace(/DNS:/g, '').split(', ') ?? [],
            serialNumber: c.serialNumber,
            fingerprint256: c.fingerprint256,
            chain,
          }));
          socket.end();
        },
      );
      socket.on('timeout', () => settle(() => { socket.destroy(); reject(new Error('Connection timed out — no TLS service on that port?')); }));
      socket.on('error', (e) => settle(() => { clearTimeout(connectTimer); reject(e); }));
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'TLS connection failed' }, { status: 502 });
  }
}
