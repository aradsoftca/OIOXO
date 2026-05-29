import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin, logAudit } from '@/lib/admin';
import { sendEmail } from '@/lib/email/service';
import { BRAND } from '@/lib/brand';

export const runtime = 'nodejs';

const STATUS = ['UNREAD', 'READ', 'IN_PROGRESS', 'RESPONDED', 'CLOSED', 'SPAM'];

// POST /api/admin/contact/[id] — set status and/or email a response.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;

  let body: { status?: string; response?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const msg = await prisma.contactMessage.findUnique({ where: { id } });
  if (!msg) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Cap the admin response at 50KB. Without this, a buggy admin UI or a
  // compromised admin account could ship a multi-MB body that lands in the
  // DB row and gets echoed into the customer's email.
  const rawResponse = body.response?.trim();
  const response = rawResponse && rawResponse.length > 50_000 ? rawResponse.slice(0, 50_000) : rawResponse;
  const status = body.status && STATUS.includes(body.status) ? body.status : undefined;

  if (response) {
    try {
      // HTML-escape user-controlled fields and strip newlines from header-style
      // values to defeat HTML injection / email header injection. The previous
      // version interpolated `msg.name` and `msg.subject` (from the contact
      // form, ultimately user-controlled) and the admin's `response` raw into
      // the HTML body — admin typing or migrated data could ship a phishing
      // payload, and a CR/LF in the subject would inject email headers.
      const esc = (s: string) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 200);
      // Migrated records (France import) predate the comma-email tightening
      // in Pass 91, so `msg.email` could still be a multi-recipient string
      // like "a@evil.com,b@victim.com". Take only the first address before
      // anything past `,` or `;` — same defense as the support flow.
      const safeTo = msg.email.split(/[,;]/)[0].trim();
      await sendEmail({
        to: safeTo,
        subject: `Re: ${oneLine(msg.subject)} — ${BRAND}`,
        html: `<p>Hi ${esc(msg.name)},</p><div style="white-space:pre-wrap">${esc(response)}</div>`,
        text: `Hi ${oneLine(msg.name)},\n\n${response}`,
        type: 'TRANSACTIONAL',
      });
    } catch { /* don't fail on email error */ }
  }

  await prisma.contactMessage.update({
    where: { id },
    data: {
      status: (status as never) ?? (response ? ('RESPONDED' as never) : undefined),
      ...(response
        ? { response, respondedAt: new Date(), respondedBy: admin.email ?? admin.id }
        : {}),
    },
  });
  await logAudit(admin, 'contact.update', 'ContactMessage', id, { status, responded: !!response });

  return NextResponse.json({ success: true });
}
