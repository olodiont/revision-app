import { useRef, useState } from 'react';

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  accept: string;
  label?: string;
  hint?: string;
}

const sizeLabel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);

/** Large, obvious "add files" zone: click to browse or drop files on it. */
export function FilePicker({ files, onChange, accept, label = 'Ajouter une photo, un PDF ou un Word', hint = 'Clique ici ou glisse tes fichiers dans ce cadre' }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = (list: FileList | File[] | null) => {
    const added = [...(list ?? [])];
    if (added.length) onChange([...files, ...added]);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        data-testid="file-drop"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={`flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors
          ${over ? 'border-accent bg-accent-soft' : 'border-line bg-sunken hover:border-accent hover:bg-accent-soft'}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-9 w-9 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V4" /><path d="M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        <span className="font-medium text-accent">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ''; }}
      />
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-sm">
              <span aria-hidden>{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted">{sizeLabel(f.size)}</span>
              <button type="button" className="text-muted hover:text-danger" aria-label={`Retirer ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
