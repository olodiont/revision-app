/*
 * Rehype plugin linking the rendered HTML back to the Markdown source, so a text selection
 * in the page can be turned into source offsets (comment anchors) and comments can be drawn back.
 *
 * - every text node with a source position becomes <span data-s="offset"> (or <mark data-comment-id>
 *   for the parts covered by a comment highlight);
 * - math (inline and display) is wrapped in an element with data-block-start / data-block-end;
 * - code blocks get data-code-start (offset of the first code character) plus block bounds;
 * - ```mermaid / ```function-plot / ```svg fences become <div data-diagram data-src> blocks.
 * Must run before rehype-katex and rehype-highlight.
 */

import { alignedRuns } from './align';

export interface Highlight { start: number; end: number; commentId: number; active: boolean }
export const DIAGRAM_LANGS = new Set(['mermaid', 'function-plot', 'svg']);

type Node = any;

const classesOf = (node: Node): string[] => {
  const c = node.properties?.className;
  return Array.isArray(c) ? c.map(String) : typeof c === 'string' ? c.split(' ') : [];
};
const pos = (node: Node): { start: number; end: number } | null => {
  const s = node.position?.start?.offset;
  const e = node.position?.end?.offset;
  return typeof s === 'number' && typeof e === 'number' ? { start: s, end: e } : null;
};
const textOf = (node: Node): string =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('');

export function rehypeSourceOffsets(opts: { source: string; highlights?: Highlight[] }) {
  const { source } = opts;
  const highlights = opts.highlights ?? [];
  const touches = (start: number, end: number) => highlights.some((h) => h.start < end && start < h.end);

  const blockProps = (p: { start: number; end: number }, extra: string[] = []) => ({
    dataBlockStart: p.start,
    dataBlockEnd: p.end,
    className: [...extra, ...(touches(p.start, p.end) ? ['commented'] : [])],
  });

  /** Splits a text value found in source [from, to) into spans / marks carrying their real source offsets. */
  const segmentText = (value: string, from: number, to: number): Node[] =>
    alignedRuns(value, source, from, to).flatMap((run) => segmentRun(run.text, run.start));

  /** Splits a run whose characters are contiguous in the source (starting at `s`) at highlight boundaries. */
  const segmentRun = (value: string, s: number): Node[] => {
    const e = s + value.length;
    const cuts = new Set<number>([s, e]);
    for (const h of highlights) {
      if (h.start > s && h.start < e) cuts.add(h.start);
      if (h.end > s && h.end < e) cuts.add(h.end);
    }
    const points = [...cuts].sort((a, b) => a - b);
    const out: Node[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const text = { type: 'text', value: value.slice(a - s, b - s) };
      const covering = highlights.filter((h) => h.start <= a && h.end >= b);
      if (covering.length) {
        const h = covering.find((x) => x.active) ?? covering.reduce((x, y) => (y.start > x.start ? y : x));
        out.push({
          type: 'element', tagName: 'mark',
          properties: { dataS: a, dataCommentId: h.commentId, className: h.active ? ['active'] : [] },
          children: [text],
        });
      } else {
        out.push({ type: 'element', tagName: 'span', properties: { dataS: a }, children: [text] });
      }
    }
    return out;
  };

  const visitChildren = (parent: Node) => {
    if (!parent.children) return;
    const next: Node[] = [];
    for (const child of parent.children) next.push(...visit(child, parent));
    parent.children = next;
  };

  const visit = (node: Node, parent: Node): Node[] => {
    if (node.type === 'text') {
      const p = pos(node);
      if (!p || !node.value) return [node];
      return segmentText(node.value, p.start, p.end);
    }
    if (node.type !== 'element') {
      visitChildren(node);
      return [node];
    }

    const p = pos(node);
    const cls = classesOf(node);

    // Display math and code blocks: <pre><code class="language-x">
    if (node.tagName === 'pre') {
      const code = (node.children ?? []).find((c: Node) => c.type === 'element' && c.tagName === 'code');
      const lang = code ? classesOf(code).find((c) => c.startsWith('language-'))?.slice(9) : undefined;
      if (p && lang === 'math') {
        return [{ type: 'element', tagName: 'div', properties: blockProps(p, ['math-block']), children: [node] }];
      }
      if (p && lang && DIAGRAM_LANGS.has(lang)) {
        return [{
          type: 'element', tagName: 'div',
          properties: { ...blockProps(p, ['diagram-block']), dataDiagram: lang, dataSrc: textOf(code) },
          children: [],
        }];
      }
      if (p) {
        const firstLineEnd = source.indexOf('\n', p.start);
        const fenced = /^\s*(```|~~~)/.test(source.slice(p.start, p.start + 8));
        const codeStart = fenced && firstLineEnd !== -1 ? firstLineEnd + 1 : p.start;
        node.properties = { ...node.properties, ...blockProps(p), dataCodeStart: codeStart };
      }
      return [node];
    }

    // Inline math: <code class="language-math math-inline">
    if (node.tagName === 'code' && cls.includes('math-inline') && p) {
      return [{ type: 'element', tagName: 'span', properties: blockProps(p, ['math-inline-block']), children: [node] }];
    }

    // Inline code: its text has no position; locate it inside the backticks.
    if (node.tagName === 'code' && parent?.tagName !== 'pre' && p) {
      const value = textOf(node);
      const ticks = /^`+\s?/.exec(source.slice(p.start, p.end))?.[0].length ?? 0;
      if (value) node.children = segmentText(value, p.start + ticks, p.end);
      return [node];
    }

    visitChildren(node);
    return [node];
  };

  return (tree: Node) => { visitChildren(tree); };
}
