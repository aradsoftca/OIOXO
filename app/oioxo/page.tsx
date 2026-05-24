import * as React from 'react';
import type { Metadata } from 'next';
import OioxoShell from './OioxoShell';

export const metadata: Metadata = {
  title: 'oioxo — all-in-one AI',
  description:
    'oioxo runs AI on your device — chat, convert, edit, create. A tiny brain that conducts coding, image, and video skills you download, sized to your hardware.',
};

export default function OioxoPage() {
  return <OioxoShell />;
}
