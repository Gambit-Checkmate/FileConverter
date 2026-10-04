import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowLeftRight,
  Files,
  FileText,
  FileImage,
  FolderOpen,
  Plus,
  X,
  Check,
  CircleAlert,
  LoaderCircle,
  Eye,
  SlidersHorizontal,
  Library,
  Layers,
  Scissors,
  Minimize2,
  ChevronDown,
  Info,
  ListFilter,
  Download,
  Search,
  ShieldCheck,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SpotlightCard from "@/components/SpotlightCard";
import {
  BrandMark,
  presetTitle,
  basename,
  PresetLibrary,
  FormatReference,
  AboutDialog,
} from "@/components/library-panels";
import "./App.css";

const api = window.fileConverter;
function App() {
  const [panel, setPanel] = useState<"presets" | "formats" | "about" | null>(
    null,
  );
  const [view, setView] = useState("files");
  const [advanced, setAdvanced] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [format, setFormat] = useState("png");
  const [mode, setMode] = useState("convert");
  const [options, setOptions] = useState<ConversionOptions>({
    concurrency: 1,
    retries: 2,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [plans, setPlans] = useState<ConversionPlan[] | null>(null);
  const [progress, setProgress] = useState<ConversionProgress | null>(null);
  const [inputs, setInputs] = useState<
    Array<{ inputPath: string; inputFormat: string }>
  >([]);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);

  async function attempt(work: () => Promise<void>) {
    setError("");
    setNotice("");
    try {
      await work();
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function loadPresets(projectDirectory = options.projectDirectory) {
    setPresets(await api.request("presets:list", { projectDirectory }));
  }
  useEffect(() => {
    void attempt(async () => {
      setInfo(await api.request("info"));
      await loadPresets();
    });
    return api.onProgress(setProgress);
  }, []);
  useEffect(() => {
    setPlans(null);
    setResult(null);
    setProgress(null);
    setView("files");
  }, [files, folder, outputDir, format, mode, options]);

  useEffect(() => {
    let current = true;
    void api
      .request("inputs:inspect", {
        inputPaths: folder ? [folder] : files,
        outputDir,
        recursive: options.recursive,
      })
      .then((value) => {
        if (current) setInputs(value);
      })
      .catch((cause) => {
        if (current) setError(String(cause));
      });
    return () => {
      current = false;
    };
  }, [files, folder, outputDir, options.recursive]);

  function update<K extends keyof ConversionOptions>(
    key: K,
    value: ConversionOptions[K],
  ) {
    setOptions((current) => ({ ...current, [key]: value }));
  }
  function numberSetting(
    key:
      | "quality"
      | "maxWidth"
      | "maxHeight"
      | "concurrency"
      | "retries"
      | "dpi",
    label: string,
    min: number,
    max?: number,
  ) {
    return (
      <label>
        {label}
        <Input
          type="number"
          min={min}
          max={max}
          step={1}
          value={options[key] ?? ""}
          placeholder="Default"
          onChange={(event) =>
            update(
              key,
              event.target.value === ""
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      </label>
    );
  }
  const inputPaths = folder ? [folder] : files;
  const effectiveFormat = mode === "convert" ? format : "pdf";
  const formats = [
    ...new Set(info?.conversions.map((pair) => pair.outputFormat) || []),
  ].sort();
  const settings: ConversionOptions = {
    ...options,
    operation:
      mode === "convert" ? undefined : (mode as ConversionOptions["operation"]),
  };
  const destination = settings.outputFile
    ? settings.outputFile.replace(/[^/\\]+$/, "")
    : outputDir;
  const ready = inputPaths.length > 0 && !!destination;
  function supportCount(outputFormat: string) {
    return inputs.filter((input) =>
      info?.conversions.some(
        (pair) =>
          pair.inputFormat === input.inputFormat &&
          pair.outputFormat === outputFormat &&
          !pair.requiresOperation,
      ),
    ).length;
  }
  const selectedPreset = presets.find(
    (p) => p.name === options.preset && p.scope === options.presetScope,
  );

  async function run(preview: boolean) {
    setBusy(true);
    setView(preview ? "preview" : "results");
    setProgress(null);
    setPlans(null);
    setResult(null);
    await attempt(async () => {
      if (preview)
        setPlans(
          await api.request("preview", {
            inputPaths,
            outputDir: destination,
            format: effectiveFormat,
            options: settings,
          }),
        );
      else
        setResult(
          await api.convertFiles(
            inputPaths,
            destination,
            effectiveFormat,
            settings,
          ),
        );
    });
    setBusy(false);
  }
  function changeMode(value: string) {
    setFileSearch("");
    setMode(value);
    setView("files");
    setFolder("");
    setFiles([]);
    setOptions((current) => ({
      ...current,
      outputFile: undefined,
      pages: undefined,
      preset: undefined,
    }));
  }
  function moveFile(index: number, offset: number) {
    setFiles((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  async function chooseFiles() {
    await attempt(async () => {
      const chosen = await api.selectFiles();
      if (chosen.length) {
        setFileSearch("");
        setFolder("");
        setFiles((current) => [...new Set([...current, ...chosen])]);
        update("outputFile", undefined);
        setView("files");
      }
    });
  }
  async function chooseFolder(input = false) {
    await attempt(async () => {
      const chosen = await api.selectOutputFolder();
      if (chosen) {
        if (input) {
          setFolder(chosen);
          setFiles([]);
          setView("files");
        } else setOutputDir(chosen);
        update("outputFile", undefined);
      }
    });
  }
  const task =
    mode === "convert"
      ? "Convert files"
      : mode === "merge"
        ? "Merge PDFs"
        : mode === "split"
          ? "Extract pages"
          : "Optimize PDF";
  const imageOutput =
    mode === "convert" &&
    ["png", "jpg", "jpeg", "webp", "avif", "tiff", "gif"].includes(format);
  const hasPdf = inputs.some((input) => input.inputFormat === "pdf");
  const visibleFiles = files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) =>
      file.toLowerCase().includes(fileSearch.toLowerCase()),
    );
  const inputFormats = new Map(
    inputs.map((input) => [input.inputPath, input.inputFormat]),
  );
  const fileCount = folder ? inputs.length : files.length;
  const modeValid =
    mode === "convert" ||
    (mode === "merge" ? files.length >= 2 : files.length === 1);
  function iconButton(
    label: string,
    onClick: () => void,
    icon: React.ReactNode,
    disabled = false,
  ) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <TooltipProvider>
      <div className="app">
        <aside className="sidebar" aria-label="Workspace navigation">
          <div className="brand">
            <BrandMark />
            <div>
              <strong>FileConverter</strong>
              <span>DESKTOP WORKSPACE</span>
            </div>
          </div>
          <div className="nav-label">WORKSPACE</div>
          <nav>
            <Button
              variant="ghost"
              className={`nav-item ${mode === "convert" ? "active" : ""}`}
              disabled={busy}
              onClick={() => changeMode("convert")}
              aria-label="Convert files"
              title="Convert files"
              aria-current={mode === "convert" ? "page" : undefined}
            >
              <ArrowLeftRight />
              <span className="nav-text">Convert files</span>
            </Button>
            <div className="nav-label pdf-label">PDF TOOLS</div>
            {(
              [
                ["merge", "Merge PDFs", Layers],
                ["split", "Extract pages", Scissors],
                ["compress", "Optimize PDF", Minimize2],
              ] as const
            ).map(([value, label, Icon]) => (
              <Button
                key={value}
                variant="ghost"
                disabled={busy}
                className={`nav-item ${mode === value ? "active" : ""}`}
                onClick={() => changeMode(value)}
                aria-label={label}
                title={label}
                aria-current={mode === value ? "page" : undefined}
              >
                <Icon />
                <span className="nav-text">{label}</span>
              </Button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-note">
              <ShieldCheck />
              <div>
                <strong>Files stay on your device</strong>
                <span>Conversions run locally.</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="app-menu"
                  aria-label="FileConverter menu"
                >
                  <BrandMark small />
                  <span>
                    FileConverter <small>v{info?.guiVersion || "…"}</small>
                  </span>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel>Workspace resources</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => setPanel("presets")}
                >
                  <Library />
                  Preset library
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPanel("formats")}>
                  <ListFilter />
                  Format reference
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setPanel("about")}>
                  <Info />
                  About FileConverter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>
        <main className="workspace">
          <header className="workspace-header">
            <div className="breadcrumb">
              Workspace <span>/</span> <strong>{task}</strong>
            </div>
            <Badge variant="outline" className="local-badge">
              <span />
              Local processing
            </Badge>
          </header>
          <div className="workspace-body">
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR FILES. A NEW FORMAT.</div>
                <h1>{task}</h1>
                <p>
                  {mode === "convert"
                    ? "Images, documents, and more. Ready for whatever comes next."
                    : mode === "merge"
                      ? "Bring your documents together, in the order you choose."
                      : mode === "split"
                        ? "Keep the pages you need. Leave the rest behind."
                        : "Clean up the structure of your PDF document."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPanel("formats")}
              >
                <ListFilter />
                Formats
              </Button>
            </div>
            {error && (
              <div className="message error" role="alert">
                <CircleAlert />
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Dismiss error"
                  onClick={() => setError("")}
                >
                  <X />
                </Button>
              </div>
            )}
            {notice && (
              <div className="message success" role="status">
                <Check />
                <span>{notice}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  <X />
                </Button>
              </div>
            )}
            <div className="workbench">
              <section
                className="source-panel"
                aria-label="Source files and conversion activity"
              >
                <div className="panel-top">
                  <div className="panel-title">
                    <Files />
                    <h2>Source files</h2>
                    <Badge variant="secondary">{fileCount}</Badge>
                  </div>
                  <div className="source-actions">
                    {fileCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setFiles([]);
                          setFolder("");
                          update("outputFile", undefined);
                          setView("files");
                        }}
                      >
                        Clear
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void chooseFiles()}
                    >
                      <Plus />
                      Add files
                    </Button>
                  </div>
                </div>
                <Tabs
                  value={view}
                  onValueChange={setView}
                  className="source-tabs"
                >
                  <div className="activity-tabs">
                    <TabsList aria-label="Conversion activity">
                      <TabsTrigger value="files">Files</TabsTrigger>
                      <TabsTrigger value="preview" disabled={!plans && !busy}>
                        Preview
                      </TabsTrigger>
                      <TabsTrigger value="results" disabled={!result && !busy}>
                        Results
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  {busy && (
                    <div className="progress-area" role="status">
                      <div>
                        <LoaderCircle className="spin" />
                        <strong>
                          {progress?.message || "Preparing your files…"}
                        </strong>
                        <span>
                          {progress
                            ? `${progress.completed} / ${progress.total}`
                            : ""}
                        </span>
                      </div>
                      <Progress
                        value={
                          progress
                            ? (progress.completed / (progress.total || 1)) * 100
                            : 0
                        }
                      />
                    </div>
                  )}
                  <div className="source-content">
                    <TabsContent value="files">
                      {!inputPaths.length ? (
                        <SpotlightCard
                          className="file-empty"
                          spotlightColor="rgba(240, 150, 100, 0.10)"
                        >
                          <div className="file-illustration" aria-hidden="true">
                            <div className="illustration-back">
                              <FileImage />
                            </div>
                            <div className="illustration-front">
                              <FileText />
                              <div />
                              <div />
                            </div>
                            <span>
                              <ArrowLeftRight />
                            </span>
                          </div>
                          <h3>A fresh start for your files</h3>
                          <p>
                            {mode === "convert"
                              ? "Choose files or an entire folder to get started."
                              : "Choose your PDF documents to get started."}
                          </p>
                          <div className="empty-actions">
                            <Button
                              disabled={busy}
                              onClick={() => void chooseFiles()}
                            >
                              <Plus />
                              Choose {mode === "convert" ? "files" : "PDFs"}
                            </Button>
                            {mode === "convert" && (
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => void chooseFolder(true)}
                              >
                                <FolderOpen />
                                Choose folder
                              </Button>
                            )}
                          </div>
                          <span className="empty-caption">
                            {mode === "convert"
                              ? "Images · Documents · PDF · OCR"
                              : mode === "merge"
                                ? "Two or more PDFs · Reorder before merging"
                                : "One PDF at a time"}
                          </span>
                        </SpotlightCard>
                      ) : (
                        <>
                          {folder ? (
                            <div className="folder-card">
                              <FolderOpen />
                              <div>
                                <strong>{basename(folder)}</strong>
                                <p title={folder}>{folder}</p>
                                <span>{inputs.length} files found</span>
                              </div>
                              <label className="check">
                                <input
                                  type="checkbox"
                                  disabled={busy}
                                  checked={!!options.recursive}
                                  onChange={(e) =>
                                    update("recursive", e.target.checked)
                                  }
                                />
                                Include subfolders
                              </label>
                            </div>
                          ) : (
                            <>
                              {files.length > 4 && (
                                <div className="search-field">
                                  <Search />
                                  <Input
                                    aria-label="Search selected files"
                                    placeholder="Find a file…"
                                    value={fileSearch}
                                    onChange={(e) =>
                                      setFileSearch(e.target.value)
                                    }
                                  />
                                </div>
                              )}
                              <div className="file-table-heading">
                                <span>NAME</span>
                                <span>FORMAT</span>
                              </div>
                              {visibleFiles.map(({ file, index }) => (
                                <div className="file-row" key={file}>
                                  <div className="file-symbol">
                                    {[
                                      "png",
                                      "jpg",
                                      "jpeg",
                                      "webp",
                                      "tiff",
                                      "gif",
                                      "avif",
                                    ].includes(inputFormats.get(file) || "") ? (
                                      <FileImage />
                                    ) : (
                                      <FileText />
                                    )}
                                  </div>
                                  <div className="file-name">
                                    <strong title={file}>
                                      {basename(file)}
                                    </strong>
                                    <span title={file}>{file}</span>
                                  </div>
                                  <Badge variant="outline">
                                    {inputFormats.get(file)?.toUpperCase() ||
                                      "…"}
                                  </Badge>
                                  <div className="row-actions">
                                    {mode === "merge" && (
                                      <>
                                        {iconButton(
                                          `Move ${basename(file)} up`,
                                          () => moveFile(index, -1),
                                          <ArrowUp />,
                                          busy || index === 0,
                                        )}
                                        {iconButton(
                                          `Move ${basename(file)} down`,
                                          () => moveFile(index, 1),
                                          <ArrowDown />,
                                          busy || index === files.length - 1,
                                        )}
                                      </>
                                    )}
                                    {iconButton(
                                      `Remove ${basename(file)}`,
                                      () =>
                                        setFiles((current) =>
                                          current.filter((p) => p !== file),
                                        ),
                                      <X />,
                                      busy,
                                    )}
                                  </div>
                                </div>
                              ))}
                              {!visibleFiles.length && (
                                <p className="muted-placeholder">
                                  No files match your search.
                                </p>
                              )}
                            </>
                          )}
                          <div className="selection-note">
                            <ShieldCheck />
                            <span>
                              Original files are preserved. Existing outputs are
                              never overwritten.
                            </span>
                          </div>
                          {mode !== "convert" && (
                            <p className="inline-hint">
                              {mode === "merge"
                                ? "The order above determines the page order. Select at least two PDFs."
                                : "Select exactly one PDF."}
                            </p>
                          )}
                        </>
                      )}
                    </TabsContent>
                    <TabsContent value="preview">
                      {!busy &&
                        (plans ? (
                          <>
                            <div className="activity-summary">
                              <Eye />
                              <div>
                                <h3>Ready before you run</h3>
                                <p>
                                  {plans.filter((p) => p.supported).length} of{" "}
                                  {plans.length} files ready to convert. No
                                  files have been written.
                                </p>
                              </div>
                            </div>
                            {plans.map((plan, index) => (
                              <div className="activity-row" key={index}>
                                <span
                                  className={`status-icon ${plan.supported ? "good" : "bad"}`}
                                >
                                  {plan.supported ? <Check /> : <CircleAlert />}
                                </span>
                                <div>
                                  <strong title={plan.inputPath}>
                                    {basename(plan.inputPath)}
                                  </strong>
                                  <Badge variant="outline">
                                    {plan.supported ? "Ready" : "Unavailable"}
                                  </Badge>
                                  {(plan.outputPaths || [plan.outputPath]).map(
                                    (output) => (
                                      <p
                                        className="output-path"
                                        key={output}
                                        title={output}
                                      >
                                        <ArrowRight />
                                        {output}
                                      </p>
                                    ),
                                  )}
                                  {plan.reason && (
                                    <p className="error-text">{plan.reason}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="muted-placeholder">
                            Choose files and an output folder, then preview your
                            conversion.
                          </p>
                        ))}
                    </TabsContent>
                    <TabsContent value="results">
                      {!busy &&
                        (result ? (
                          <>
                            <div className="activity-summary">
                              <span
                                className={`status-icon ${result.success ? "good" : "bad"}`}
                              >
                                {result.success ? <Check /> : <CircleAlert />}
                              </span>
                              <div>
                                <h3>
                                  {result.success
                                    ? "Your files are ready"
                                    : "Conversion finished with errors"}
                                </h3>
                                <p>
                                  {result.message} ·{" "}
                                  {(result.totalDuration / 1000).toFixed(1)}s
                                </p>
                              </div>
                            </div>
                            {result.jobs.map((job, index) => (
                              <div className="activity-row" key={index}>
                                <span
                                  className={`status-icon ${job.status === "completed" ? "good" : "bad"}`}
                                >
                                  {job.status === "completed" ? (
                                    <Check />
                                  ) : (
                                    <CircleAlert />
                                  )}
                                </span>
                                <div>
                                  <strong title={job.input_path}>
                                    {basename(job.input_path)}
                                  </strong>
                                  {job.status !== "completed" ? (
                                    <p className="error-text">
                                      {job.error || "Conversion failed."}
                                    </p>
                                  ) : (
                                    (job.output_paths || [job.output_path]).map(
                                      (output) => (
                                        <div
                                          className="output-result"
                                          key={output}
                                        >
                                          <p
                                            className="output-path"
                                            title={output}
                                          >
                                            <ArrowRight />
                                            {output}
                                          </p>
                                          <div className="output-file-actions">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                void attempt(async () => {
                                                  await api.openOutputFile(
                                                    output,
                                                  );
                                                })
                                              }
                                            >
                                              <ArrowUpRight />
                                              Open file
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                void attempt(async () => {
                                                  await api.revealOutputFile(
                                                    output,
                                                  );
                                                })
                                              }
                                            >
                                              <FolderOpen />
                                              Reveal in folder
                                            </Button>
                                          </div>
                                        </div>
                                      ),
                                    )
                                  )}
                                  <small>
                                    {job.duration ?? 0}ms ·{" "}
                                    {job.retryCount ?? 0} retries
                                  </small>
                                </div>
                              </div>
                            ))}
                            <div className="report-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void attempt(async () => {
                                    await api.openOutputFolder(destination);
                                  })
                                }
                              >
                                <FolderOpen />
                                Open folder
                                <ArrowUpRight />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Download />
                                    Export report
                                    <ChevronDown />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  {(
                                    [
                                      "result-json",
                                      "log-json",
                                      "log-text",
                                    ] as const
                                  ).map((kind, index) => (
                                    <DropdownMenuItem
                                      key={kind}
                                      onSelect={() =>
                                        void attempt(async () => {
                                          const saved = await api.exportReport(
                                            kind,
                                            result,
                                          );
                                          if (saved)
                                            setNotice(
                                              `Report saved to ${saved}`,
                                            );
                                        })
                                      }
                                    >
                                      {
                                        ["Result JSON", "Log JSON", "Text log"][
                                          index
                                        ]
                                      }
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </>
                        ) : (
                          <p className="muted-placeholder">
                            Your converted files will appear here.
                          </p>
                        ))}
                    </TabsContent>
                  </div>
                </Tabs>
                <div className="source-footer">
                  <span>
                    {fileCount
                      ? `${fileCount} file${fileCount === 1 ? "" : "s"} selected`
                      : "No files selected"}
                  </span>
                  <span>
                    <ShieldCheck />
                    On-device conversion
                  </span>
                </div>
              </section>
              <fieldset disabled={busy} className="output-panel">
                <div className="panel-title">
                  <SlidersHorizontal />
                  <h2>Output settings</h2>
                </div>
                <div className="output-settings">
                  <div className="setting-group">
                    <div className="group-label">DESTINATION</div>
                    {mode === "convert" && (
                      <label>
                        Output format
                        <NativeSelect
                          value={format}
                          onChange={(e) => {
                            setFormat(e.target.value);
                            update("outputFile", undefined);
                          }}
                        >
                          {formats.map((value) => (
                            <option
                              value={value}
                              key={value}
                              disabled={
                                inputs.length > 0 && supportCount(value) === 0
                              }
                            >
                              {value.toUpperCase()}
                              {inputs.length > 0
                                ? ` · ${supportCount(value)}/${inputs.length} supported`
                                : ""}
                            </option>
                          ))}
                        </NativeSelect>
                      </label>
                    )}
                    <label>
                      Save to
                      <Button
                        variant="outline"
                        className="destination-button"
                        onClick={() => void chooseFolder()}
                      >
                        <FolderOpen />
                        <span>
                          {options.outputFile
                            ? basename(options.outputFile)
                            : outputDir
                              ? basename(outputDir)
                              : "Choose output folder"}
                        </span>
                        <ChevronDown />
                      </Button>
                    </label>
                    {destination && (
                      <p
                        className="destination-path"
                        title={options.outputFile || outputDir}
                      >
                        {options.outputFile || outputDir}
                      </p>
                    )}
                    {(mode !== "convert" ||
                      (!folder &&
                        files.length === 1 &&
                        effectiveFormat === "txt")) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-action"
                        onClick={() =>
                          void attempt(async () => {
                            const chosen =
                              await api.saveOutputFile(effectiveFormat);
                            if (chosen) update("outputFile", chosen);
                          })
                        }
                      >
                        Choose output filename
                        <ArrowUpRight />
                      </Button>
                    )}
                    {mode === "split" && (
                      <label>
                        Pages to extract
                        <Input
                          placeholder="1-3,5,7-9"
                          value={options.pages ?? ""}
                          onChange={(e) => update("pages", e.target.value)}
                        />
                        <span className="field-hint">
                          Use page numbers or ranges, separated by commas.
                        </span>
                      </label>
                    )}
                    {mode === "compress" && (
                      <p className="field-hint">
                        Rewrites PDF structure. Images are not recompressed; the
                        file may not become smaller.
                      </p>
                    )}
                  </div>
                  <div className="setting-group">
                    <div className="group-label">
                      PRESET
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Open preset library"
                        onClick={() => setPanel("presets")}
                      >
                        <Library />
                      </Button>
                    </div>
                    <label className="sr-only" htmlFor="preset-choice">
                      Preset
                    </label>
                    <NativeSelect
                      id="preset-choice"
                      value={
                        options.preset
                          ? `${options.presetScope}:${options.preset}`
                          : ""
                      }
                      onChange={(e) => {
                        const [scope, name] = e.target.value.split(":");
                        setOptions((current) => ({
                          ...current,
                          preset: name || undefined,
                          presetScope:
                            scope as ConversionOptions["presetScope"],
                        }));
                      }}
                    >
                      <option value="">Custom settings</option>
                      {presets.map((p) => (
                        <option
                          key={`${p.scope}:${p.name}`}
                          value={`${p.scope}:${p.name}`}
                        >
                          {presetTitle(p)} ·{" "}
                          {p.scope === "builtin"
                            ? "Built-in"
                            : p.scope === "local"
                              ? "Project"
                              : "Global"}
                        </option>
                      ))}
                    </NativeSelect>
                    {selectedPreset ? (
                      <p className="field-hint">{selectedPreset.description}</p>
                    ) : (
                      <p className="field-hint">
                        Start from a preset, or make it your own.
                      </p>
                    )}
                  </div>
                  {imageOutput && (
                    <div className="setting-group">
                      <div className="group-label">IMAGE</div>
                      {numberSetting("quality", "Quality", 1, 100)}
                      <div className="settings-grid">
                        {numberSetting("maxWidth", "Max width (px)", 1)}
                        {numberSetting("maxHeight", "Max height (px)", 1)}
                      </div>
                      <label>
                        Metadata
                        <NativeSelect
                          value={
                            options.stripMetadata === undefined
                              ? ""
                              : String(options.stripMetadata)
                          }
                          onChange={(e) =>
                            update(
                              "stripMetadata",
                              e.target.value === ""
                                ? undefined
                                : e.target.value === "true",
                            )
                          }
                        >
                          <option value="">Preset / default</option>
                          <option value="true">Remove metadata</option>
                          <option value="false">Keep metadata</option>
                        </NativeSelect>
                      </label>
                    </div>
                  )}
                  {mode === "convert" &&
                    hasPdf &&
                    ["png", "jpg", "jpeg", "webp"].includes(format) && (
                      <div className="setting-group">
                        <div className="group-label">PDF RENDERING</div>
                        {numberSetting("dpi", "Resolution (DPI)", 72, 300)}
                        <label>
                          PDF pages
                          <Input
                            placeholder="All pages, or 1-3,5"
                            value={options.pages ?? ""}
                            onChange={(e) =>
                              update("pages", e.target.value || undefined)
                            }
                          />
                        </label>
                      </div>
                    )}
                  {effectiveFormat === "txt" && (
                    <div className="setting-group">
                      <div className="group-label">TEXT RECOGNITION</div>
                      <label>
                        OCR language
                        <Input
                          value={options.language ?? "eng"}
                          onChange={(e) => update("language", e.target.value)}
                          list="ocr-languages"
                        />
                      </label>
                      <datalist id="ocr-languages">
                        <option value="eng">English</option>
                        <option value="nor">Norwegian Bokmål</option>
                        <option value="nno">Norwegian Nynorsk</option>
                        <option value="deu">German</option>
                      </datalist>
                      <p className="field-hint">
                        Combine codes, such as eng+nor. Language resources may
                        download on first use.
                      </p>
                    </div>
                  )}
                  <div className="setting-group advanced-settings">
                    <Button
                      variant="ghost"
                      className="advanced-toggle"
                      aria-expanded={advanced}
                      onClick={() => setAdvanced(!advanced)}
                    >
                      Advanced settings
                      <ChevronDown className={advanced ? "rotate-180" : ""} />
                    </Button>
                    {advanced && (
                      <>
                        <div className="settings-grid">
                          {numberSetting("concurrency", "Parallel jobs", 1)}
                          {numberSetting("retries", "Retry attempts", 0)}
                        </div>
                        <p className="field-hint">
                          Empty values use your preset or the default.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
          <footer className="run-bar">
            <div>
              <span
                className={`ready-dot ${ready && modeValid ? "is-ready" : ""}`}
              />
              <div>
                <strong>
                  {busy
                    ? "Conversion in progress"
                    : ready && modeValid
                      ? "Ready to convert"
                      : "Set up your conversion"}
                </strong>
                <span>
                  {busy
                    ? "Your files are being processed locally."
                    : !inputPaths.length
                      ? "Add your source files to get started."
                      : !modeValid
                        ? mode === "merge"
                          ? "Select at least two PDFs."
                          : "Select exactly one PDF."
                        : !destination
                          ? "Choose where to save your files."
                          : `${fileCount} file${fileCount === 1 ? "" : "s"} → ${effectiveFormat.toUpperCase()}`}
                </span>
              </div>
            </div>
            <div className="run-actions">
              <Button
                variant="outline"
                disabled={busy || !ready || !modeValid}
                onClick={() => void run(true)}
              >
                <Eye />
                Preview
              </Button>
              <Button
                disabled={busy || !ready || !modeValid}
                onClick={() => void run(false)}
              >
                {busy ? <LoaderCircle className="spin" /> : <ArrowRight />}
                {busy ? "Working…" : "Start conversion"}
              </Button>
            </div>
          </footer>
        </main>
        <PresetLibrary
          open={panel === "presets"}
          onOpenChange={(open) => {
            if (!open) setPanel(null);
          }}
          presets={presets}
          projectDirectory={options.projectDirectory}
          busy={busy}
          onProject={async () => {
            const chosen = await api.selectOutputFolder();
            if (chosen) {
              update("projectDirectory", chosen);
              update("preset", undefined);
              await loadPresets(chosen);
            }
          }}
          onRefresh={() => loadPresets()}
          onUse={(preset) => {
            setOptions((current) => ({
              ...current,
              preset: preset.name,
              presetScope: preset.scope,
            }));
            setPanel(null);
          }}
          onDeleteSelected={() => update("preset", undefined)}
        />
        <FormatReference
          open={panel === "formats"}
          onOpenChange={(open) => {
            if (!open) setPanel(null);
          }}
          info={info}
        />
        <AboutDialog
          open={panel === "about"}
          onOpenChange={(open) => {
            if (!open) setPanel(null);
          }}
          info={info}
        />
      </div>
    </TooltipProvider>
  );
}
export default App;
