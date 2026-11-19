import { memo, useMemo, type ComponentProps, type MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { rehypeSourceOffsets, type Highlight } from '../lib/rehypeSourceOffsets';
import { FunctionPlot } from './diagrams/FunctionPlot';
import { Mermaid } from './diagrams/Mermaid';
import { SafeSvg } from './diagrams/SafeSvg';

interface Props {
  source: string;
  highlights?: Highlight[];
  /** Called when the user clicks a math formula or a diagram (whole-block comment). */
  onBlockClick?: (range: { start: number; end: number }) => void;
  /** Called when the user clicks highlighted text belonging to a comment. */
  onMarkClick?: (commentId: number) => void;
  className?: string;
}

function DiagramDiv(props: ComponentProps<'div'> & { node?: unknown }) {
  const { node: _node, children, ...rest } = props;
  const p = rest as Record<string, unknown>;
  const lang = p['data-diagram'] as string | undefined;
  if (!lang) return <div {...rest}>{children}</div>;
  const src = String(p['data-src'] ?? '');
  return (
    <div {...rest} data-src={undefined}>
      {lang === 'mermaid' && <Mermaid source={src} />}
      {lang === 'function-plot' && <FunctionPlot source={src} />}
      {lang === 'svg' && <SafeSvg source={src} />}
    </div>
  );
}

const components = { div: DiagramDiv };

export const Markdown = memo(function Markdown({ source, highlights, onBlockClick, onMarkClick, className = '' }: Props) {
  const rehypePlugins = useMemo(
    () => [
      [rehypeSourceOffsets, { source, highlights }],
      rehypeKatex,
      [rehypeHighlight, { detect: false }],
    ] as NonNullable<ComponentProps<typeof ReactMarkdown>['rehypePlugins']>,
    [source, highlights],
  );

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const mark = target.closest<HTMLElement>('mark[data-comment-id]');
    if (mark && onMarkClick) { onMarkClick(Number(mark.dataset.commentId)); return; }
    const block = target.closest<HTMLElement>('[data-block-start]');
    if (block && block.tagName !== 'PRE' && onBlockClick && !window.getSelection()?.toString()) {
      onBlockClick({ start: Number(block.dataset.blockStart), end: Number(block.dataset.blockEnd) });
    }
  };

  return (
    <div className={`prose-rev ${className}`} onClick={onClick} data-source={source}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={rehypePlugins} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
});
