import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdmin, logAudit } from '@/lib/admin';
import { sendEmail } from '@/lib/email/service';

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

  const response = body.response?.trim();
  const status = body.status && STATUS.includes(body.status) ? body.status : undefined;

  if (response) {
    try {
      await sendEmail({
        to: msg.email,
        subject: `Re: ${msg.subject} — Xonvert`,
        html: `<p>Hi ${msg.name},</p><div style="white-space:pre-wrap">${response}</div>`,
        text: `Hi ${msg.name},\n\n${response}`,
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
