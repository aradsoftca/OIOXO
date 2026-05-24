'use client';
/**
 * oioxo licensing — React hook over entitlement-client. Components read
 * `{ tier, pro, has, loading }` to unlock Pro UI (bigger models, search, sync).
 * Cosmetic gating only; the real lock is the server withholding the content key.
 */
import * as React from 'react';
import { getEntitlement, isPro, type Entitlement } from './entitlement-client';
import { isUsable } from './entitlement';
import { deviceId } from './entitlement-client';

export function useEntitlement() {
  const [ent, setEnt] = React.useState<Entitlement | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let on = true;
    getEntitlement().then((e) => { if (on) { setEnt(e); setLoading(false); } }).catch(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  const has = React.useCallback(
    (feature: string) => isUsable(ent?.claims, { device: deviceId(), feature }).ok,
    [ent],
  );

  return { tier: ent?.tier ?? 'free', pro: isPro(ent), has, loading, entitlement: ent };
}
