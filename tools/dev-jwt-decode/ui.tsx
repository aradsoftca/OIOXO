'use client';
import { TextTool } from '@/components/tool/TextTool';
import { decodeJwt } from '@/engines/dev/jwt';

export default function Tool() {
  return (
    <TextTool
      toolId="dev-jwt-decode"
      colorVar="--color-cat-dev"
      inputPlaceholder="Paste a JWT (header.payload.signature)…"
      transform={(s) => {
        if (!s.trim()) return '';
        try {
          const { header, payload, signature } = decodeJwt(s);
          const expNote = typeof payload.exp === 'number'
            ? `\n# exp = ${new Date(payload.exp * 1000).toISOString()}` : '';
          const iatNote = typeof payload.iat === 'number'
            ? `\n# iat = ${new Date(payload.iat * 1000).toISOString()}` : '';
          return [
            '── Header ──',
            JSON.stringify(header, null, 2),
            '',
            '── Payload ──' + iatNote + expNote,
            JSON.stringify(payload, null, 2),
            '',
            '── Signature ──',
            signature,
          ].join('\n');
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }}
    />
  );
}
