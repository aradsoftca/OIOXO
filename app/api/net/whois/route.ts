import { NextResponse } from 'next/server';
import net from 'net';
import { validHost, resolvePublic, rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';

const IANA = 'whois.iana.org';
const PORT = 43;

// One raw WHOIS query over TCP/43. We resolve+guard the server first (SSRF),
// send "<query>\r\n", and read the whole text reply until the server closes.
function whois(server: string, query: string, timeout = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    resolvePublic(server).then((addr) => {
      const s = new net.Socket();
      let data = '';
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        s.destroy();
        if (err) reject(err); else resolve(data);
      };
      s.setTimeout(timeout);
      s.once('connect', () => s.write(`${query}\r\n`));
      s.on('data', (b) => { data += b.toString('utf8'); if (data.length > 200_000) finish(); });
      s.once('end', () => finish());
      s.once('timeout', () => finish(new Error('WHOIS server timed out.')));
      s.once('error', (e) => finish(e));
      s.connect(PORT, addr);
    }).catch(reject);
  });
}

const first = (re: RegExp, text: string): string => text.match(re)?.[1]?.trim() ?? '';
const all = (re: RegExp, text: string): string[] => {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].trim());
  return [...new Set(out)];
};

function parse(text: string) {
  return {
    registrar: first(/Registrar:\s*(.+)/i, text) || first(/Sponsoring Registrar:\s*(.+)/i, text) || '—',
    created:   first(/(?:Creation Date|Created On|Created|Domain Registration Date|Registered on|registered):\s*(.+)/i, text),
    expires:   first(/(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiration Date|Expiry Date|Expires On|paid-till):\s*(.+)/i, text),
    updated:   first(/(?:Updated Date|Last Modified|Last Updated On|changed):\s*(.+)/i, text),
    nameservers: all(/(?:Name Server|nserver|Nameservers?):\s*([^\s]+)/ig, text).map((n) => n.toLowerCase()),
    status:    all(/(?:Domain Status|status):\s*([^\s]+)/ig, text),
  };
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers), 20)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }

  let domain = '';
  try {
    const b = await req.json();
    domain = String(b.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!validHost(domain) || !domain.includes('.')) {
    return NextResponse.json({ error: 'Enter a valid domain name.' }, { status: 400 });
  }

  try {
    const tld = domain.split('.').pop()!;
    // 1) Ask IANA which registry runs WHOIS for this TLD.
    const ianaText = await whois(IANA, tld);
    const registryServer = first(/whois:\s*(.+)/i, ianaText);
    if (!registryServer) {
      return NextResponse.json({ error: `No WHOIS server published for .${tld} domains.` }, { status: 404 });
    }

    // 2) Query the registry. 3) Follow one referral for "thick" gTLD data.
    let text = await whois(registryServer, domain);
    const refer = first(/Registrar WHOIS Server:\s*(.+)/i, text);
    if (refer && refer.toLowerCase() !== registryServer.toLowerCase()) {
      try {
        const reg = await whois(refer.trim(), domain);
        if (reg && reg.length > 50) text = reg;
      } catch { /* keep registry answer */ }
    }

    if (/no match|not found|no entries found|no data found/i.test(text) && !/Registrar:/i.test(text)) {
      return NextResponse.json({ error: 'Domain not found, or its registry hides this data.' }, { status: 404 });
    }

    return NextResponse.json({ domain, server: registryServer, ...parse(text), raw: text.slice(0, 20_000) });
  } catch {
    return NextResponse.json({ error: 'WHOIS lookup failed.' }, { status: 502 });
  }
}
