'use client';

import * as React from 'react';
import { makeRoomCode } from './peer';

/**
 * Client-only room code for P2P apps (chat / send / call / board / clipboard /
 * watch). Generating a random code in a `useState(() => makeRoomCode())`
 * initializer also runs during SSR, producing a value the client can't
 * reproduce → React hydration mismatch (the dev "1 issue" overlay and a visible
 * flash on first paint). This returns `''` on the server and first client
 * render (so SSR and hydration agree), then mints/keeps a stable code on the
 * client.
 *
 * @param joinCode  the `?r=` code when joining someone else's room (deterministic)
 * @param gen       optional custom generator (defaults to makeRoomCode)
 */
export function useRoomCode(joinCode: string | null | undefined, gen: () => string = makeRoomCode): string {
  const [room, setRoom] = React.useState(() => joinCode || '');
  React.useEffect(() => {
    if (joinCode) { setRoom(joinCode); return; }
    setRoom((r) => r || gen());
    // gen is intentionally not a dep — we only ever mint once when hosting.
  }, [joinCode]); // eslint-disable-line react-hooks/exhaustive-deps
  return room;
}
