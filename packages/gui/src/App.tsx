import { useEffect, useState } from "react";
import "./App.css";

const api = window.fileConverter;
function App() {
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
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetType, setPresetType] = useState("image");
  const [presetParameters, setPresetParameters] = useState(
    "quality=85;maxWidth=1920;stripMetadata=true",
  );
  const [presetScope, setPresetScope] = useState("global");

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
        <input
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
    setMode(value);
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

  return (
    <div className="app">
      <header className="header">
        <h1>FileConverter</h1>
        <p>Convert files, extract text, and work with PDFs.</p>
      </header>
      <main className="main">
        <fieldset disabled={busy} className="controls">
          <section className="section">
            <h2>Conversion</h2>
            <label>
              Task
              <select value={mode} onChange={(e) => changeMode(e.target.value)}>
                <option value="convert">Convert files</option>
                <option value="merge">Merge PDFs</option>
                <option value="split">Extract PDF pages</option>
                <option value="compress">Optimize PDF</option>
              </select>
            </label>
            {mode === "compress" && (
              <p className="hint">
                Rewrites the PDF structure. Embedded images are not
                recompressed, and some PDFs may not become smaller.
              </p>
            )}
            {mode === "split" && (
              <label>
                Pages to extract
                <input
                  placeholder="1-3,5,7-9"
                  value={options.pages ?? ""}
                  onChange={(e) => update("pages", e.target.value)}
                />
              </label>
            )}
            <div className="actions">
              <button
                onClick={() =>
                  void attempt(async () => {
                    const chosen = await api.selectFiles();
                    if (chosen.length) {
                      setFolder("");
                      setFiles((current) => [
                        ...new Set([...current, ...chosen]),
                      ]);
                      update("outputFile", undefined);
                    }
                  })
                }
              >
                Select {mode === "convert" ? "files" : "PDF files"}
              </button>
              {mode === "convert" && (
                <button
                  onClick={() =>
                    void attempt(async () => {
                      const chosen = await api.selectOutputFolder();
                      if (chosen) {
                        setFolder(chosen);
                        setFiles([]);
                        update("outputFile", undefined);
                      }
                    })
                  }
                >
                  Select input folder
                </button>
              )}
              <button
                onClick={() => {
                  setFiles([]);
                  setFolder("");
                  update("outputFile", undefined);
                }}
              >
                Clear selection
              </button>
            </div>
            {folder && (
              <>
                <p className="path">{folder}</p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!options.recursive}
                    onChange={(e) => update("recursive", e.target.checked)}
                  />
                  Include subfolders
                </label>
              </>
            )}
            {files.length > 0 && (
              <div className="file-list">
                <p>{files.length} file(s) selected</p>
                {files.map((file, index) => (
                  <div className="file-item" key={file}>
                    {file}
                    {mode === "merge" && (
                      <div className="actions">
                        <button
                          disabled={index === 0}
                          onClick={() => moveFile(index, -1)}
                          aria-label={`Move ${file} up`}
                        >
                          Move up
                        </button>
                        <button
                          disabled={index === files.length - 1}
                          onClick={() => moveFile(index, 1)}
                          aria-label={`Move ${file} down`}
                        >
                          Move down
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {mode !== "convert" && (
              <p className="hint">
                {mode === "merge"
                  ? "Select at least two PDFs. Their order determines the page order."
                  : "Select exactly one PDF."}
              </p>
            )}
          </section>
          <section className="section">
            <h2>Output</h2>
            <div className="actions">
              <button
                onClick={() =>
                  void attempt(async () => {
                    const chosen = await api.selectOutputFolder();
                    if (chosen) {
                      setOutputDir(chosen);
                      update("outputFile", undefined);
                    }
                  })
                }
              >
                Select output folder
              </button>
              {(mode !== "convert" ||
                (!folder &&
                  files.length === 1 &&
                  effectiveFormat === "txt")) && (
                <button
                  onClick={() =>
                    void attempt(async () => {
                      const chosen = await api.saveOutputFile(effectiveFormat);
                      if (chosen) update("outputFile", chosen);
                    })
                  }
                >
                  Choose output filename
                </button>
              )}
            </div>
            <p className="path">
              {options.outputFile || outputDir || "No output selected"}
            </p>
            {destination && (
              <button
                onClick={() =>
                  void attempt(async () => {
                    await api.openOutputFolder(destination);
                  })
                }
              >
                Open output folder
              </button>
            )}
            {mode === "convert" && (
              <label>
                Output format
                <select
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
                      disabled={inputs.length > 0 && supportCount(value) === 0}
                    >
                      {value.toUpperCase()}
                      {inputs.length > 0
                        ? ` (${supportCount(value)}/${inputs.length} files)`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="hint">
              Preview checks support for each input file. Existing files and
              conflicting output names are never overwritten.
            </p>
          </section>
          <section className="section">
            <h2>Settings</h2>
            <label>
              Preset
              <select
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
                    presetScope: scope as ConversionOptions["presetScope"],
                  }));
                }}
              >
                <option value="">No preset</option>
                {presets.map((p) => (
                  <option
                    key={`${p.scope}:${p.name}`}
                    value={`${p.scope}:${p.name}`}
                  >
                    {p.name} ({p.scope})
                  </option>
                ))}
              </select>
            </label>
            {selectedPreset && (
              <p className="hint">
                {selectedPreset.description} —{" "}
                {JSON.stringify(selectedPreset.parameters)}
              </p>
            )}
            <p className="hint">
              Empty settings use preset values or defaults. Image settings apply
              to image conversion.
            </p>
            <div className="settings-grid">
              {numberSetting("quality", "Image quality", 1, 100)}
              {numberSetting("maxWidth", "Maximum width (px)", 1)}
              {numberSetting("maxHeight", "Maximum height (px)", 1)}
              <label>
                Image metadata
                <select
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
                </select>
              </label>
              {numberSetting("concurrency", "Parallel jobs", 1)}
              {numberSetting("retries", "Retry attempts", 0)}
            </div>
            {mode === "convert" &&
              inputs.some((input) => input.inputFormat === "pdf") &&
              ["png", "jpg", "jpeg", "webp"].includes(format) && (
                <>
                  {numberSetting("dpi", "PDF resolution (DPI)", 72, 300)}
                  <label>
                    PDF pages
                    <input
                      placeholder="All pages, or 1-3,5"
                      value={options.pages ?? ""}
                      onChange={(e) =>
                        update("pages", e.target.value || undefined)
                      }
                    />
                  </label>
                </>
              )}
            {effectiveFormat === "txt" && (
              <>
                <label>
                  OCR language
                  <input
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
                <p className="hint">
                  Images become text through OCR. Enter a language code, or
                  combine codes such as eng+nor. First use may download
                  recognition resources.
                </p>
              </>
            )}
          </section>
          <section className="section actions">
            <button disabled={!ready} onClick={() => void run(true)}>
              Preview conversion
            </button>
            <button
              className="convert-btn"
              disabled={!ready}
              onClick={() => void run(false)}
            >
              {busy ? "Working…" : "Start conversion"}
            </button>
          </section>
        </fieldset>
        {busy && (
          <section className="section" role="status">
            {progress ? (
              <>
                <p>{progress.message}</p>
                <progress
                  value={progress.completed}
                  max={progress.total || 1}
                />
                <p>
                  {progress.completed} of {progress.total} finished
                </p>
              </>
            ) : (
              "Preparing…"
            )}
          </section>
        )}
        {error && (
          <div className="section result error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <p className="section" role="status">
            {notice}
          </p>
        )}
        {plans && (
          <section className="section">
            <h2>Preview</h2>
            <p>
              {plans.length} file(s), {plans.filter((p) => p.supported).length}{" "}
              ready
            </p>
            {plans.map((plan, index) => (
              <div className="file-item" key={index}>
                <strong>
                  {plan.supported ? "Ready" : "Cannot convert"}:{" "}
                  {plan.inputPath}
                </strong>
                <div>
                  {(plan.outputPaths || [plan.outputPath]).map((output) => (
                    <div key={output}>→ {output}</div>
                  ))}
                </div>
                {plan.reason && <p>{plan.reason}</p>}
              </div>
            ))}
          </section>
        )}
        {result && (
          <section className="section">
            <h2>Results</h2>
            <p className={`result ${result.success ? "success" : "error"}`}>
              {result.message}
            </p>
            {result.jobs.map((job, index) => (
              <div className="file-item" key={index}>
                <strong>
                  {job.status}: {job.input_path}
                </strong>
                <div>
                  {job.error ||
                    (job.output_paths || [job.output_path]).map((output) => (
                      <div key={output}>{output}</div>
                    ))}
                </div>
                <small>
                  {job.duration ?? 0}ms · {job.retryCount ?? 0} retries
                </small>
              </div>
            ))}
            <div className="actions">
              {(["result-json", "log-json", "log-text"] as const).map(
                (kind, index) => (
                  <button
                    key={kind}
                    disabled={busy}
                    onClick={() =>
                      void attempt(async () => {
                        const saved = await api.exportReport(kind, result);
                        if (saved) setNotice(`Saved report: ${saved}`);
                      })
                    }
                  >
                    {
                      [
                        "Export result JSON",
                        "Export log JSON",
                        "Export text log",
                      ][index]
                    }
                  </button>
                ),
              )}
            </div>
          </section>
        )}
        <fieldset disabled={busy} className="controls">
          <details className="section">
            <summary>Manage presets</summary>
            <p className="hint">
              Global presets are shared with the CLI. Select a project folder to
              use local presets.
            </p>
            <button
              onClick={() =>
                void attempt(async () => {
                  const chosen = await api.selectOutputFolder();
                  if (chosen) {
                    update("projectDirectory", chosen);
                    update("preset", undefined);
                    await loadPresets(chosen);
                  }
                })
              }
            >
              Select project folder
            </button>
            <p className="path">
              {options.projectDirectory || "No project folder selected"}
            </p>
            <div className="settings-grid">
              <label>
                Name
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              </label>
              <label>
                Description
                <input
                  value={presetDescription}
                  onChange={(e) => setPresetDescription(e.target.value)}
                />
              </label>
              <label>
                Type
                <select
                  value={presetType}
                  onChange={(e) => setPresetType(e.target.value)}
                >
                  <option value="image">Image</option>
                  <option value="pdf">PDF</option>
                  <option value="document">Document</option>
                </select>
              </label>
              <label>
                Scope
                <select
                  value={presetScope}
                  onChange={(e) => setPresetScope(e.target.value)}
                >
                  <option value="global">Global</option>
                  <option value="local" disabled={!options.projectDirectory}>
                    Local project
                  </option>
                </select>
              </label>
            </div>
            <label>
              Parameters
              <input
                value={presetParameters}
                onChange={(e) => setPresetParameters(e.target.value)}
                placeholder="quality=85;maxWidth=1920"
              />
            </label>
            <button
              onClick={() =>
                void attempt(async () => {
                  await api.request("presets:create", {
                    name: presetName,
                    description: presetDescription,
                    type: presetType,
                    parameters: presetParameters,
                    scope: presetScope,
                    projectDirectory: options.projectDirectory,
                  });
                  await loadPresets();
                  setNotice("Preset saved.");
                })
              }
            >
              Save preset
            </button>
            {presets.map((preset) => (
              <div className="file-item" key={`${preset.scope}:${preset.name}`}>
                <strong>
                  {preset.name} ({preset.scope})
                </strong>
                <p>{preset.description}</p>
                <code>{JSON.stringify(preset.parameters)}</code>
                {preset.scope !== "builtin" && (
                  <button
                    onClick={() =>
                      void attempt(async () => {
                        await api.request("presets:delete", {
                          name: preset.name,
                          scope: preset.scope,
                          projectDirectory: options.projectDirectory,
                        });
                        update("preset", undefined);
                        await loadPresets();
                      })
                    }
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </details>
        </fieldset>
        {info && (
          <>
            <details className="section">
              <summary>Supported conversions</summary>
              <p className="hint">
                Office formats are inputs. OCR extracts text from images.
                PDF-to-PDF requires a PDF tool.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Tool</th>
                  </tr>
                </thead>
                <tbody>
                  {info.conversions.map((pair, index) => (
                    <tr key={index}>
                      <td>{pair.inputFormat}</td>
                      <td>{pair.outputFormat}</td>
                      <td>
                        {pair.requiresOperation
                          ? "PDF tools"
                          : pair.adapter === "ocr"
                            ? "OCR"
                            : "Convert files"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <details className="section">
              <summary>About FileConverter</summary>
              <pre>
                {JSON.stringify({ ...info, conversions: undefined }, null, 2)}
              </pre>
              <button
                onClick={() =>
                  void attempt(async () => {
                    await navigator.clipboard.writeText(
                      JSON.stringify(
                        { ...info, conversions: undefined },
                        null,
                        2,
                      ),
                    );
                    setNotice("Diagnostics copied.");
                  })
                }
              >
                Copy diagnostics
              </button>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
export default App;
