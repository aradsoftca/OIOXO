export type SmartArtLayout = 'process' | 'cycle' | 'hierarchy' | 'list-vertical' | 'list-horizontal' | 'venn' | 'pyramid';

export interface SmartArtNode {
  text: string;
  level: number;
  children?: SmartArtNode[];
}

export interface SmartArtSpec {
  layout: SmartArtLayout;
  nodes: SmartArtNode[];
  width: number;
  height: number;
  accent: string;
  textColor: string;
  fontFamily?: string;
}

export function parseBulletsToNodes(text: string): SmartArtNode[] {
  const lines = text.split('\n').map(l => l.replace(/\r/g, '')).filter(l => l.trim());
  const nodes: SmartArtNode[] = [];
  const stack: SmartArtNode[][] = [nodes];
  for (const line of lines) {
    const indent = (line.match(/^[\t ]*/)?.[0].length ?? 0) / 2;
    const text = line.replace(/^[\t ]*[-•*]?\s*/, '').trim();
    if (!text) continue;
    while (stack.length > indent + 1) stack.pop();
    const node: SmartArtNode = { text, level: stack.length - 1 };
    stack[stack.length - 1].push(node);
    node.children = [];
    stack.push(node.children);
  }
  cleanEmpty(nodes);
  return nodes;
}

function cleanEmpty(nodes: SmartArtNode[]) {
  for (const n of nodes) {
    if (n.children) {
      cleanEmpty(n.children);
      if (n.children.length === 0) delete n.children;
    }
  }
}

export function renderSmartArtSvg(spec: SmartArtSpec): string {
  switch (spec.layout) {
    case 'process':          return renderProcess(spec);
    case 'cycle':            return renderCycle(spec);
    case 'hierarchy':        return renderHierarchy(spec);
    case 'list-vertical':    return renderListVertical(spec);
    case 'list-horizontal':  return renderListHorizontal(spec);
    case 'venn':             return renderVenn(spec);
    case 'pyramid':          return renderPyramid(spec);
  }
}

function flatten(nodes: SmartArtNode[]): SmartArtNode[] {
  return nodes;
}

function shape(spec: SmartArtSpec, x: number, y: number, w: number, h: number, text: string, opts: { rx?: number; bgOpacity?: number } = {}): string {
  const r = opts.rx ?? 8;
  const op = opts.bgOpacity ?? 1;
  const lines = wrapText(text, w - 16, 14);
  const lh = 16;
  const textBlock = lines.map((ln, i) => {
    const ty = y + h / 2 - (lines.length - 1) * lh / 2 + i * lh + 5;
    return `<text x="${x + w / 2}" y="${ty}" font-family="${spec.fontFamily ?? 'system-ui'}" font-size="13" font-weight="600" fill="${spec.textColor}" text-anchor="middle">${escapeXml(ln)}</text>`;
  }).join('');
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${spec.accent}" fill-opacity="${op}" stroke="${spec.accent}" stroke-width="2" />${textBlock}`;
}

function arrow(spec: SmartArtSpec, x1: number, y1: number, x2: number, y2: number): string {
  const headSize = 8;
  return `<line x1="${x1}" y1="${y1}" x2="${x2 - headSize}" y2="${y2}" stroke="${spec.accent}" stroke-width="3" stroke-linecap="round" />
          <polygon points="${x2},${y2} ${x2 - headSize},${y2 - headSize / 2} ${x2 - headSize},${y2 + headSize / 2}" fill="${spec.accent}" />`;
}

function renderProcess(spec: SmartArtSpec): string {
  const nodes = flatten(spec.nodes);
  if (!nodes.length) return '';
  const padding = 20;
  const gap = 28;
  const boxH = 60;
  const totalGapW = (nodes.length - 1) * gap;
  const boxW = (spec.width - padding * 2 - totalGapW) / nodes.length;
  let svg = '';
  let x = padding;
  const y = (spec.height - boxH) / 2;
  for (let i = 0; i < nodes.length; i++) {
    svg += shape(spec, x, y, boxW, boxH, nodes[i].text);
    if (i < nodes.length - 1) {
      svg += arrow(spec, x + boxW, y + boxH / 2, x + boxW + gap, y + boxH / 2);
    }
    x += boxW + gap;
  }
  return svg;
}

function renderCycle(spec: SmartArtSpec): string {
  const nodes = flatten(spec.nodes);
  if (!nodes.length) return '';
  const cx = spec.width / 2;
  const cy = spec.height / 2;
  const radius = Math.min(spec.width, spec.height) / 2 - 60;
  const boxW = 110;
  const boxH = 50;
  let svg = '';
  for (let i = 0; i < nodes.length; i++) {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius - boxW / 2;
    const y = cy + Math.sin(angle) * radius - boxH / 2;
    svg += shape(spec, x, y, boxW, boxH, nodes[i].text);
    const nextAngle = ((i + 1) / nodes.length) * Math.PI * 2 - Math.PI / 2;
    const aw = boxW / 2 + 8;
    const ah = boxH / 2 + 8;
    const ax2 = cx + Math.cos(nextAngle) * (radius - 5) - Math.cos(nextAngle) * aw;
    const ay2 = cy + Math.sin(nextAngle) * (radius - 5) - Math.sin(nextAngle) * ah;
    const ax1 = cx + Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * boxH * 0.3;
    const ay1 = cy + Math.sin(angle) * radius + Math.sin(angle + Math.PI / 2) * boxH * 0.3;
    svg += `<path d="M ${ax1} ${ay1} Q ${cx} ${cy} ${ax2} ${ay2}" fill="none" stroke="${spec.accent}" stroke-width="2" stroke-dasharray="4 3" />`;
  }
  return svg;
}

function renderHierarchy(spec: SmartArtSpec): string {
  if (!spec.nodes.length) return '';
  const padding = 20;
  const lh = 70;
  const root = spec.nodes[0];
  const children = root.children ?? [];
  const boxW = 140;
  const boxH = 50;
  let svg = '';
  const rootX = (spec.width - boxW) / 2;
  const rootY = padding;
  svg += shape(spec, rootX, rootY, boxW, boxH, root.text);
  if (children.length > 0) {
    const totalW = children.length * boxW + (children.length - 1) * 16;
    let cx = (spec.width - totalW) / 2;
    const cy = rootY + boxH + lh;
    for (const child of children) {
      svg += shape(spec, cx, cy, boxW, boxH, child.text, { bgOpacity: 0.7 });
      svg += `<line x1="${rootX + boxW / 2}" y1="${rootY + boxH}" x2="${cx + boxW / 2}" y2="${cy}" stroke="${spec.accent}" stroke-width="2" />`;
      cx += boxW + 16;
    }
  }
  return svg;
}

function renderListVertical(spec: SmartArtSpec): string {
  const nodes = flatten(spec.nodes);
  if (!nodes.length) return '';
  const padding = 20;
  const gap = 12;
  const boxH = (spec.height - padding * 2 - gap * (nodes.length - 1)) / nodes.length;
  const boxW = spec.width - padding * 2;
  let svg = '';
  let y = padding;
  for (let i = 0; i < nodes.length; i++) {
    svg += `<circle cx="${padding + 20}" cy="${y + boxH / 2}" r="14" fill="${spec.accent}" />`;
    svg += `<text x="${padding + 20}" y="${y + boxH / 2 + 4}" font-family="${spec.fontFamily ?? 'system-ui'}" font-size="14" font-weight="700" fill="${spec.textColor}" text-anchor="middle">${i + 1}</text>`;
    svg += shape(spec, padding + 48, y, boxW - 48, boxH, nodes[i].text, { bgOpacity: 0.3, rx: 6 });
    y += boxH + gap;
  }
  return svg;
}

function renderListHorizontal(spec: SmartArtSpec): string {
  return renderProcess({ ...spec });
}

function renderVenn(spec: SmartArtSpec): string {
  const nodes = flatten(spec.nodes).slice(0, 3);
  if (!nodes.length) return '';
  const cx = spec.width / 2;
  const cy = spec.height / 2;
  const r = Math.min(spec.width, spec.height) / 4;
  let svg = '';
  const positions = nodes.length === 1 ? [[cx, cy]]
    : nodes.length === 2 ? [[cx - r * 0.6, cy], [cx + r * 0.6, cy]]
    : [[cx - r * 0.7, cy + r * 0.4], [cx + r * 0.7, cy + r * 0.4], [cx, cy - r * 0.6]];
  for (let i = 0; i < nodes.length; i++) {
    const [x, y] = positions[i];
    svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${spec.accent}" fill-opacity="0.4" stroke="${spec.accent}" stroke-width="2" />`;
    svg += `<text x="${x}" y="${y + 5}" font-family="${spec.fontFamily ?? 'system-ui'}" font-size="14" font-weight="700" fill="${spec.textColor}" text-anchor="middle">${escapeXml(nodes[i].text)}</text>`;
  }
  return svg;
}

function renderPyramid(spec: SmartArtSpec): string {
  const nodes = flatten(spec.nodes);
  if (!nodes.length) return '';
  const padding = 20;
  const stepH = (spec.height - padding * 2) / nodes.length;
  const cx = spec.width / 2;
  let svg = '';
  for (let i = nodes.length - 1; i >= 0; i--) {
    const tierTop = padding + i * stepH;
    const tierBottom = tierTop + stepH - 4;
    const widthTop = ((nodes.length - 1 - i) / nodes.length) * (spec.width - padding * 2) * 0.9;
    const widthBottom = ((nodes.length - i) / nodes.length) * (spec.width - padding * 2) * 0.9;
    const points = [
      [cx - widthTop / 2, tierTop],
      [cx + widthTop / 2, tierTop],
      [cx + widthBottom / 2, tierBottom],
      [cx - widthBottom / 2, tierBottom],
    ].map(p => p.join(',')).join(' ');
    const op = 0.4 + (nodes.length - 1 - i) * 0.15;
    svg += `<polygon points="${points}" fill="${spec.accent}" fill-opacity="${Math.min(1, op)}" stroke="${spec.accent}" stroke-width="2" />`;
    svg += `<text x="${cx}" y="${tierTop + stepH / 2 + 5}" font-family="${spec.fontFamily ?? 'system-ui'}" font-size="14" font-weight="700" fill="${spec.textColor}" text-anchor="middle">${escapeXml(nodes[i].text)}</text>`;
  }
  return svg;
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const charW = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / charW);
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (test.length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function smartArtToSvg(spec: SmartArtSpec): string {
  const inner = renderSmartArtSvg(spec);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spec.width} ${spec.height}" width="${spec.width}" height="${spec.height}">${inner}</svg>`;
}

export const SMART_ART_LAYOUTS: { id: SmartArtLayout; label: string; description: string }[] = [
  { id: 'process',          label: 'Process',         description: 'Steps with arrows (left → right)' },
  { id: 'cycle',            label: 'Cycle',           description: 'Repeating ring of steps' },
  { id: 'hierarchy',        label: 'Hierarchy',       description: 'Root with branching children' },
  { id: 'list-vertical',    label: 'Numbered List',   description: 'Vertical numbered cards' },
  { id: 'venn',             label: 'Venn Diagram',    description: 'Overlapping sets' },
  { id: 'pyramid',          label: 'Pyramid',         description: 'Layered tiers' },
];
