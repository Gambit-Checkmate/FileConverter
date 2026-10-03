import { useState } from "react";
import {
  ArrowLeftRight,
  Library,
  Search,
  Plus,
  FolderOpen,
  Trash2,
  Check,
  Copy,
  ArrowRight,
  FileText,
  X,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function basename(file: string) {
  return file.split(/[\\/]/).filter(Boolean).pop() || file;
}
export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <ArrowLeftRight />
    </span>
  );
}
export function presetTitle(preset: Preset) {
  const titles: Record<string, string> = {
    "image/original": "Original quality",
    "image/print": "Print ready",
    "image/social": "Social media",
    "image/thumbnail": "Thumbnails",
    "image/web": "Web optimized",
    "pdf/ebook": "E-book PDF",
    "pdf/prepress": "Press ready",
    "pdf/printer": "Print PDF",
    "pdf/screen": "Screen optimized",
  };
  return preset.scope === "builtin"
    ? titles[preset.name] || preset.name
    : preset.name;
}
type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };
function parameterLabel(key: string) {
  return (
    (
      {
        quality: "Quality",
        maxWidth: "Max width",
        maxHeight: "Max height",
        stripMetadata: "Remove metadata",
        language: "Language",
        concurrency: "Parallel jobs",
        retries: "Retries",
        dpi: "DPI",
        pages: "Pages",
        operation: "Operation",
      } as Record<string, string>
    )[key] || key
  );
}
export function PresetLibrary({
  open,
  onOpenChange,
  presets,
  projectDirectory,
  busy,
  onProject,
  onRefresh,
  onUse,
  onDeleteSelected,
}: OpenProps & {
  presets: Preset[];
  projectDirectory?: string;
  busy: boolean;
  onProject: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onUse: (preset: Preset) => void;
  onDeleteSelected: () => void;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("image");
  const [saveScope, setSaveScope] = useState("global");
  const [parameters, setParameters] = useState(
    "quality=85;maxWidth=1920;stripMetadata=true",
  );
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [removing, setRemoving] = useState<Preset | null>(null);
  async function perform(work: () => Promise<void>) {
    setError("");
    setWorking(true);
    try {
      await work();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setWorking(false);
    }
  }
  const filtered = presets.filter(
    (p) =>
      (scope === "all" || p.scope === scope) &&
      `${presetTitle(p)} ${p.name} ${p.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="library-sheet sm:max-w-[520px]">
        <SheetHeader>
          <div className="eyebrow">YOUR CONVERSION SHORTCUTS</div>
          <SheetTitle className="panel-dialog-title">Preset library</SheetTitle>
          <SheetDescription>
            Consistent results, without setting up every time.
          </SheetDescription>
        </SheetHeader>
        <div className="sheet-body">
          {error && (
            <div className="message error" role="alert">
              <CircleAlert />
              <span>{error}</span>
            </div>
          )}
          <div className="library-toolbar">
            <div className="search-field">
              <Search />
              <Input
                aria-label="Search presets"
                placeholder="Search presets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={busy || working}
              onClick={() => {
                setCreating(!creating);
                setError("");
              }}
            >
              {creating ? <X /> : <Plus />}
              {creating ? "Cancel" : "New preset"}
            </Button>
          </div>
          {creating && (
            <form
              className="preset-editor"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  await window.fileConverter.request("presets:create", {
                    name,
                    description,
                    type,
                    scope: saveScope,
                    parameters,
                    projectDirectory,
                  });
                  await onRefresh();
                  setCreating(false);
                  setName("");
                  setDescription("");
                });
              }}
            >
              <h3>Create a preset</h3>
              <div className="settings-grid">
                <label>
                  Name
                  <Input
                    required
                    placeholder="e.g. web-images"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Type
                  <NativeSelect
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setParameters(
                        e.target.value === "image"
                          ? "quality=85;maxWidth=1920;stripMetadata=true"
                          : "",
                      );
                    }}
                  >
                    <option value="image">Image</option>
                    <option value="pdf">PDF</option>
                    <option value="document">Document</option>
                  </NativeSelect>
                </label>
              </div>
              <label>
                Description
                <Input
                  required
                  placeholder="What is this preset for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label>
                Save in
                <NativeSelect
                  value={saveScope}
                  onChange={(e) => setSaveScope(e.target.value)}
                >
                  <option value="global">
                    Global library · available in CLI
                  </option>
                  <option value="local" disabled={!projectDirectory}>
                    Current project
                  </option>
                </NativeSelect>
              </label>
              <label>
                Conversion parameters
                <Input
                  className="mono"
                  placeholder="quality=85;maxWidth=1920"
                  value={parameters}
                  onChange={(e) => setParameters(e.target.value)}
                />
                <span className="field-hint">
                  Use key=value pairs separated by semicolons. Blank settings
                  use defaults.
                </span>
              </label>
              <Button type="submit" disabled={busy || working}>
                <Check />
                {working ? "Saving…" : "Save preset"}
              </Button>
            </form>
          )}
          <div
            className="library-tabs scope-filter"
            role="group"
            aria-label="Filter preset library"
          >
            {[
              ["all", "All"],
              ["builtin", "Built-in"],
              ["global", "Global"],
              ["local", "Project"],
            ].map(([value, label]) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {scope === "local" && (
            <div className="project-selection">
              <FolderOpen />
              <div>
                <strong>
                  {projectDirectory
                    ? basename(projectDirectory)
                    : "Choose a project"}
                </strong>
                <p>
                  {projectDirectory || "Load presets from a project folder."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || working}
                onClick={() => void perform(onProject)}
              >
                {projectDirectory ? "Change" : "Choose"}
              </Button>
            </div>
          )}
          <div className="preset-list">
            {filtered.map((preset) => (
              <article
                className="preset-card"
                key={`${preset.scope}:${preset.name}`}
              >
                <div className="preset-card-header">
                  <div className="preset-icon">
                    <Library />
                  </div>
                  <div>
                    <h3>{presetTitle(preset)}</h3>
                    <Badge variant="outline">
                      {preset.scope === "builtin"
                        ? "Built-in"
                        : preset.scope === "local"
                          ? "Project"
                          : "Global"}
                    </Badge>
                  </div>
                </div>
                <p>{preset.description}</p>
                <div className="parameter-chips">
                  {Object.entries(preset.parameters).map(([key, value]) => (
                    <span key={key}>
                      {parameterLabel(key)}{" "}
                      <strong>
                        {typeof value === "boolean"
                          ? value
                            ? "On"
                            : "Off"
                          : String(value)}
                      </strong>
                    </span>
                  ))}
                </div>
                <div className="preset-card-actions">
                  <span>{preset.type}</span>
                  <div>
                    {preset.scope !== "builtin" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete preset ${preset.name}`}
                        disabled={busy || working}
                        onClick={() => setRemoving(preset)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || working}
                      onClick={() => onUse(preset)}
                    >
                      Use preset
                      <ArrowRight />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
            {!filtered.length && (
              <div className="library-empty">
                <Library />
                <h3>
                  {search ? "No matching presets" : "No presets here yet"}
                </h3>
                <p>
                  {search
                    ? "Try a different name or description."
                    : scope === "local" && !projectDirectory
                      ? "Select a project folder to load its presets."
                      : "Create a preset to keep your favorite settings."}
                </p>
              </div>
            )}
          </div>
          <div className="project-footer">
            <FolderOpen />
            <span>
              {projectDirectory
                ? `Project: ${basename(projectDirectory)}`
                : "Working with global presets"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || working}
              onClick={() => void perform(onProject)}
            >
              Select project
            </Button>
          </div>
        </div>
        <AlertDialog
          open={!!removing}
          onOpenChange={(value) => {
            if (!value) setRemoving(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{removing?.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the preset from your{" "}
                {removing?.scope === "local" ? "project" : "global library"}.
                Your converted files are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep preset</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const preset = removing;
                  if (preset)
                    void perform(async () => {
                      await window.fileConverter.request("presets:delete", {
                        name: preset.name,
                        scope: preset.scope,
                        projectDirectory,
                      });
                      onDeleteSelected();
                      await onRefresh();
                      setRemoving(null);
                    });
                }}
              >
                Delete preset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
export function FormatReference({
  open,
  onOpenChange,
  info,
}: OpenProps & { info: AppInfo | null }) {
  const [search, setSearch] = useState("");
  const groups = new Map<string, AppInfo["conversions"]>();
  for (const pair of info?.conversions || []) {
    const pairs = groups.get(pair.inputFormat) || [];
    pairs.push(pair);
    groups.set(pair.inputFormat, pairs);
  }
  const filtered = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([input, pairs]) =>
      `${input} ${pairs.map((p) => p.outputFormat).join(" ")}`.includes(
        search.toLowerCase(),
      ),
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="reference-dialog sm:max-w-[680px]">
        <DialogHeader>
          <div className="eyebrow">FIND THE RIGHT FORMAT</div>
          <DialogTitle className="panel-dialog-title">
            Format reference
          </DialogTitle>
          <DialogDescription>
            Choose an input format to see where it can go.
          </DialogDescription>
        </DialogHeader>
        <div className="search-field">
          <Search />
          <Input
            aria-label="Search formats"
            placeholder="Search a format, e.g. PNG or DOCX…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="format-list">
          {filtered.map(([input, pairs]) => (
            <div className="format-row" key={input}>
              <div>
                <FileText />
                <strong>{input.toUpperCase()}</strong>
              </div>
              <ArrowRight />
              <div className="format-tags">
                {pairs.map((pair) => (
                  <Badge
                    variant="secondary"
                    key={`${pair.adapter}:${pair.outputFormat}`}
                    title={
                      pair.adapter === "ocr"
                        ? "Text recognition (OCR)"
                        : pair.requiresOperation
                          ? "Use PDF tools"
                          : "File conversion"
                    }
                  >
                    {pair.outputFormat.toUpperCase()}
                    {pair.adapter === "ocr" && <small>OCR</small>}
                    {pair.requiresOperation && <small>PDF tools</small>}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {!filtered.length && (
            <p className="muted-placeholder">
              {info
                ? "No formats match your search."
                : "Loading available formats…"}
            </p>
          )}
        </div>
        <p className="field-hint reference-note">
          Office formats are inputs. OCR extracts text from images. Use PDF
          tools to merge, extract, or optimize PDFs.
        </p>
      </DialogContent>
    </Dialog>
  );
}
export function AboutDialog({
  open,
  onOpenChange,
  info,
}: OpenProps & { info: AppInfo | null }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setCopied(false);
        setError("");
        onOpenChange(value);
      }}
    >
      <DialogContent className="about-dialog sm:max-w-[440px]">
        <DialogHeader>
          <div className="about-brand">
            <BrandMark />
            <span>FileConverter</span>
          </div>
          <DialogTitle className="sr-only">About FileConverter</DialogTitle>
          <DialogDescription className="about-description">
            A fresh format. All yours.
            <br />A local workspace for images, documents, and PDFs.
          </DialogDescription>
        </DialogHeader>
        <div className="version-list">
          {[
            ["Desktop", info?.guiVersion],
            ["Conversion engine", info?.coreVersion],
            ["Platform", info ? `${info.platform} · ${info.arch}` : undefined],
            ["Electron", info?.electron],
            ["Node.js", info?.node],
            ["Chromium", info?.chrome],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value || "…"}</strong>
            </div>
          ))}
        </div>
        <p className="field-hint">
          Conversions run on your device. OCR may download language resources on
          first use.
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <Button
          variant="outline"
          disabled={!info}
          onClick={() => {
            void navigator.clipboard
              .writeText(
                JSON.stringify({ ...info, conversions: undefined }, null, 2),
              )
              .then(() => setCopied(true))
              .catch((cause) => setError(String(cause)));
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Diagnostics copied" : "Copy diagnostics"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
