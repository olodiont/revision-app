/*
 * Turns a DOM selection inside a rendered <Markdown> into offsets in its Markdown source,
 * using the data-s / data-block-* / data-code-start attributes written by rehypeSourceOffsets.
 */

import { alignOffsets } from './align';

export interface SourceRange { start: number; end: number; kind: 'text' | 'block' }

/** The Markdown source rendered in this container (written by <Markdown> as data-source). */
function sourceOf(container: HTMLElement): string {
  return container.closest<HTMLElement>('[data-source]')?.dataset.source
    ?? container.querySelector<HTMLElement>('[data-source]')?.dataset.source ?? '';
}

function textLengthBetween(root: Node, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

const asElement = (n: Node): Element | null => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);

/** Moves a boundary point that sits between elements onto the nearest mapped text node. */
function normalize(node: Node, offset: number, container: HTMLElement, side: 'start' | 'end'): [Node, number] | null {
  if (node.nodeType === Node.TEXT_NODE) return [node, offset];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const probe = document.createRange();
  probe.setStart(node, offset);
  let before: Text | null = null;
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (!t.nodeValue) continue;
    // Is t after the boundary point?
    const cmp = probe.comparePoint(t, 0);
    if (cmp >= 0) return side === 'start' ? [t, 0] : before ? [before, before.nodeValue!.length] : null;
    before = t;
  }
  return side === 'end' && before ? [before, before.nodeValue!.length] : null;
}

function pointToOffset(
  node: Node, offset: number, container: HTMLElement, side: 'start' | 'end',
): { offset: number; block: boolean } | null {
  const norm = normalize(node, offset, container, side);
  if (!norm) return null;
  const [n, o] = norm;
  const el = asElement(n);
  if (!el || !container.contains(el)) return null;

  const block = el.closest<HTMLElement>('[data-block-start]');
  if (block && container.contains(block)) {
    if (block.tagName === 'PRE' && block.dataset.codeStart !== undefined) {
      const code = block.querySelector('code') ?? block;
      const k = textLengthBetween(code, n, o);
      const text = code.textContent ?? '';
      // Code inside lists or blockquotes carries indentation / "> " in the source: align to skip it.
      const offs = alignOffsets(text, sourceOf(container), Number(block.dataset.codeStart), Number(block.dataset.blockEnd));
      if (!offs.length) return { offset: Number(block.dataset.codeStart), block: false };
      const offset = k < offs.length ? offs[k] : offs[offs.length - 1] + 1;
      return { offset, block: false };
    }
    return { offset: Number(side === 'start' ? block.dataset.blockStart : block.dataset.blockEnd), block: true };
  }

  const span = el.closest<HTMLElement>('[data-s]');
  if (span && container.contains(span)) {
    return { offset: Number(span.dataset.s) + textLengthBetween(span, n, o), block: false };
  }
  return null;
}

export function domSelectionToSourceRange(sel: Selection, container: HTMLElement): SourceRange | null {
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
  const a = pointToOffset(range.startContainer, range.startOffset, container, 'start');
  const b = pointToOffset(range.endContainer, range.endOffset, container, 'end');
  if (!a || !b) return null;
  const start = Math.min(a.offset, b.offset);
  const end = Math.max(a.offset, b.offset);
  if (end <= start) return null;
  return { start, end, kind: a.block || b.block ? 'block' : 'text' };
}
