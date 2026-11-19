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
  /** Called when the user clicks a passage (text, formula or diagram) that carries a comment. */
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

export const Markdown = memo(function Markdown({ source, highlights, onMarkClick, className = '' }: Props) {
  const rehypePlugins = useMemo(
    () => [
      [rehypeSourceOffsets, { source, highlights }],
      rehypeKatex,
      [rehypeHighlight, { detect: false }],
    ] as NonNullable<ComponentProps<typeof ReactMarkdown>['rehypePlugins']>,
    [source, highlights],
  );

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    // A drag that selects text also ends with a click: only a plain click reopens a comment.
    if (window.getSelection()?.toString()) return;
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-comment-id]');
    if (hit && onMarkClick) onMarkClick(Number(hit.dataset.commentId));
  };

  return (
    <div className={`prose-rev ${className}`} onClick={onClick} data-source={source}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={rehypePlugins} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
});
