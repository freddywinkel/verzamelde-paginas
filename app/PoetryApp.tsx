"use client";

import {
  ArchiveRestore,
  AudioLines,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileArchive,
  FileAudio,
  FilePenLine,
  HardDrive,
  Import,
  Info,
  Layers3,
  Mic,
  MoreHorizontal,
  Pause,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Share2,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Square,
  Star,
  Tag,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createBackup,
  downloadBlob,
  inspectImportFile,
} from "../lib/archive";
import {
  clearLibrary,
  deletePoem,
  deleteTake,
  getSetting,
  importSnapshot,
  loadSnapshot,
  renameTake,
  saveAudioTake,
  savePoem,
  saveRevision,
  setPreferredTake,
  setSetting,
} from "../lib/db";
import {
  countWords,
  excerpt,
  formatBytes,
  formatDate,
  formatDuration,
  formatTime,
  makeId,
  normalizeTitle,
  type AppView,
  type AudioTake,
  type ImportReport,
  type LibrarySnapshot,
  type Poem,
  type PoemStatus,
  type Revision,
} from "../lib/model";
import { installPageTopReset, resetPageScroll } from "../lib/navigation";
import { monitorPwaUpdates } from "../lib/pwa-updates";
import { copyWholePoem, shareWholePoem } from "../lib/share-poem";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface StorageHealth {
  usage?: number;
  quota?: number;
  persisted?: boolean;
  supported: boolean;
}

interface ToastState {
  message: string;
  tone?: "success" | "error" | "info";
}

const EMPTY_SNAPSHOT: LibrarySnapshot = {
  poems: [],
  revisions: [],
  audioTakes: [],
};

const navigation: Array<{
  id: AppView;
  label: string;
  shortLabel: string;
  icon: typeof Layers3;
}> = [
  { id: "library", label: "Pagina’s", shortLabel: "Pagina’s", icon: Layers3 },
  { id: "write", label: "Schrijven", shortLabel: "Schrijven", icon: PenLine },
  { id: "record", label: "Stemmen", shortLabel: "Stemmen", icon: AudioLines },
  { id: "manage", label: "Beheer & back-up", shortLabel: "Beheer", icon: HardDrive },
];

function useObjectUrl(blob?: Blob): string | undefined {
  const url = useMemo(
    () => (blob && typeof URL !== "undefined" ? URL.createObjectURL(blob) : undefined),
    [blob],
  );
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

function PaperStamp({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "rust" }) {
  return <span className={`paper-stamp paper-stamp--${tone}`}>{children}</span>;
}

function AudioPlayer({ take, compact = false }: { take: AudioTake; compact?: boolean }) {
  const url = useObjectUrl(take.blob);
  return (
    <div className={`audio-player ${compact ? "audio-player--compact" : ""}`}>
      {/* The visible poem text is the transcript for this user-created audio. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls preload="metadata" src={url} aria-label={`Speel ${take.name}`} />
      <div className="audio-player__meta">
        <span>{take.name}</span>
        <span>{formatDuration(take.durationMs)}</span>
        {take.isPreferred && <span className="preferred-label"><Star size={12} aria-hidden /> Voorkeur</span>}
      </div>
    </div>
  );
}

function EmptyCollection({ onImport, onNew }: { onImport: () => void; onNew: () => void }) {
  return (
    <section className="empty-collection" aria-labelledby="empty-title">
      <div className="empty-stack" aria-hidden="true">
        <span />
        <span />
        <div><BookOpen size={34} /></div>
      </div>
      <p className="eyebrow">Privéarchief</p>
      <h1 id="empty-title">Je verzameling begint hier</h1>
      <p>
        Importeer de voorbereide bundel met je gedichten. De teksten en alle
        toekomstige opnames blijven in de opslag van dit apparaat.
      </p>
      <div className="button-row button-row--center">
        <button className="button button--primary" type="button" onClick={onImport}>
          <Import size={18} aria-hidden /> Importeer mijn gedichten
        </button>
        <button className="button button--secondary" type="button" onClick={onNew}>
          <PenLine size={18} aria-hidden /> Schrijf een nieuw gedicht
        </button>
      </div>
      <div className="privacy-note">
        <ShieldCheck size={18} aria-hidden />
        <span>Geen account, advertenties, analytics of automatische cloud-upload.</span>
      </div>
    </section>
  );
}

type LibraryFilter = "alles" | "klad" | "definitief" | "opgenomen" | "openstaand";
type LibrarySort = "collection" | "title" | "updated" | "recording";

function LibraryView({
  snapshot,
  selectedId,
  onSelect,
  onEdit,
  onRecord,
  onNew,
  onImport,
  onShare,
  onCopy,
}: {
  snapshot: LibrarySnapshot;
  selectedId?: string;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onRecord: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  onShare: (title: string, body: string) => Promise<void>;
  onCopy: (title: string, body: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("alles");
  const [sort, setSort] = useState<LibrarySort>("collection");
  const [tag, setTag] = useState("");
  const [fullReader, setFullReader] = useState(false);
  const [readingRevisionId, setReadingRevisionId] = useState<string>();
  const recorded = useMemo(
    () => new Set(snapshot.audioTakes.map((take) => take.poemId)),
    [snapshot.audioTakes],
  );
  const allTags = useMemo(
    () => Array.from(new Set(snapshot.poems.flatMap((poem) => poem.tags))).sort((a, b) => a.localeCompare(b, "nl")),
    [snapshot.poems],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("nl-NL");
    const result = snapshot.poems.filter((poem) => {
      const matchesQuery =
        !normalizedQuery ||
        poem.titleLower.includes(normalizedQuery) ||
        poem.body.toLocaleLowerCase("nl-NL").includes(normalizedQuery) ||
        poem.tags.some((item) => item.toLocaleLowerCase("nl-NL").includes(normalizedQuery));
      const matchesFilter =
        filter === "alles" ||
        (filter === "klad" && poem.status === "klad") ||
        (filter === "definitief" && poem.status === "definitief") ||
        (filter === "opgenomen" && recorded.has(poem.id)) ||
        (filter === "openstaand" && !recorded.has(poem.id));
      return matchesQuery && matchesFilter && (!tag || poem.tags.includes(tag));
    });
    return result.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "nl");
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === "recording") return Number(recorded.has(a.id)) - Number(recorded.has(b.id));
      return (a.collectionIndex ?? Number.MAX_SAFE_INTEGER) - (b.collectionIndex ?? Number.MAX_SAFE_INTEGER);
    });
  }, [filter, query, recorded, snapshot.poems, sort, tag]);

  const selected = filtered.find((poem) => poem.id === selectedId) ?? filtered[0];
  const selectedRevisions = snapshot.revisions
    .filter((item) => item.poemId === selected?.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selectedTakes = snapshot.audioTakes
    .filter((item) => item.poemId === selected?.id)
    .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred) || b.createdAt.localeCompare(a.createdAt));
  const recordedCount = recorded.size;
  const readingRevision = selectedRevisions.find((revision) => revision.id === readingRevisionId);
  const changeFullReader = (open: boolean) => {
    setFullReader(open);
    resetPageScroll();
    window.requestAnimationFrame(() => resetPageScroll());
  };

  if (fullReader && selected) {
    const readingTitle = readingRevision?.title ?? selected.title;
    const readingBody = readingRevision?.body ?? selected.body;
    return (
      <div className="full-reader">
        <header className="full-reader-toolbar">
          <button className="button button--ghost" type="button" onClick={() => changeFullReader(false)}>
            <ChevronLeft size={18} aria-hidden /> Terug naar collectie
          </button>
          <div className="full-reader-toolbar__actions">
            <button className="button button--ghost button--compact" type="button" aria-label="Deel volledig gedicht" onClick={() => void onShare(readingTitle, readingBody)}>
              <Share2 size={17} aria-hidden /> <span>Deel</span>
            </button>
            <button className="button button--ghost button--compact" type="button" aria-label="Kopieer volledig gedicht" onClick={() => void onCopy(readingTitle, readingBody)}>
              <Copy size={17} aria-hidden /> <span>Kopieer tekst</span>
            </button>
            <button className="icon-button" type="button" aria-label="Bewerk gedicht" onClick={() => onEdit(selected.id)}>
              <PenLine size={18} aria-hidden />
            </button>
            <button className="button button--primary" type="button" onClick={() => onRecord(selected.id)}>
              <Mic size={17} aria-hidden /> Neem op
            </button>
          </div>
        </header>
        <article className="full-reader-sheet">
          <span className="paper-tape" aria-hidden />
          <div className="collection-index">
            {selected.collectionIndex
              ? `Kaart ${String(selected.collectionIndex).padStart(3, "0")} / collectie`
              : "Nieuwe pagina / collectie"}
          </div>
          <h1>{readingTitle || "Naamloos gedicht"}</h1>
          {selectedRevisions.length > 1 && (
            <label className="reader-version-select">Lees versie
              <select
                value={readingRevisionId ?? "current"}
                onChange={(event) => {
                  setReadingRevisionId(event.target.value === "current" ? undefined : event.target.value);
                  resetPageScroll();
                  window.requestAnimationFrame(() => resetPageScroll());
                }}
              >
                <option value="current">Huidige tekst</option>
                {selectedRevisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.label}</option>)}
              </select>
            </label>
          )}
          <div className="poem-text">{readingBody || "Nog geen regels geschreven."}</div>
          {selected.privateNote && <aside className="hand-note">{selected.privateNote}</aside>}
          {selectedTakes[0] && <AudioPlayer take={selectedTakes[0]} />}
          <footer className="full-reader-footer">
            <span>{countWords(readingBody)} woorden</span>
            <span>{selected.status}</span>
            {selected.tags.map((item) => <span key={item}>#{item}</span>)}
          </footer>
        </article>
      </div>
    );
  }

  if (!snapshot.poems.length) return <EmptyCollection onImport={onImport} onNew={onNew} />;

  const surprise = () => {
    const poem = filtered[Math.floor(Math.random() * filtered.length)];
    if (poem) onSelect(poem.id);
  };

  return (
    <div className="library-view">
      <header className="collection-header">
        <div>
          <p className="eyebrow">Verzamelde pagina’s</p>
          <h1>Mijn gedichten</h1>
          <p className="collection-summary">
            {snapshot.poems.length} gedichten · {recordedCount} met een stem
          </p>
        </div>
        <PaperStamp>Privé<br />archief</PaperStamp>
      </header>

      <div className="shortcut-row" aria-label="Snelkoppelingen">
        <button type="button" onClick={() => document.getElementById("library-search")?.focus()}>
          <Search size={17} aria-hidden /> Zoek
        </button>
        <button type="button" onClick={surprise} disabled={!filtered.length}>
          <Shuffle size={17} aria-hidden /> Verras me
        </button>
        <button type="button" onClick={onNew}>
          <Plus size={17} aria-hidden /> Nieuw
        </button>
      </div>

      <div className="library-workspace">
        <section className="library-index" aria-labelledby="library-index-title">
          <div className="library-tools">
            <h2 id="library-index-title" className="sr-only">Gedichtenindex</h2>
            <label className="search-field" htmlFor="library-search">
              <Search size={18} aria-hidden />
              <input
                id="library-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zoek in titels, tekst of tags"
              />
            </label>
            <div className="filter-scroll" aria-label="Filter gedichten">
              {([
                ["alles", "Alles"],
                ["klad", "Klad"],
                ["definitief", "Definitief"],
                ["opgenomen", "Met opname"],
                ["openstaand", "Zonder opname"],
              ] as Array<[LibraryFilter, string]>).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? "filter-chip is-active" : "filter-chip"}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="sort-row">
              <label>
                <SlidersHorizontal size={15} aria-hidden />
                <span className="sr-only">Sorteer</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
                  <option value="collection">Collectievolgorde</option>
                  <option value="title">Titel A–Z</option>
                  <option value="updated">Laatst gewijzigd</option>
                  <option value="recording">Opname ontbreekt eerst</option>
                </select>
              </label>
              <label>
                <Tag size={15} aria-hidden />
                <span className="sr-only">Filter op tag</span>
                <select value={tag} onChange={(event) => setTag(event.target.value)}>
                  <option value="">Alle tags</option>
                  {allTags.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
          </div>
          <p className="result-count" role="status" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "gedicht" : "gedichten"}
          </p>
          <div className="poem-list">
            {filtered.map((poem) => {
              const isSelected = poem.id === selected?.id;
              return (
                <button
                  type="button"
                  key={poem.id}
                  className={`poem-row ${isSelected ? "is-selected" : ""}`}
                  onClick={() => onSelect(poem.id)}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <span className="poem-row__index">
                    {poem.collectionIndex ? String(poem.collectionIndex).padStart(3, "0") : "NIEUW"}
                  </span>
                  <span className="poem-row__content">
                    <strong>{poem.title || "Naamloos gedicht"}</strong>
                    <span>{excerpt(poem.body) || "Nog geen regels geschreven."}</span>
                    <small>
                      {poem.status}
                      {recorded.has(poem.id) && <> · <AudioLines size={12} aria-label="Met opname" /></>}
                    </small>
                  </span>
                  <ChevronRight size={17} aria-hidden />
                </button>
              );
            })}
            {!filtered.length && (
              <div className="no-results">
                <Search size={24} aria-hidden />
                <h3>Geen pagina gevonden</h3>
                <p>Pas de zoekterm of filters aan.</p>
                <button className="text-button" type="button" onClick={() => { setQuery(""); setFilter("alles"); setTag(""); }}>
                  Wis filters
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="reader-pane" aria-label="Geselecteerd gedicht">
          {selected ? (
            <div className="paper-stack">
              <span className="paper-layer paper-layer--one" aria-hidden />
              <span className="paper-layer paper-layer--two" aria-hidden />
              <article className="poem-sheet">
                <span className="paper-tape" aria-hidden />
                <div className="sheet-toolbar">
                  <span className="collection-index">
                    {selected.collectionIndex
                      ? `Kaart ${String(selected.collectionIndex).padStart(3, "0")} / collectie`
                      : "Nieuwe pagina / collectie"}
                  </span>
                  <button className="icon-button" type="button" aria-label="Bewerk gedicht" onClick={() => onEdit(selected.id)}>
                    <FilePenLine size={18} aria-hidden />
                  </button>
                </div>
                <h2>{selected.title || "Naamloos gedicht"}</h2>
                <div className="poem-text">{selected.body || "Nog geen regels geschreven."}</div>
                <div className="poem-metadata">
                  <span>{countWords(selected.body)} woorden</span>
                  <span>{selectedRevisions.length} {selectedRevisions.length === 1 ? "versie" : "versies"}</span>
                  <span>{selected.language || "Taal onbekend"}</span>
                </div>
                {selected.privateNote && <aside className="hand-note">{selected.privateNote}</aside>}
                {selectedTakes[0] ? (
                  <AudioPlayer take={selectedTakes[0]} compact />
                ) : (
                  <button className="audio-empty" type="button" onClick={() => onRecord(selected.id)}>
                    <Mic size={19} aria-hidden />
                    <span><strong>Geef dit gedicht een stem</strong><small>Nog geen opname</small></span>
                  </button>
                )}
                <div className="poem-transfer-actions" aria-label="Volledig gedicht delen of kopiëren">
                  <button className="text-button" type="button" onClick={() => void onShare(selected.title, selected.body)}>
                    <Share2 size={16} aria-hidden /> Deel volledig gedicht
                  </button>
                  <button className="text-button" type="button" onClick={() => void onCopy(selected.title, selected.body)}>
                    <Copy size={16} aria-hidden /> Kopieer hele tekst
                  </button>
                </div>
                <div className="sheet-actions">
                  <button className="button button--ghost" type="button" onClick={() => { setReadingRevisionId(undefined); changeFullReader(true); }}>
                    <BookOpen size={17} aria-hidden /> Lees volledig
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => onEdit(selected.id)}>
                    <PenLine size={17} aria-hidden /> Bewerk
                  </button>
                  <button className="button button--primary" type="button" onClick={() => onRecord(selected.id)}>
                    <Mic size={17} aria-hidden /> Neem op
                  </button>
                </div>
              </article>
            </div>
          ) : (
            <div className="reader-placeholder">Kies een gedicht uit de index.</div>
          )}
        </section>
      </div>
    </div>
  );
}

interface EditorForm {
  title: string;
  body: string;
  status: PoemStatus;
  tags: string;
  language: string;
  writtenOn: string;
  privateNote: string;
}

type EditorFlushHandler = () => Promise<boolean>;

function editorFormFromPoem(poem?: Poem): EditorForm {
  return {
    title: poem?.title ?? "",
    body: poem?.body ?? "",
    status: poem?.status ?? "klad",
    tags: poem?.tags.join(", ") ?? "",
    language: poem?.language ?? "",
    writtenOn: poem?.writtenOn ?? "",
    privateNote: poem?.privateNote ?? "",
  };
}

function parsedTags(value: string): string[] {
  return Array.from(new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean)));
}

function poemWithEditorForm(poem: Poem, form: EditorForm): Poem {
  const title = form.title.trim() || "Naamloos gedicht";
  return {
    ...poem,
    title,
    titleLower: normalizeTitle(title),
    body: form.body,
    status: form.status,
    tags: parsedTags(form.tags),
    language: form.language.trim() || undefined,
    writtenOn: form.writtenOn || undefined,
    privateNote: form.privateNote.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
}

function EditorView({
  poem,
  revisions,
  onSaved,
  onBack,
  onRecord,
  onCreate,
  onDelete,
  onRegisterFlush,
}: {
  poem?: Poem;
  revisions: Revision[];
  onSaved: (poem: Poem) => Promise<void>;
  onBack: () => void;
  onRecord: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => Promise<void>;
  onRegisterFlush: (handler?: EditorFlushHandler) => void;
}) {
  const [form, setForm] = useState<EditorForm>(() => editorFormFromPoem(poem));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [showMetadata, setShowMetadata] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const autosaveTimeoutRef = useRef<number | undefined>(undefined);
  const saveInFlightRef = useRef<Promise<boolean> | undefined>(undefined);
  const editVersionRef = useRef(0);
  const updateForm = (update: Partial<EditorForm>) => {
    editVersionRef.current += 1;
    setForm((current) => ({ ...current, ...update }));
    setSaveState("saving");
  };

  const formMatchesPoem = poem &&
    (form.title.trim() || "Naamloos gedicht") === poem.title &&
    form.body === poem.body &&
    form.status === poem.status &&
    parsedTags(form.tags).join("\u0000") === poem.tags.join("\u0000") &&
    form.language.trim() === (poem.language ?? "") &&
    form.writtenOn === (poem.writtenOn ?? "") &&
    form.privateNote.trim() === (poem.privateNote ?? "");

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = undefined;
    }
    if (saveInFlightRef.current) await saveInFlightRef.current;
    if (!poem || formMatchesPoem) return true;
    const editVersion = editVersionRef.current;
    const savePromise = (async () => {
      try {
        await onSaved(poemWithEditorForm(poem, form));
        if (editVersionRef.current === editVersion) {
          setSaveState("saved");
          setAnnouncement("Wijzigingen opgeslagen");
        } else {
          setSaveState("saving");
        }
        return true;
      } catch {
        setSaveState("error");
        setAnnouncement("Opslaan mislukt. Probeer het opnieuw.");
        return false;
      }
    })();
    saveInFlightRef.current = savePromise;
    const saved = await savePromise;
    if (saveInFlightRef.current === savePromise) saveInFlightRef.current = undefined;
    return saved;
  }, [form, formMatchesPoem, onSaved, poem]);

  useEffect(() => {
    onRegisterFlush(flushSave);
    return () => onRegisterFlush(undefined);
  }, [flushSave, onRegisterFlush]);

  useEffect(() => {
    if (!poem || formMatchesPoem) return;
    autosaveTimeoutRef.current = window.setTimeout(() => { void flushSave(); }, 800);
    return () => {
      if (autosaveTimeoutRef.current) window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = undefined;
    };
  }, [flushSave, formMatchesPoem, poem]);

  if (!poem) {
    return (
      <section className="editor-empty">
        <div className="writing-card">
          <PenLine size={30} aria-hidden />
          <p className="eyebrow">Schrijfkamer</p>
          <h1>Een lege pagina wacht</h1>
          <p>Begin met een nieuw gedicht of kies een bestaande pagina in je verzameling.</p>
          <button className="button button--primary" type="button" onClick={onCreate}>
            <Plus size={18} aria-hidden /> Nieuw gedicht
          </button>
        </div>
      </section>
    );
  }

  const createSnapshot = async () => {
    const revision: Revision = {
      id: makeId("rev"),
      poemId: poem.id,
      title: form.title.trim() || "Naamloos gedicht",
      body: form.body,
      kind: "momentopname",
      label: `Versie ${revisions.length + 1}`,
      createdAt: new Date().toISOString(),
      locked: false,
    };
    await saveRevision(revision);
    await onSaved({
      ...poemWithEditorForm(poem, form),
      activeRevisionId: revision.id,
    });
    setAnnouncement("Nieuwe versie bewaard");
  };

  const restoreRevision = (revision: Revision) => {
    updateForm({ title: revision.title, body: revision.body });
    setShowRevisions(false);
    setAnnouncement(`${revision.label} in de editor gezet. De oorspronkelijke versie blijft bewaard.`);
  };

  return (
    <div className="editor-view">
      <header className="editor-toolbar">
        <button className="icon-button" type="button" aria-label="Terug naar pagina’s" onClick={onBack}>
          <ChevronLeft size={21} aria-hidden />
        </button>
        <div className={`save-state save-state--${saveState}`} role="status">
          {saveState === "saved" && <><Check size={15} aria-hidden /> Opgeslagen</>}
          {saveState === "saving" && <><RefreshCw size={15} className="spin" aria-hidden /> Bezig met opslaan…</>}
          {saveState === "error" && <>Opslaan mislukt</>}
        </div>
        <div className="editor-toolbar__actions">
          <button className="toolbar-button" type="button" onClick={() => setShowRevisions((value) => !value)} aria-expanded={showRevisions}>
            <Layers3 size={17} aria-hidden /> <span>Versies</span>
          </button>
          <button className="toolbar-button" type="button" onClick={() => setShowMetadata((value) => !value)} aria-expanded={showMetadata}>
            <SlidersHorizontal size={17} aria-hidden /> <span>Details</span>
          </button>
          <button className="toolbar-button toolbar-button--primary" type="button" onClick={createSnapshot}>
            <Save size={17} aria-hidden /> <span>Versie bewaren</span>
          </button>
        </div>
      </header>
      <div className="editor-layout">
        <main className="writing-sheet">
          <span className="paper-tape" aria-hidden />
          <label className="sr-only" htmlFor="poem-title">Titel</label>
          <input
            id="poem-title"
            className="title-input"
            value={form.title}
            onChange={(event) => updateForm({ title: event.target.value })}
            placeholder="Titel van je gedicht"
            autoComplete="off"
          />
          <label className="sr-only" htmlFor="poem-body">Tekst van het gedicht</label>
          <textarea
            id="poem-body"
            className="poem-editor"
            value={form.body}
            onChange={(event) => updateForm({ body: event.target.value })}
            placeholder={"Schrijf de eerste regel…\n\nLaat lege regels tussen strofen."}
            spellCheck
          />
          <footer className="writing-footer">
            <span>{countWords(form.body)} woorden</span>
            <button type="button" className="text-button" onClick={() => onRecord(poem.id)}>
              <Mic size={15} aria-hidden /> Neem dit gedicht op
            </button>
          </footer>
        </main>
        {(showMetadata || showRevisions) && (
          <aside className="editor-drawer" aria-label={showRevisions ? "Versies" : "Details"}>
            <div className="drawer-header">
              <h2>{showRevisions ? "Versies" : "Details"}</h2>
              <button className="icon-button" type="button" aria-label="Sluit zijpaneel" onClick={() => { setShowMetadata(false); setShowRevisions(false); }}>
                <X size={18} aria-hidden />
              </button>
            </div>
            {showRevisions ? (
              <div className="revision-list">
                {[...revisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((revision) => (
                  <article key={revision.id} className="revision-card">
                    <div>
                      <strong>{revision.label}</strong>
                      {revision.locked && <span className="locked-label"><ShieldCheck size={12} aria-hidden /> vergrendeld</span>}
                    </div>
                    <small>{formatDate(revision.createdAt)} · {countWords(revision.body)} woorden</small>
                    <p>{excerpt(revision.body, 95)}</p>
                    <button type="button" className="text-button" onClick={() => restoreRevision(revision)}>
                      Zet in editor
                    </button>
                  </article>
                ))}
                {!revisions.length && <p className="muted">Nog geen bewaarde versies.</p>}
              </div>
            ) : (
              <div className="metadata-form">
                <label>Status
                  <select value={form.status} onChange={(event) => updateForm({ status: event.target.value as PoemStatus })}>
                    <option value="klad">Klad</option>
                    <option value="definitief">Definitief</option>
                    {poem.source === "import" && <option value="origineel">Origineel</option>}
                  </select>
                </label>
                <label>Tags <span>gescheiden door komma’s</span>
                  <input value={form.tags} onChange={(event) => updateForm({ tags: event.target.value })} placeholder="herinnering, liefde" />
                </label>
                <label>Taal
                  <input value={form.language} onChange={(event) => updateForm({ language: event.target.value })} placeholder="bijv. Nederlands" />
                </label>
                <label>Geschreven op <span>optioneel</span>
                  <input type="date" value={form.writtenOn} onChange={(event) => updateForm({ writtenOn: event.target.value })} />
                </label>
                <label>Privénotitie
                  <textarea value={form.privateNote} onChange={(event) => updateForm({ privateNote: event.target.value })} placeholder="Wat wil je bij dit gedicht onthouden?" rows={4} />
                </label>
                <div className="delete-poem-control">
                  {confirmDelete ? (
                    <div>
                      <p>Dit verwijdert ook alle versies en opnames van dit gedicht.</p>
                      <span>
                        <button type="button" onClick={() => onDelete(poem.id)}>Ja, verwijder</button>
                        <button type="button" onClick={() => setConfirmDelete(false)}>Annuleer</button>
                      </span>
                    </div>
                  ) : (
                    <button type="button" className="text-button text-button--danger" onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={15} aria-hidden /> Verwijder gedicht
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}

type RecorderState = "idle" | "requesting" | "countdown" | "recording" | "paused" | "stopping" | "review" | "error";

function supportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
}

async function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(blob);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    audio.src = url;
  });
}

function RecorderView({
  snapshot,
  selectedPoemId,
  onSelectPoem,
  onChanged,
  onEdit,
  onBusyChange,
}: {
  snapshot: LibrarySnapshot;
  selectedPoemId?: string;
  onSelectPoem: (id: string) => void;
  onChanged: () => Promise<void>;
  onEdit: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [countdown, setCountdown] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [reviewBlob, setReviewBlob] = useState<Blob>();
  const [reviewName, setReviewName] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"open" | "recorded">("open");
  const mediaRecorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const animationRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  const recordedIds = useMemo(() => new Set(snapshot.audioTakes.map((take) => take.poemId)), [snapshot.audioTakes]);
  const queue = snapshot.poems.filter((poem) => filter === "open" ? !recordedIds.has(poem.id) : recordedIds.has(poem.id));
  const selectedPoem = snapshot.poems.find((poem) => poem.id === selectedPoemId) ?? queue[0] ?? snapshot.poems[0];
  const takes = snapshot.audioTakes
    .filter((take) => take.poemId === selectedPoem?.id)
    .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred) || b.createdAt.localeCompare(a.createdAt));
  const reviewUrl = useObjectUrl(reviewBlob);
  const isBusy = !["idle", "error"].includes(state);

  useEffect(() => {
    onBusyChange(isBusy);
    return () => onBusyChange(false);
  }, [isBusy, onBusyChange]);

  const cleanupMedia = useCallback(async () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    try { await audioContextRef.current?.close(); } catch { /* already closed */ }
    audioContextRef.current = undefined;
    try { await wakeLockRef.current?.release(); } catch { /* unsupported release */ }
    wakeLockRef.current = undefined;
    if (mountedRef.current) setLevel(0);
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    void cleanupMedia();
  }, [cleanupMedia]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (isBusy) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isBusy]);

  const beginMeter = (stream: MediaStream) => {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const values = new Uint8Array(analyser.frequencyBinCount);
    audioContextRef.current = context;
    const read = () => {
      analyser.getByteFrequencyData(values);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      setLevel(Math.min(100, Math.round(average * 1.4)));
      animationRef.current = requestAnimationFrame(read);
    };
    read();
  };

  const startRecording = async () => {
    if (!selectedPoem) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Live opnemen wordt in deze browser niet ondersteund. Importeer hieronder een audiobestand.");
      setState("error");
      return;
    }
    setError("");
    setReviewBlob(undefined);
    setState("requesting");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      beginMeter(stream);
      setState("countdown");
      for (let value = 3; value > 0; value -= 1) {
        setCountdown(value);
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        if (!mountedRef.current) return;
      }
      const mimeType = supportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("error", () => {
        setError("De opname werd onderbroken. Probeer het opnieuw of importeer een audiobestand.");
        setState("error");
        void cleanupMedia();
      });
      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          setError("Er is geen geluid opgeslagen. Controleer de microfoon en probeer opnieuw.");
          setState("error");
        } else {
          setReviewBlob(blob);
          setReviewName(`Opname ${takes.length + 1}`);
          setElapsedMs(Date.now() - startedAtRef.current);
          setState("review");
        }
        void cleanupMedia();
      });
      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
      setState("recording");
      const wakeLockNavigator = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (wakeLockNavigator.wakeLock) {
        try { wakeLockRef.current = await wakeLockNavigator.wakeLock.request("screen"); } catch { /* best effort */ }
      }
    } catch (cause) {
      await cleanupMedia();
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError");
      setError(denied
        ? "Microfoontoegang is geweigerd. Geef deze site toestemming in de browserinstellingen, of importeer een audiobestand."
        : "De microfoon kon niet worden gestart. Controleer of een andere app hem gebruikt.");
      setState("error");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setState("stopping");
    recorder.stop();
  };

  const togglePause = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setState("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setState("recording");
    }
  };

  const saveReview = async () => {
    if (!reviewBlob || !selectedPoem) return;
    const measuredDuration = await audioDuration(reviewBlob);
    await saveAudioTake({
      id: makeId("take"),
      poemId: selectedPoem.id,
      name: reviewName.trim() || `Opname ${takes.length + 1}`,
      mimeType: reviewBlob.type || "audio/webm",
      durationMs: measuredDuration || elapsedMs,
      createdAt: new Date().toISOString(),
      isPreferred: takes.length === 0,
      blob: reviewBlob,
    });
    setReviewBlob(undefined);
    setState("idle");
    await onChanged();
  };

  const importAudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedPoem) return;
    const durationMs = await audioDuration(file);
    await saveAudioTake({
      id: makeId("take"),
      poemId: selectedPoem.id,
      name: file.name.replace(/\.[^.]+$/, "") || `Geïmporteerde opname ${takes.length + 1}`,
      mimeType: file.type || "audio/mpeg",
      durationMs,
      createdAt: new Date().toISOString(),
      isPreferred: takes.length === 0,
      blob: file,
    });
    await onChanged();
  };

  if (!snapshot.poems.length) {
    return (
      <section className="recorder-empty">
        <Mic size={34} aria-hidden />
        <h1>Eerst een gedicht, dan een stem</h1>
        <p>Importeer je verzameling of schrijf een nieuw gedicht om een opname te maken.</p>
      </section>
    );
  }

  return (
    <div className="recorder-view">
      <header className="section-header">
        <div>
          <p className="eyebrow">Stemmenarchief</p>
          <h1>Geef ieder gedicht een stem</h1>
          <p>{recordedIds.size} van {snapshot.poems.length} gedichten opgenomen</p>
        </div>
        <PaperStamp tone="rust">{Math.round((recordedIds.size / snapshot.poems.length) * 100)}%<br />ingesproken</PaperStamp>
      </header>
      <div className="progress-track" aria-label={`${recordedIds.size} van ${snapshot.poems.length} opgenomen`}>
        <span style={{ width: `${(recordedIds.size / snapshot.poems.length) * 100}%` }} />
      </div>
      <div className="recorder-layout">
        <aside className="recording-queue">
          <div className="tab-row">
            <button type="button" className={filter === "open" ? "is-active" : ""} onClick={() => setFilter("open")}>Nog te doen</button>
            <button type="button" className={filter === "recorded" ? "is-active" : ""} onClick={() => setFilter("recorded")}>Opgenomen</button>
          </div>
          <label className="select-label">Gedicht
            <select value={selectedPoem?.id} onChange={(event) => onSelectPoem(event.target.value)}>
              {snapshot.poems.map((poem) => <option key={poem.id} value={poem.id}>{poem.title}</option>)}
            </select>
          </label>
          <div className="queue-list">
            {queue.slice(0, 50).map((poem) => (
              <button type="button" key={poem.id} className={selectedPoem?.id === poem.id ? "is-selected" : ""} onClick={() => onSelectPoem(poem.id)}>
                <span>{poem.collectionIndex ? String(poem.collectionIndex).padStart(3, "0") : "N"}</span>
                <strong>{poem.title}</strong>
                {recordedIds.has(poem.id) ? <Check size={15} aria-label="Opgenomen" /> : <Mic size={15} aria-label="Nog opnemen" />}
              </button>
            ))}
            {!queue.length && <p className="queue-complete">{filter === "open" ? "Alles heeft een stem." : "Nog geen opnames."}</p>}
          </div>
        </aside>
        <main className="recording-studio">
          {selectedPoem && (
            <>
              <article className="recording-poem">
                <span className="paper-tape" aria-hidden />
                <div className="collection-index">Opnameblad / {selectedPoem.collectionIndex ?? "nieuw"}</div>
                <h2>{selectedPoem.title}</h2>
                <div className="poem-text">{selectedPoem.body || "Nog geen tekst."}</div>
                <button className="text-button" type="button" onClick={() => onEdit(selectedPoem.id)}><PenLine size={14} aria-hidden /> Tekst bewerken</button>
              </article>
              <section className="recorder-controls" aria-labelledby="recorder-controls-title">
                <h2 id="recorder-controls-title" className="sr-only">Opnamebediening</h2>
                {state === "countdown" && <div className="countdown" role="status">{countdown}</div>}
                {(state === "recording" || state === "paused" || state === "stopping") && (
                  <>
                    <div className="recording-status" role="status">
                      <span className="recording-dot" />
                      {state === "paused" ? "Gepauzeerd" : state === "stopping" ? "Opname afronden…" : "Opname loopt"}
                    </div>
                    <div className="recording-timer">{formatDuration(elapsedMs)}</div>
                    <div className="input-meter" style={{ "--level": `${level}%` } as CSSProperties} aria-label={`Microfoonniveau ${level} procent`}>
                      <span />
                    </div>
                    <div className="record-actions">
                      <button className="round-button round-button--secondary" type="button" onClick={togglePause} disabled={state === "stopping"} aria-label={state === "paused" ? "Hervat opname" : "Pauzeer opname"}>
                        {state === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
                      </button>
                      <button className="round-button round-button--stop" type="button" onClick={stopRecording} disabled={state === "stopping"} aria-label="Stop opname">
                        <Square aria-hidden />
                      </button>
                    </div>
                  </>
                )}
                {(state === "idle" || state === "error" || state === "requesting") && (
                  <>
                    <button className="record-button" type="button" onClick={startRecording} disabled={state === "requesting"}>
                      <Mic size={28} aria-hidden />
                      <span>{state === "requesting" ? "Microfoon openen…" : "Start opname"}</span>
                    </button>
                    <p className="record-hint">Na toestemming telt de app drie seconden af.</p>
                  </>
                )}
                {state === "review" && reviewBlob && (
                  <div className="review-recording">
                    <h3>Luister je opname terug</h3>
                    {/* The selected poem above is the transcript for this audio. */}
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls src={reviewUrl} />
                    <label>Naam van deze take
                      <input value={reviewName} onChange={(event) => setReviewName(event.target.value)} />
                    </label>
                    <div className="button-row">
                      <button className="button button--primary" type="button" onClick={saveReview}><Save size={17} aria-hidden /> Bewaar take</button>
                      <button className="button button--ghost" type="button" onClick={() => { setReviewBlob(undefined); setState("idle"); }}>Opnieuw</button>
                    </div>
                  </div>
                )}
                {error && <div className="inline-error" role="alert"><Info size={18} aria-hidden /><span>{error}</span></div>}
                <input ref={fileInputRef} className="sr-only" type="file" accept="audio/*" onChange={importAudio} />
                <button className="text-button import-audio" type="button" onClick={() => fileInputRef.current?.click()} disabled={state === "recording" || state === "paused"}>
                  <FileAudio size={16} aria-hidden /> Audiobestand importeren
                </button>
              </section>
              <section className="takes-section">
                <div className="subsection-title"><div><p className="eyebrow">Bewaarde takes</p><h2>{takes.length} {takes.length === 1 ? "opname" : "opnames"}</h2></div></div>
                <div className="takes-list">
                  {takes.map((take) => (
                    <TakeRow key={take.id} take={take} onChanged={onChanged} />
                  ))}
                  {!takes.length && <p className="muted">Nog geen takes voor dit gedicht.</p>}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function TakeRow({ take, onChanged }: { take: AudioTake; onChanged: () => Promise<void> }) {
  const url = useObjectUrl(take.blob);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(take.name);
  const exportTake = () => {
    const extension = take.mimeType.includes("ogg") ? "ogg" : take.mimeType.includes("mp4") ? "m4a" : take.mimeType.includes("mpeg") ? "mp3" : "webm";
    downloadBlob(take.blob, `${take.name}.${extension}`);
  };
  return (
    <article className="take-row">
      <div className="take-row__main">
        {/* The associated poem in the recording studio is the transcript. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls preload="metadata" src={url} aria-label={`Speel ${take.name}`} />
        <div>
          {renaming ? (
            <span className="take-name-editor">
              <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Naam van opname" />
              <button type="button" disabled={!name.trim()} onClick={async () => { await renameTake(take.id, name); setRenaming(false); await onChanged(); }}><Check size={15} aria-hidden /> Bewaar</button>
            </span>
          ) : <strong>{take.name}</strong>}
          <small>{formatDate(take.createdAt)} · {formatDuration(take.durationMs)}</small>
        </div>
        {take.isPreferred && <PaperStamp tone="rust">Voorkeur</PaperStamp>}
      </div>
      <div className="take-row__actions">
        {!take.isPreferred && <button type="button" className="text-button" onClick={async () => { await setPreferredTake(take.poemId, take.id); await onChanged(); }}><Star size={14} aria-hidden /> Maak voorkeur</button>}
        <button type="button" className="text-button" onClick={() => setRenaming((value) => !value)}><FilePenLine size={14} aria-hidden /> Hernoem</button>
        <button type="button" className="icon-button" onClick={exportTake} aria-label={`Exporteer ${take.name}`}><Download size={16} aria-hidden /></button>
        {confirmDelete ? (
          <span className="inline-confirm"><button type="button" onClick={async () => { await deleteTake(take.id); await onChanged(); }}>Verwijder</button><button type="button" onClick={() => setConfirmDelete(false)}>Annuleer</button></span>
        ) : (
          <button type="button" className="icon-button icon-button--danger" onClick={() => setConfirmDelete(true)} aria-label={`Verwijder ${take.name}`}><Trash2 size={16} aria-hidden /></button>
        )}
      </div>
    </article>
  );
}

function ManageView({
  snapshot,
  storage,
  lastBackupAt,
  lastChangedAt,
  onPersist,
  onBackup,
  onImport,
  onWipe,
  installPrompt,
  onInstall,
}: {
  snapshot: LibrarySnapshot;
  storage: StorageHealth;
  lastBackupAt?: string;
  lastChangedAt?: string;
  onPersist: () => void;
  onBackup: () => void;
  onImport: () => void;
  onWipe: () => void;
  installPrompt?: BeforeInstallPromptEvent;
  onInstall: () => void;
}) {
  const changedSinceBackup = !!lastChangedAt && (!lastBackupAt || lastChangedAt > lastBackupAt);
  return (
    <div className="manage-view">
      <header className="section-header">
        <div><p className="eyebrow">Beheer & back-up</p><h1>Op dit apparaat</h1><p>Controle over je privéarchief, zonder account of automatische upload.</p></div>
        <PaperStamp>{storage.persisted ? "Duurzame\nopslag" : "Lokaal\narchief"}</PaperStamp>
      </header>
      {changedSinceBackup && (
        <div className="backup-warning"><Info size={19} aria-hidden /><div><strong>Wijzigingen sinds je laatste back-up</strong><span>Maak een nieuwe ZIP zodat teksten en opnames niet alleen in deze browser staan.</span></div><button type="button" onClick={onBackup}>Maak back-up</button></div>
      )}
      <section className="stats-grid" aria-label="Archiefstatistieken">
        <article><span>Gedichten</span><strong>{snapshot.poems.length}</strong></article>
        <article><span>Versies</span><strong>{snapshot.revisions.length}</strong></article>
        <article><span>Opnames</span><strong>{snapshot.audioTakes.length}</strong></article>
        <article><span>Gebruikte opslag</span><strong>{formatBytes(storage.usage)}</strong><small>van {formatBytes(storage.quota)}</small></article>
      </section>
      <div className="manage-grid">
        <section className="manage-card">
          <div className="manage-card__icon"><ShieldCheck aria-hidden /></div>
          <div><p className="eyebrow">Opslagstatus</p><h2>{storage.persisted === true ? "Duurzame opslag actief" : storage.persisted === false ? "Kan door de browser worden opgeruimd" : "Opslagstatus onbekend"}</h2></div>
          <p>{storage.persisted ? "De browser heeft toegezegd je lokale archief niet automatisch op te ruimen." : "Vraag duurzame opslag aan en bewaar daarnaast altijd een ZIP-back-up op een veilige plek."}</p>
          {!storage.persisted && storage.supported && <button className="button button--secondary" type="button" onClick={onPersist}>Vraag duurzame opslag aan</button>}
        </section>
        <section className="manage-card">
          <div className="manage-card__icon"><FileArchive aria-hidden /></div>
          <div><p className="eyebrow">Complete back-up</p><h2>Teksten, versies én audio</h2></div>
          <p>De ZIP is leesbaar buiten de app en bevat controlesommen om beschadiging te herkennen.</p>
          <button className="button button--primary" type="button" onClick={onBackup} disabled={!snapshot.poems.length}><Download size={17} aria-hidden /> Maak complete ZIP-back-up</button>
          <small>{lastBackupAt ? `Laatste back-up: ${formatDate(lastBackupAt)} om ${formatTime(lastBackupAt)}` : "Nog geen back-up geregistreerd"}</small>
        </section>
        <section className="manage-card">
          <div className="manage-card__icon"><ArchiveRestore aria-hidden /></div>
          <div><p className="eyebrow">Importeren & herstellen</p><h2>Breng een archief terug</h2></div>
          <p>Open de voorbereide gedichtenbundel of herstel een eerder gemaakte ZIP. Je ziet eerst een controleoverzicht.</p>
          <button className="button button--secondary" type="button" onClick={onImport}><Upload size={17} aria-hidden /> Kies import of back-up</button>
        </section>
        <section className="manage-card">
          <div className="manage-card__icon"><Download aria-hidden /></div>
          <div><p className="eyebrow">Installeren</p><h2>Als app op je beginscherm</h2></div>
          <p>{installPrompt ? "Installeer de PWA voor een eigen pictogram en snelle offline toegang." : "Gebruik in het browsermenu ‘Toevoegen aan beginscherm’ als de installatieknop niet verschijnt."}</p>
          {installPrompt && <button className="button button--secondary" type="button" onClick={onInstall}>Installeer Verzamelde pagina’s</button>}
        </section>
      </div>
      <section className="privacy-panel">
        <WifiOff size={22} aria-hidden />
        <div><h2>Ontworpen voor privégebruik</h2><p>De app heeft geen account, analytics, advertenties, externe lettertypen of automatische cloudsynchronisatie. Je browserprofiel en apparaatbeveiliging beschermen de lokale inhoud; een ZIP-back-up beschermt tegen verlies.</p></div>
      </section>
      <details className="danger-zone">
        <summary>Gevarenzone</summary>
        <div><h2>Wis het lokale archief</h2><p>Dit verwijdert alle gedichten, versies en opnames uit deze browser. Dit kan alleen worden hersteld met een back-up.</p><button className="button button--danger" type="button" onClick={onWipe}><Trash2 size={17} aria-hidden /> Lokaal archief wissen</button></div>
      </details>
    </div>
  );
}

function ImportDialog({
  report,
  existingIds,
  onCancel,
  onImport,
}: {
  report: ImportReport;
  existingIds: Set<string>;
  onCancel: () => void;
  onImport: (mode: "merge" | "replace") => void;
}) {
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const duplicates = report.payload.poems.filter((poem) => existingIds.has(poem.id)).length;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
        <button className="dialog-close icon-button" type="button" aria-label="Sluit" onClick={onCancel}><X size={19} aria-hidden /></button>
        <p className="eyebrow">Bestand gecontroleerd</p>
        <h2 id="import-dialog-title">Klaar om te {report.kind === "backup" ? "herstellen" : "importeren"}</h2>
        <div className="import-receipt">
          <span><strong>{report.poemCount}</strong> gedichten</span>
          <span><strong>{report.revisionCount}</strong> versies</span>
          <span><strong>{report.audioCount}</strong> opnames</span>
          <span><strong>{duplicates}</strong> bekende id’s</span>
        </div>
        {report.warnings.length > 0 && <div className="inline-warning">{report.warnings.join(" ")}</div>}
        {report.kind === "backup" && (
          <fieldset className="restore-options">
            <legend>Hoe wil je herstellen?</legend>
            <label><input type="radio" name="restore-mode" value="merge" checked={mode === "merge"} onChange={() => setMode("merge")} /><span><strong>Samenvoegen</strong> Bestaande id’s worden bijgewerkt; overige inhoud blijft staan.</span></label>
            <label><input type="radio" name="restore-mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} /><span><strong>Alles vervangen</strong> Het huidige lokale archief wordt eerst gewist.</span></label>
          </fieldset>
        )}
        <p className="dialog-note"><ShieldCheck size={16} aria-hidden /> Geïmporteerde originelen blijven als vergrendelde versie bewaard.</p>
        <div className="button-row">
          <button className="button button--primary" type="button" onClick={() => onImport(mode)}>{report.kind === "backup" ? "Herstel archief" : "Importeer verzameling"}</button>
          <button className="button button--ghost" type="button" onClick={onCancel}>Annuleer</button>
        </div>
      </section>
    </div>
  );
}

function WipeDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="wipe-title">
        <p className="eyebrow eyebrow--danger">Onomkeerbare stap</p>
        <h2 id="wipe-title">Wis het volledige lokale archief?</h2>
        <p>Typ <strong>WISSEN</strong> om alle gedichten, versies en opnames uit deze browser te verwijderen.</p>
        <label className="confirm-field">Bevestiging<input value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <div className="button-row"><button className="button button--danger" type="button" disabled={value !== "WISSEN"} onClick={onConfirm}>Wis alles</button><button className="button button--ghost" type="button" onClick={onCancel}>Annuleer</button></div>
      </section>
    </div>
  );
}

export default function PoetryApp() {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>("library");
  const [selectedId, setSelectedId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [recordingPoemId, setRecordingPoemId] = useState<string>();
  const [toast, setToast] = useState<ToastState>();
  const [importReport, setImportReport] = useState<ImportReport>();
  const [showWipe, setShowWipe] = useState(false);
  const [storage, setStorage] = useState<StorageHealth>({ supported: false });
  const [lastBackupAt, setLastBackupAt] = useState<string>();
  const [lastChangedAt, setLastChangedAt] = useState<string>();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>();
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker>();
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorFlushRef = useRef<EditorFlushHandler | undefined>(undefined);
  const navigationInFlightRef = useRef(false);
  const updateActivationRequestedRef = useRef(false);
  const dismissedUpdateRef = useRef<ServiceWorker | undefined>(undefined);

  const refresh = useCallback(async () => {
    const next = await loadSnapshot();
    setSnapshot(next);
    setLastBackupAt(await getSetting<string>("lastBackupAt"));
    setLastChangedAt(await getSetting<string>("lastChangedAt"));
    setSelectedId((current) => current ?? next.poems[0]?.id);
  }, []);

  const refreshStorage = useCallback(async () => {
    if (!navigator.storage) return setStorage({ supported: false });
    const [estimate, persisted] = await Promise.all([
      navigator.storage.estimate().catch(() => ({} as StorageEstimate)),
      navigator.storage.persisted?.().catch(() => undefined),
    ]);
    setStorage({ supported: typeof navigator.storage.persist === "function", usage: estimate.usage, quota: estimate.quota, persisted });
  }, []);

  const registerEditorFlush = useCallback((handler?: EditorFlushHandler) => {
    editorFlushRef.current = handler;
  }, []);

  const flushEditor = useCallback(async (): Promise<boolean> => {
    return editorFlushRef.current ? editorFlushRef.current() : true;
  }, []);

  const completeViewChange = useCallback((nextView: AppView, prepare?: () => void) => {
    prepare?.();
    setView(nextView);
    resetPageScroll();
    window.requestAnimationFrame(() => resetPageScroll());
  }, []);

  const navigateTo = useCallback((nextView: AppView, prepare?: () => void) => {
    if (navigationInFlightRef.current) return;
    navigationInFlightRef.current = true;
    void (async () => {
      try {
        if (recordingBusy && nextView !== view) {
          setToast({ tone: "info", message: "Rond de lopende of nog niet bewaarde opname eerst af." });
          return;
        }
        if (!await flushEditor()) {
          setToast({ tone: "error", message: "De laatste schrijfwijzigingen konden niet worden opgeslagen. Je blijft daarom op deze pagina." });
          return;
        }
        completeViewChange(nextView, prepare);
      } finally {
        navigationInFlightRef.current = false;
      }
    })();
  }, [completeViewChange, flushEditor, recordingBusy, view]);

  const handleEditorSaved = useCallback(async (poem: Poem) => {
    await savePoem(poem);
    await refresh();
  }, [refresh]);

  const handleShare = useCallback(async (title: string, body: string) => {
    try {
      const outcome = await shareWholePoem({ title, body });
      if (outcome === "shared") setToast({ tone: "success", message: "Het volledige gedicht is gedeeld." });
      if (outcome === "copied") setToast({ tone: "info", message: "Delen wordt hier niet ondersteund; het volledige gedicht is gekopieerd." });
    } catch (cause) {
      setToast({ tone: "error", message: cause instanceof Error ? cause.message : "Delen lukte niet." });
    }
  }, []);

  const handleCopy = useCallback(async (title: string, body: string) => {
    try {
      await copyWholePoem({ title, body });
      setToast({ tone: "success", message: "Het volledige gedicht is gekopieerd." });
    } catch (cause) {
      setToast({ tone: "error", message: cause instanceof Error ? cause.message : "Kopiëren lukte niet." });
    }
  }, []);

  useEffect(() => {
    // IndexedDB and Storage Manager are external systems initialized on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([refresh(), refreshStorage()]).finally(() => setLoading(false));
  }, [refresh, refreshStorage]);

  useEffect(() => {
    return installPageTopReset();
  }, []);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "write" || requestedView === "record" || requestedView === "manage") {
      const timeout = window.setTimeout(() => completeViewChange(requestedView), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [completeViewChange]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let disposeMonitor: (() => void) | undefined;
    void monitorPwaUpdates({
      onUpdateReady: (worker) => {
        if (!disposed && dismissedUpdateRef.current !== worker) setUpdateWorker(worker);
      },
      onControllerChange: () => {
        if (updateActivationRequestedRef.current) window.location.reload();
      },
    }).then((monitor) => {
      if (disposed) monitor.dispose();
      else disposeMonitor = monitor.dispose;
    }).catch(() => {
      if (!disposed) setToast({ tone: "info", message: "Offline installatie kon niet worden voorbereid." });
    });
    return () => {
      disposed = true;
      disposeMonitor?.();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 4_500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const createNewPoem = async () => {
    if (!await flushEditor()) {
      setToast({ tone: "error", message: "De laatste schrijfwijzigingen konden niet worden opgeslagen." });
      return;
    }
    const now = new Date().toISOString();
    const poem: Poem = {
      id: makeId("poem"),
      title: "Naamloos gedicht",
      titleLower: normalizeTitle("Naamloos gedicht"),
      body: "",
      status: "klad",
      source: "geschreven",
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    await savePoem(poem);
    setEditingId(poem.id);
    setSelectedId(poem.id);
    completeViewChange("write");
    await refresh();
  };

  const openEditor = (id: string) => navigateTo("write", () => setEditingId(id));
  const openRecorder = (id: string) => navigateTo("record", () => setRecordingPoemId(id));

  const chooseFile = () => fileInputRef.current?.click();
  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const report = await inspectImportFile(file);
      setImportReport(report);
    } catch (cause) {
      setToast({ tone: "error", message: cause instanceof Error ? cause.message : "Importeren mislukt." });
    }
  };
  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await handleFile(file);
  };

  const finishImport = async (mode: "merge" | "replace") => {
    if (!importReport) return;
    try {
      if (!await flushEditor()) throw new Error("De laatste schrijfwijzigingen konden niet worden opgeslagen. Het importeren is niet gestart.");
      const result = await importSnapshot(importReport.payload, mode);
      setImportReport(undefined);
      await refresh();
      await refreshStorage();
      completeViewChange("library");
      setSelectedId(importReport.payload.poems[0]?.id);
      setToast({ tone: "success", message: `${importReport.poemCount} gedichten gecontroleerd en opgeslagen${result.duplicates ? `; ${result.duplicates} bestaande id’s bijgewerkt` : ""}. Maak nu een back-up.` });
    } catch (cause) {
      setToast({ tone: "error", message: cause instanceof Error ? cause.message : "Importeren mislukt." });
    }
  };

  const makeBackup = async () => {
    try {
      setToast({ tone: "info", message: "Back-up wordt samengesteld. Grote opnames kunnen even duren…" });
      const result = await createBackup(snapshot);
      downloadBlob(result.blob, result.filename);
      const now = new Date().toISOString();
      await setSetting("lastBackupAt", now);
      setLastBackupAt(now);
      setToast({ tone: "success", message: "De complete ZIP-back-up is gedownload." });
    } catch (cause) {
      setToast({ tone: "error", message: cause instanceof Error ? cause.message : "Back-up maken mislukt." });
    }
  };

  const requestPersistence = async () => {
    try {
      const persisted = await navigator.storage.persist();
      await refreshStorage();
      setToast({ tone: persisted ? "success" : "info", message: persisted ? "Duurzame opslag is actief." : "De browser heeft duurzame opslag niet toegekend. Blijf ZIP-back-ups maken." });
    } catch {
      setToast({ tone: "error", message: "De opslagstatus kon niet worden aangepast." });
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(undefined);
  };

  const applyPreparedUpdate = async () => {
    if (!updateWorker || applyingUpdate) return;
    if (recordingBusy) {
      setToast({ tone: "info", message: "Rond de opname eerst af; daarna kan de app veilig worden bijgewerkt." });
      return;
    }
    if (!await flushEditor()) {
      setToast({ tone: "error", message: "Bijwerken is uitgesteld omdat de laatste schrijfwijzigingen niet konden worden opgeslagen." });
      return;
    }
    updateActivationRequestedRef.current = true;
    setApplyingUpdate(true);
    updateWorker.postMessage({ type: "SKIP_WAITING" });
  };

  const activePoem = snapshot.poems.find((poem) => poem.id === editingId);
  const activeRevisions = snapshot.revisions.filter((revision) => revision.poemId === editingId);

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="brand-mark" aria-hidden><span /><span /><span>V</span></div>
        <p className="eyebrow">Verzamelde pagina’s</p>
        <h1>Je privéarchief wordt geopend</h1>
        <div className="loading-line" role="status"><span /></div>
      </main>
    );
  }

  return (
    <div
      className="app-shell"
      onDragOver={(event: DragEvent) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event: DragEvent) => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]); }}
    >
      <input ref={fileInputRef} className="sr-only" type="file" accept=".json,.zip,application/json,application/zip" onChange={handleFileInput} />
      <aside className="app-sidebar">
        <button className="brand" type="button" onClick={() => navigateTo("library")} aria-label="Naar mijn gedichten">
          <span className="brand-mark" aria-hidden><span /><span /><span>V</span></span>
          <span><strong>Verzamelde</strong><small>pagina’s</small></span>
        </button>
        <nav className="desktop-nav" aria-label="Hoofdnavigatie">
          {navigation.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" className={view === item.id ? "is-active" : ""} onClick={() => navigateTo(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon size={20} aria-hidden /><span>{item.label}</span></button>;
          })}
        </nav>
        <div className="sidebar-footer">
          <span>{snapshot.poems.length} pagina’s</span>
          <span>{snapshot.audioTakes.length} opnames</span>
          <button type="button" onClick={chooseFile}><Import size={15} aria-hidden /> Importeren</button>
        </div>
      </aside>
      <header className="mobile-header">
        <button className="brand" type="button" onClick={() => navigateTo("library")} aria-label="Naar mijn gedichten">
          <span className="brand-mark" aria-hidden><span /><span /><span>V</span></span>
          <span><strong>Verzamelde pagina’s</strong><small>privéarchief</small></span>
        </button>
        <button className="icon-button" type="button" aria-label="Importeren en back-up" onClick={() => navigateTo("manage")}><MoreHorizontal size={22} aria-hidden /></button>
      </header>
      <main className="app-main">
        {view === "library" && <LibraryView snapshot={snapshot} selectedId={selectedId} onSelect={setSelectedId} onEdit={openEditor} onRecord={openRecorder} onNew={createNewPoem} onImport={chooseFile} onShare={handleShare} onCopy={handleCopy} />}
        {view === "write" && <EditorView key={editingId ?? "empty-editor"} poem={activePoem} revisions={activeRevisions} onSaved={handleEditorSaved} onBack={() => navigateTo("library")} onRecord={openRecorder} onCreate={createNewPoem} onRegisterFlush={registerEditorFlush} onDelete={async (id) => { await deletePoem(id); editorFlushRef.current = undefined; setEditingId(undefined); setSelectedId(undefined); await refresh(); completeViewChange("library"); setToast({ tone: "success", message: "Het gedicht en de gekoppelde versies en opnames zijn verwijderd." }); }} />}
        {view === "record" && <RecorderView snapshot={snapshot} selectedPoemId={recordingPoemId} onSelectPoem={(id) => { if (recordingBusy) setToast({ tone: "info", message: "Rond deze opname eerst af." }); else setRecordingPoemId(id); }} onChanged={async () => { await refresh(); await refreshStorage(); }} onEdit={openEditor} onBusyChange={setRecordingBusy} />}
        {view === "manage" && <ManageView snapshot={snapshot} storage={storage} lastBackupAt={lastBackupAt} lastChangedAt={lastChangedAt} onPersist={requestPersistence} onBackup={makeBackup} onImport={chooseFile} onWipe={() => setShowWipe(true)} installPrompt={installPrompt} onInstall={installApp} />}
      </main>
      <nav className="mobile-nav" aria-label="Hoofdnavigatie">
        {navigation.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" className={view === item.id ? "is-active" : ""} onClick={() => navigateTo(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon size={21} aria-hidden /><span>{item.shortLabel}</span></button>;
        })}
      </nav>
      {updateWorker && <div className="update-banner" role="status"><span>{applyingUpdate ? "De app wordt veilig bijgewerkt…" : recordingBusy ? "Nieuwe versie klaar; rond eerst je opname af." : "Een nieuwe versie van de app staat klaar."}</span><button type="button" disabled={applyingUpdate || recordingBusy} onClick={() => void applyPreparedUpdate()}>{applyingUpdate ? "Bijwerken…" : "Werk nu bij"}</button><button className="icon-button" type="button" aria-label="Later" disabled={applyingUpdate} onClick={() => { dismissedUpdateRef.current = updateWorker; setUpdateWorker(undefined); }}><X size={16} aria-hidden /></button></div>}
      {toast && <div className={`toast toast--${toast.tone ?? "info"}`} role={toast.tone === "error" ? "alert" : "status"}>{toast.tone === "success" ? <Check size={18} aria-hidden /> : <Info size={18} aria-hidden />}<span>{toast.message}</span><button className="icon-button" type="button" aria-label="Sluit melding" onClick={() => setToast(undefined)}><X size={16} aria-hidden /></button></div>}
      {importReport && <ImportDialog report={importReport} existingIds={new Set(snapshot.poems.map((poem) => poem.id))} onCancel={() => setImportReport(undefined)} onImport={finishImport} />}
      {showWipe && <WipeDialog onCancel={() => setShowWipe(false)} onConfirm={async () => { await clearLibrary(); setShowWipe(false); setSelectedId(undefined); setEditingId(undefined); setRecordingPoemId(undefined); await refresh(); await refreshStorage(); completeViewChange("library"); setToast({ tone: "success", message: "Het lokale archief is gewist." }); }} />}
    </div>
  );
}
