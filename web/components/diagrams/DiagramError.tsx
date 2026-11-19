export function DiagramError({ source, error }: { source: string; error: string }) {
  return (
    <div className="my-3 rounded-md border border-danger/60 bg-sunken p-3 text-sm font-sans">
      <p className="text-danger">Ce schéma n'a pas pu être dessiné : {error}</p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{source}</pre>
    </div>
  );
}
