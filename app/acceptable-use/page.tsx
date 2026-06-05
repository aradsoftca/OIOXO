import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell, H2, UL } from '@/components/legal/LegalShell';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy',
  description: `What you can and cannot do with ${BRAND}.`,
};

export default function AupPage() {
  return (
    <LegalShell title="Acceptable Use Policy" updated="May 28, 2026">
      <p>
        This Acceptable Use Policy supplements our{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/terms">Terms of Service</Link>. It
        applies to everyone using {BRAND}, free or Pro. Violations may result in suspension or termination of
        your account, removal of offending content where it&apos;s in our control, and referral to law
        enforcement where appropriate.
      </p>

      <H2>1. Don&apos;t process content you don&apos;t have the right to use</H2>
      <p>
        You may not use the Service on copyrighted material, trademarks, trade secrets, personal data, or
        other protected content without permission from the rights holder. You confirm you have all necessary
        rights for every file you process.
      </p>

      <H2>2. Forbidden content</H2>
      <UL>
        <li>Sexual or sexualised content involving minors, or content that could facilitate the abuse or exploitation of minors. We have zero tolerance and will report it to the appropriate authorities.</li>
        <li>Non-consensual intimate imagery, including any &ldquo;deepfake&rdquo; synthesis of real people in sexual contexts.</li>
        <li>Content that incites imminent violence, terrorism, or hatred against a person or group based on a protected characteristic.</li>
        <li>Doxxing, harassment, stalking, or invasions of privacy.</li>
        <li>Synthetic media designed to deceive in election or public-safety contexts.</li>
        <li>Malware, ransomware, phishing kits, credential stealers, or any other obviously malicious payload.</li>
      </UL>

      <H2>3. Don&apos;t abuse the Service</H2>
      <UL>
        <li>Do not bypass, defeat, or attempt to defeat usage limits, watermarks, license checks, or any other security or access-control feature.</li>
        <li>Do not scrape, mirror, repackage, deobfuscate, reverse-engineer, or redistribute the Service or any part of it. Do not use the Service to build or train a competing product.</li>
        <li>Do not run automated traffic at a rate that disrupts the Service or imposes unreasonable load. Headless or bot use of metered endpoints is prohibited without prior written agreement.</li>
        <li>Do not share Pro access across more accounts than you paid for. Don&apos;t resell access without written permission.</li>
        <li>Do not attempt to access accounts, data, or systems you don&apos;t own or have permission to test.</li>
      </UL>

      <H2>4. Don&apos;t weaponise the network tools</H2>
      <p>
        The Service includes diagnostic tools (DNS, WHOIS, port checks, IP lookup, speed test, etc.) intended
        for legitimate troubleshooting and education. You may use them only against systems you own or have
        explicit written permission to test. Using them to support attacks, mass scanning, or stalking is
        prohibited.
      </p>

      <H2>5. Live and peer-to-peer features</H2>
      <UL>
        <li>Calls, watch parties, and file transfers are direct peer-to-peer. You are responsible for what you share and for ensuring everyone in the session has agreed to recording (where you record).</li>
        <li>Do not use these features to harass, intimidate, or deceive recipients.</li>
        <li>Comply with applicable local recording-consent laws.</li>
      </UL>

      <H2>6. AI features</H2>
      <p>
        On-device AI tools (transcription, translation, image enhancement, etc.) produce best-effort
        estimates. Do not present AI output as factual without independent verification. Do not use these
        tools to generate material that falls into &ldquo;Forbidden content&rdquo; above.
      </p>

      <H2>7. Reporting abuse</H2>
      <p>
        If you see misuse of the Service, please report it through{' '}
        <Link className="text-[var(--brand-1)] hover:underline" href="/support">support</Link>. We investigate
        every credible report.
      </p>

      <H2>8. Enforcement</H2>
      <p>
        We may, at our discretion, warn, suspend, or terminate accounts that violate this Policy, with or
        without notice depending on severity. We may also preserve evidence for legal proceedings and
        cooperate with law enforcement where required.
      </p>
    </LegalShell>
  );
}
