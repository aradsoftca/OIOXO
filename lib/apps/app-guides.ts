/**
 * Plain-language explanation for each full-screen app (/send, /chat, ...).
 * Visitors landed straight in a live room ("Connecting…", a room code, a QR)
 * with nothing saying what the app is or what to do, and the server-rendered
 * HTML was an empty <main>, so Google saw a blank page too.
 *
 * Free/Pro numbers are NOT typed here: AppGuide reads them from lib/limits/policy.ts.
 */
import type { RichFaq } from '@/lib/seo/content';

export interface AppGuide {
  /** Policy key in lib/limits/policy.ts, when the app has limits. */
  policyKey?: string;
  name: string;
  /** One sentence: what it is, in everyday words. */
  what: string;
  /** Three short steps shown ABOVE the app. */
  steps: [string, string, string];
  goodFor: string[];
  /** A longer paragraph for the section below the app. */
  how: string;
  faq: RichFaq[];
}

const P2P =
  'The two browsers connect directly to each other (WebRTC). Our server only helps them find each other; the content itself never passes through it and is never stored.';

export const APP_GUIDES: Record<string, AppGuide> = {
  send: {
    policyKey: 'send',
    name: 'Send',
    what: 'Move files from one device to another — phone to laptop, you to a friend — without uploading them anywhere.',
    steps: ['Drop the files you want to send.', 'Open the link or scan the QR code on the other device.', 'The files download there. Keep both pages open until it finishes.'],
    goodFor: ['Getting photos off a phone without a cable or cloud account', 'Sending a big video to a friend', 'Moving files between two computers on different networks'],
    how: `${P2P} Because nothing is uploaded first, the transfer starts straight away and the file is never sitting on someone else's server.`,
    faq: [
      { q: 'Does the other person need an account or an app?', a: 'No. They only open the link in a normal browser — on a phone, tablet or computer.' },
      { q: 'Do both devices need to be on the same Wi-Fi?', a: 'No. They can be anywhere, but both pages must stay open while the files move.' },
      { q: 'What if the transfer will not start?', a: 'A VPN or a privacy/ad-block extension can block direct connections. Try a private window, another browser, or the same Wi-Fi.' },
    ],
  },
  chat: {
    policyKey: 'chat',
    name: 'Private Chat',
    what: 'A private chat room you create with one click and share with a link — no sign-up, no phone number.',
    steps: ['Type your name — the room is already created for you.', 'Copy the link (or show the QR code) and send it to the people you want.', 'Chat, send photos, files and voice notes as soon as they join.'],
    goodFor: ['A quick private conversation without swapping phone numbers', 'Sharing files and notes with a small group', 'Talking with someone who does not use your messaging app'],
    how: `${P2P} Messages go device to device, so there is no chat history on our side to leak. "Connecting…" at the top just means you are waiting for someone to open your link.`,
    faq: [
      { q: 'Why does it say "Connecting…"?', a: 'You are the only one in the room. It changes as soon as someone opens your invite link.' },
      { q: 'Can I come back to the same room later?', a: 'Yes — open the same link again. Everyone in the room must be online at the same time to exchange messages.' },
      { q: 'Who can join?', a: 'Anyone who has the link, so share it only with the people you want in the room.' },
    ],
  },
  call: {
    policyKey: 'call',
    name: 'Video Call',
    what: 'A video call you start from your browser and share with a link — no account, no app to install.',
    steps: ['Allow your camera and microphone, then type your name.', 'Copy the invite link (or show the QR code) and send it to the other person.', 'Press Start call — they join from the link in any browser.'],
    goodFor: ['A quick call with someone who does not have Zoom, Teams or WhatsApp', 'Talking privately without an account anywhere', 'Calling from a computer you do not own'],
    how: `${P2P} Video and sound go straight between the people in the call. You can blur your background and turn on live captions.`,
    faq: [
      { q: 'It says no camera or microphone was found.', a: 'Plug one in and press Retry, or allow access when the browser asks. You can also join with no camera just to listen.' },
      { q: 'Does the other person need to install anything?', a: 'No. They open your link in Chrome, Safari, Edge or Firefox, on a phone or a computer.' },
      { q: 'What if the call does not connect?', a: 'A VPN or a strict company network can block direct connections. Try another network or a private window.' },
    ],
  },
  board: {
    name: 'Whiteboard',
    what: 'A shared drawing board: everyone who opens the link draws on the same page, live.',
    steps: ['Start drawing — pick a colour and brush size on the left.', 'Copy the invite link and send it to the people you want to draw with.', 'Their strokes appear on your board as they draw.'],
    goodFor: ['Sketching an idea while you talk on a call', 'Explaining something with a quick diagram', 'Playing drawing games with friends'],
    how: `${P2P} You can draw before anyone joins; your strokes sync when they connect.`,
    faq: [
      { q: 'Is my drawing saved?', a: 'The board lives in the open browser tabs. Export or screenshot anything you want to keep before everyone leaves.' },
      { q: 'Can I undo?', a: 'Yes — Ctrl+Z undoes your own last stroke and Shift+Z redoes it.' },
    ],
  },
  clipboard: {
    name: 'Universal Clipboard',
    what: 'Copy text or a link on one device and paste it on another — for example from your phone to your laptop.',
    steps: ['Open this page on the first device.', 'Open the link (or scan the QR code) on your other device.', 'Paste text on one and press Send — it appears on the other.'],
    goodFor: ['Getting a long link or code from your phone onto your computer', 'Moving a password or address between devices without emailing yourself'],
    how: `${P2P} Keep both tabs open while you use it.`,
    faq: [
      { q: 'It says "Couldn’t connect".', a: 'A VPN or a privacy/ad-block extension may be blocking direct connections. Try a private window, another browser, or put both devices on the same Wi-Fi.' },
      { q: 'Is the text stored anywhere?', a: 'No. It goes straight to your other device and is gone when you close the tabs.' },
    ],
  },
  note: {
    name: 'Encrypted Note',
    what: 'Share a password or secret with a link that can only be read once (or until it expires).',
    steps: ['Write your note.', 'Choose "Burn after reading" or an expiry time, then create the link.', 'Send the link. Once it is read (or expires), the note is gone.'],
    goodFor: ['Sending a password or Wi-Fi key without it staying in your chat history', 'Sharing a private address or account number once'],
    how: 'The note is encrypted in your browser before it is saved. The key is part of the link after the "#", which browsers never send to a server — so we store only scrambled text we cannot read.',
    faq: [
      { q: 'What happens if I lose the link?', a: 'The note cannot be recovered — not even by us. That is what keeps it private.' },
      { q: 'Can someone read it before my recipient?', a: 'Anyone with the full link can open it. With "Burn after reading", your recipient will see an error if someone already did — so you know.' },
    ],
  },
  watch: {
    policyKey: 'watch',
    name: 'Live Screen Share',
    what: 'Show your screen, a video file or your camera live to other people with a link.',
    steps: ['Pick what to share: your Screen, a Video file or your Camera.', 'Copy the watch link (or show the QR code) and send it to your viewers.', 'They watch live in their browser and can chat and react.'],
    goodFor: ['Showing someone a problem on your computer', 'Watching a video together from different places', 'A quick presentation with no meeting app'],
    how: `${P2P} Video, sound, chat and reactions all stream straight from you to your viewers.`,
    faq: [
      { q: 'Do viewers need an account or an app?', a: 'No. They open the link in any modern browser.' },
      { q: 'Why is the chat empty?', a: 'Chat starts once you start sharing and a viewer has joined.' },
    ],
  },
};
