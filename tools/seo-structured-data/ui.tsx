'use client';
import { TextTool } from '@/components/tool/TextTool';

export default function Tool() {
  return (
    <TextTool
      toolId="seo-structured-data"
      colorVar="--color-cat-seo"
      initialInput=" "
      transform={(_, o) => {
        const type = String(o.schemaType);
        const name = String(o.name ?? '');
        const url  = String(o.url ?? '');
        const description = String(o.description ?? '');
        const image = String(o.image ?? '');

        let obj: Record<string, unknown> = { '@context': 'https://schema.org', '@type': type, name, url, description };
        if (image) obj.image = image;

        if (type === 'Article' || type === 'BlogPosting') {
          obj = {
            '@context': 'https://schema.org',
            '@type': type,
            headline: name,
            description,
            image: image ? [image] : undefined,
            author: { '@type': 'Person', name: String(o.author ?? '') },
            datePublished: String(o.datePublished ?? new Date().toISOString().slice(0, 10)),
            mainEntityOfPage: url,
          };
        } else if (type === 'Product') {
          obj = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name,
            description,
            image: image ? [image] : undefined,
            brand: { '@type': 'Brand', name: String(o.brand ?? '') },
            offers: {
              '@type': 'Offer',
              price: String(o.price ?? '0'),
              priceCurrency: String(o.currency ?? 'USD'),
              availability: 'https://schema.org/InStock',
              url,
            },
          };
        } else if (type === 'Organization' || type === 'LocalBusiness') {
          obj = {
            '@context': 'https://schema.org',
            '@type': type,
            name,
            url,
            description,
            logo: image || undefined,
          };
        } else if (type === 'Person') {
          obj = {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name,
            url,
            description,
            image: image || undefined,
            jobTitle: String(o.jobTitle ?? ''),
          };
        } else if (type === 'FAQPage') {
          const faqs = String(o.faqs ?? '').split('\n').filter((l) => l.includes('|')).map((l) => {
            const [q, a] = l.split('|').map((x) => x.trim());
            return { '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } };
          });
          obj = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs };
        }

        return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
      }}
      controls={[
        {
          id: 'schemaType', label: 'Type', type: 'select', defaultValue: 'Organization',
          options: [
            { value: 'Organization',  label: 'Organization' },
            { value: 'LocalBusiness', label: 'Local Business' },
            { value: 'Person',        label: 'Person' },
            { value: 'Article',       label: 'Article' },
            { value: 'BlogPosting',   label: 'Blog Post' },
            { value: 'Product',       label: 'Product' },
            { value: 'FAQPage',       label: 'FAQ Page' },
          ],
        },
        { id: 'name',          label: 'Name / Headline', type: 'text', defaultValue: 'Acme Corp' },
        { id: 'url',           label: 'URL',             type: 'text', defaultValue: 'https://acme.example' },
        { id: 'description',   label: 'Description',     type: 'text', defaultValue: 'A short summary.' },
        { id: 'image',         label: 'Image URL',       type: 'text', defaultValue: '' },
        { id: 'author',        label: 'Author (Article)', type: 'text', defaultValue: '' },
        { id: 'datePublished', label: 'Published (Article)', type: 'text', defaultValue: new Date().toISOString().slice(0, 10) },
        { id: 'brand',         label: 'Brand (Product)', type: 'text', defaultValue: '' },
        { id: 'price',         label: 'Price (Product)', type: 'text', defaultValue: '' },
        { id: 'currency',      label: 'Currency (Product)', type: 'text', defaultValue: 'USD' },
        { id: 'jobTitle',      label: 'Job title (Person)', type: 'text', defaultValue: '' },
        { id: 'faqs',          label: 'FAQs — "Q | A" per line', type: 'text', defaultValue: 'Is it free? | Yes, free for personal use.' },
      ]}
    />
  );
}
