'use client';
import { TextTool } from '@/components/tool/TextTool';
import { format } from 'sql-formatter';

const DIALECTS = ['sql', 'postgresql', 'mysql', 'sqlite', 'mariadb', 'bigquery', 'snowflake', 'redshift', 'spark', 'tsql', 'plsql'] as const;

export default function Tool() {
  return (
    <TextTool
      toolId="dev-sql-format"
      colorVar="--color-cat-dev"
      inputPlaceholder="Paste SQL to format…"
      transform={(s, o) => {
        if (!s.trim()) return '';
        try {
          // sql-formatter language type is a literal union; cast lazily.
          return format(s, {
            language: o.dialect as never,
            tabWidth: Number(o.indent) || 2,
            keywordCase: (o.upperCase ? 'upper' : 'preserve') as 'upper' | 'preserve',
          });
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }}
      controls={[
        {
          id: 'dialect', label: 'Dialect', type: 'select', defaultValue: 'sql',
          options: DIALECTS.map((d) => ({ value: d, label: d.toUpperCase() })),
        },
        { id: 'indent', label: 'Indent',         type: 'number', defaultValue: 2, min: 1, max: 8 },
        { id: 'upperCase', label: 'UPPERCASE keywords', type: 'toggle', defaultValue: true },
      ]}
    />
  );
}
