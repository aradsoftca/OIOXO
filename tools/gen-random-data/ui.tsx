'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

const FIRST = ['Alex','Sam','Jordan','Taylor','Riley','Quinn','Avery','Casey','Morgan','Drew','Charlie','Emerson','Finley','Hayden','Jamie','Kai','Logan','Parker','Reese','Skyler','Brooks','Cameron','Dakota','Elliot','Hunter','Isla','Jules','Lane','Marley','Noa','Phoenix','Rowan','Sage','Tatum','Wren','Zion','Adrian','Bailey','Cory','Devon'];
const LAST = ['Anderson','Bell','Carter','Davis','Evans','Foster','Garcia','Hayes','Iverson','Jackson','Knight','Lopez','Martinez','Nguyen','Owens','Patel','Quinn','Ramirez','Singh','Taylor','Underwood','Vasquez','Walker','Xiong','Young','Zhang','Brooks','Cooper','Diaz','Edwards','Fisher','Greene','Howard','Ito','James','Kim','Lewis','Moore','Nelson','Okafor'];
const CITIES = ['Boulder','Brooklyn','Lisbon','Reykjavik','Kyoto','Cape Town','Helsinki','Berlin','Porto','Vancouver','Bangalore','Mexico City','Buenos Aires','Edinburgh','Dublin','Marrakech','Wellington','Hanoi','Tallinn','Tbilisi'];
const COUNTRIES = ['United States','Canada','United Kingdom','Germany','France','Spain','Portugal','Iceland','Japan','South Korea','Brazil','Argentina','Australia','New Zealand','Finland','Sweden','Norway','Netherlands','Mexico','India'];
const COMPANIES = ['North Loop','Polar Forge','Cedar Atlas','Iron Heron','Mist Atelier','Field Notes','Bright Anchor','Open Forest','Soft Granite','Quiet Cobalt','Linen Studio','Slow Cartograph','River Index','Plain Theory','Hexagon Field','Stone Lantern','Light Library','True Branch','Common Object','Wide Channel'];
const DOMAINS = ['example.com','mailbox.net','draftbox.io','letters.app','outpost.dev','quicknotes.org','sendmark.io','penlist.app','onelane.net','quietmail.com'];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(lo: number, hi: number): number { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

function person(): Record<string, string> {
  const first = rand(FIRST), last = rand(LAST);
  return {
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@${rand(DOMAINS)}`,
    phone: `+1-${randInt(200, 999)}-${randInt(200, 999)}-${randInt(1000, 9999)}`,
    city: rand(CITIES),
    country: rand(COUNTRIES),
    company: rand(COMPANIES),
    age: String(randInt(20, 75)),
  };
}

const FIELDS: Array<{ id: keyof ReturnType<typeof person>; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'city', label: 'City' },
  { id: 'country', label: 'Country' },
  { id: 'company', label: 'Company' },
  { id: 'age', label: 'Age' },
];

export default function Tool() {
  const [nonce, setNonce] = React.useState(0);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
        >
          Generate again
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="gen-random-data"
        colorVar="--color-cat-generator"
        initialInput=" "
        transform={(_, o) => {
          const count = Math.max(1, Math.min(500, Number(o.count) || 10));
          const format = String(o.format);
          const fields = FIELDS.filter((f) => o[f.id] !== false);
          const rows = Array.from({ length: count }, () => {
            const p = person();
            const obj: Record<string, string> = {};
            for (const f of fields) obj[f.id] = p[f.id];
            return obj;
          });
          if (format === 'csv') {
            const head = fields.map((f) => f.id).join(',');
            const body = rows.map((r) => fields.map((f) => JSON.stringify(r[f.id])).join(',')).join('\n');
            return head + '\n' + body;
          }
          if (format === 'sql') {
            const cols = fields.map((f) => f.id).join(', ');
            return rows.map((r) =>
              `INSERT INTO people (${cols}) VALUES (${fields.map((f) => `'${r[f.id].replace(/'/g, "''")}'`).join(', ')});`,
            ).join('\n');
          }
          return JSON.stringify(rows, null, 2);
        }}
        controls={[
          { id: 'count',  label: 'Count', type: 'number', defaultValue: 10, min: 1, max: 500 },
          {
            id: 'format', label: 'Format', type: 'select', defaultValue: 'json',
            options: [
              { value: 'json', label: 'JSON' },
              { value: 'csv',  label: 'CSV' },
              { value: 'sql',  label: 'SQL inserts' },
            ],
          },
          ...FIELDS.map((f) => ({ id: f.id, label: f.label, type: 'toggle' as const, defaultValue: true })),
        ]}
      />
    </div>
  );
}
