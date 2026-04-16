import { useState, useRef } from 'react';
import { inputClass } from '../../shared/editorClasses';

export function AssetEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const url = typeof value === 'string' ? value : '';
  const isValidUrl = url.length > 0 && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'));
  const [dragging, setDragging] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsDataUri = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && file.type !== 'application/pdf') return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFileAsDataUri(file);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFileAsDataUri(file);
    e.target.value = '';
  };

  const isDataUri = url.startsWith('data:');
  const dataUriSize = isDataUri ? Math.round((url.length * 3) / 4 / 1024) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <input
          type="url"
          value={isDataUri ? '' : url}
          onChange={e => { onChange(e.target.value); setLoadError(false); }}
          placeholder={isDataUri ? `data URI (${dataUriSize}KB)` : 'https://example.com/image.png'}
          className={inputClass}
          disabled={isDataUri}
        />
        {isDataUri && (
          <button
            onClick={() => onChange('')}
            className="shrink-0 px-2 py-1 rounded text-[10px] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            title="Clear data URI"
          >
            Clear
          </button>
        )}
      </div>

      {/* Preview */}
      {isValidUrl && (
        <div className="relative rounded border border-[var(--color-figma-border)] overflow-hidden bg-[var(--color-figma-bg-secondary)] flex items-center justify-center" style={{ minHeight: '80px', maxHeight: '160px' }}>
          {!loadError ? (
            <img
              src={url}
              alt="Asset preview"
              className="max-w-full max-h-40 object-contain"
              onLoad={() => setLoadError(false)}
              onError={() => setLoadError(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 p-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Unable to load image</span>
            </div>
          )}
          {isDataUri && !loadError && (
            <span className="absolute bottom-1 right-1 text-[9px] px-1 py-0.5 rounded bg-[var(--color-figma-overlay)] text-white/80">{dataUriSize}KB</span>
          )}
        </div>
      )}

      {/* Drop zone / upload */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 rounded border-2 border-dashed cursor-pointer transition-colors py-3 px-2 ${
          dragging
            ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10'
            : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
          {dragging ? 'Drop image here' : 'Drag & drop or click to upload'}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="sr-only"
        />
      </div>
    </div>
  );
}
