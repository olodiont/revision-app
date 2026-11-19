import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface StorageInfo {
  dataDir: string;
  dataBytes: number;
  claudeHistoryDir: string;
  claudeHistoryBytes: number;
  model: string | null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} Ko`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${(n / 1024 ** 3).toFixed(2)} Go`;
}

export function StoragePage() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [model, setModel] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const i = await api.get<StorageInfo>('/api/storage');
    setInfo(i);
    setModel(i.model ?? '');
    setDataDir(i.dataDir);
  }, []);
  useEffect(() => { load().catch((e) => setNotice({ text: (e as Error).message, error: true })); }, [load]);

  const open = async (target: 'data' | 'claudeHistory') => {
    try {
      await api.send('POST', '/api/storage/open', { target });
      setNotice(null);
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    }
  };

  const save = async () => {
    try {
      const r = await api.send<{ message: string }>('PUT', '/api/settings', { model, dataDir });
      setNotice({ text: r.message });
      await load();
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    }
  };

  if (!info) return <p className={`p-8 ${notice?.error ? 'text-danger' : 'text-muted'}`}>{notice?.text ?? 'Chargement…'}</p>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-8 p-8">
        <h1 className="text-2xl font-semibold">Stockage et réglages</h1>

        <section className="space-y-3 rounded-xl border border-line bg-panel p-5">
          <h2 className="font-semibold">Tes données</h2>
          <p className="text-sm text-muted">
            Tout est stocké sur ton ordinateur dans ce dossier : la base <code>revision.db</code>, les fichiers d'origine
            (<code>fichiers/</code>) et le dossier de travail de Claude. Pour tout vider, ferme l'app puis supprime ce dossier :
            elle repartira à vide au prochain lancement.
          </p>
          <p className="break-all rounded-md bg-sunken px-3 py-2 font-mono text-sm">{info.dataDir}</p>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={() => void open('data')}>Ouvrir le dossier de stockage</button>
            <span className="text-sm text-muted">{formatBytes(info.dataBytes)}</span>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-line bg-panel p-5">
          <h2 className="font-semibold">Historique Claude Code</h2>
          <p className="text-sm text-muted">
            L'app demande à Claude Code de ne pas garder d'historique des échanges. Si ta version de Claude Code en garde quand même,
            il se trouve ici.
          </p>
          <p className="break-all rounded-md bg-sunken px-3 py-2 font-mono text-sm">{info.claudeHistoryDir}</p>
          <div className="flex items-center gap-3">
            <button className="btn" onClick={() => void open('claudeHistory')}>Ouvrir l'historique Claude Code</button>
            <span className="text-sm text-muted">{info.claudeHistoryBytes ? formatBytes(info.claudeHistoryBytes) : 'vide'}</span>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-line bg-panel p-5">
          <h2 className="font-semibold">Réglages</h2>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Modèle Claude</span>
            <input className="field" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Vide = modèle par défaut de Claude Code" />
            <span className="text-xs text-muted">Exemples : claude-opus-5-5, claude-sonnet-5-5 (plus économe en usage).</span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Dossier de stockage</span>
            <input className="field font-mono text-sm" value={dataDir} onChange={(e) => setDataDir(e.target.value)} />
            <span className="text-xs text-muted">Changer de dossier ne déplace pas les données existantes.</span>
          </label>
          <button className="btn btn-primary" onClick={() => void save()}>Enregistrer</button>
        </section>

        {notice && <p className={`text-sm ${notice.error ? 'text-danger' : 'text-ok'}`}>{notice.text}</p>}

        <p className="text-sm text-muted">
          Les échanges envoyés à Claude transitent par Anthropic et suivent les réglages de confidentialité de ton compte claude.ai.
          Vider le stockage local ne les efface pas.
        </p>
      </div>
    </div>
  );
}
