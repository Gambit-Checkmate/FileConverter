const fs = require("node:fs");
const path = require("node:path");
process.env.FILECONVERTER_DISABLE_FILE_LOGS = "1";
const {
  AdapterManager,
  Converter,
  ConfigManager,
  JobQueue,
  PdfAdapter,
  scanForFiles,
} = require("@fileconverter/core");

function integer(value, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value < min || value > max)
  ) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
}
function validateOptions(options) {
  integer(options.quality, "Quality", 1, 100);
  integer(options.maxWidth, "Maximum width");
  integer(options.maxHeight, "Maximum height");
  integer(options.concurrency, "Concurrency");
  integer(options.retries, "Retries", 0);
  integer(options.dpi, "DPI", 72, 300);
  for (const key of ["recursive", "stripMetadata"]) {
    if (options[key] !== undefined && typeof options[key] !== "boolean")
      throw new Error(`Invalid ${key}.`);
  }
  if (
    options.language !== undefined &&
    (typeof options.language !== "string" ||
      !/^[a-zA-Z0-9_]+(?:\+[a-zA-Z0-9_]+)*$/.test(options.language))
  )
    throw new Error("Invalid OCR language code.");
  if (
    options.operation !== undefined &&
    !["merge", "split", "compress"].includes(options.operation)
  )
    throw new Error("Invalid PDF operation.");
}
function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value);
}
function manager(projectDirectory) {
  if (
    projectDirectory !== undefined &&
    (!absolute(projectDirectory) ||
      !fs.statSync(projectDirectory).isDirectory())
  )
    throw new Error("Select a valid project folder.");
  // An explicit fallback avoids depending on the packaged application's working directory.
  return ConfigManager.forProject(
    projectDirectory || require("node:os").homedir(),
    !!projectDirectory,
  );
}
async function resolveParameters(inputPaths, outputDir, format, options) {
  manager(options.projectDirectory);
  const parameters = await new Converter().resolveParameters({
    ...options,
    input: inputPaths[0],
    output: outputDir,
    format,
    projectDirectory: options.projectDirectory || require("node:os").homedir(),
    includeLocalConfig: !!options.projectDirectory,
    ...(options.operation === "merge" ? { inputFiles: inputPaths } : {}),
  });
  validateOptions(parameters);
  return parameters;
}
async function buildPlans(inputPaths, outputDir, format, options = {}) {
  validateOptions(options);
  const adapters = new AdapterManager();
  const formats = new Set(
    adapters.listAdapters().flatMap((a) => a.supportedOutputFormats),
  );
  if (
    !Array.isArray(inputPaths) ||
    !inputPaths.length ||
    inputPaths.some((p) => !absolute(p)) ||
    !absolute(outputDir) ||
    !formats.has(format)
  ) {
    throw new Error(
      "Select input files or a folder, an output folder, and a supported format.",
    );
  }
  const parameters = await resolveParameters(
    inputPaths,
    outputDir,
    format,
    options,
  );
  if (fs.existsSync(outputDir) && !fs.statSync(outputDir).isDirectory())
    throw new Error("Output must be a folder.");
  if (options.operation && format !== "pdf")
    throw new Error("PDF operations require PDF output.");
  if (options.operation === "merge" && inputPaths.length < 2)
    throw new Error("Select at least two PDFs to merge.");
  if (
    options.operation &&
    inputPaths.some(
      (p) =>
        !fs.statSync(p).isFile() || path.extname(p).toLowerCase() !== ".pdf",
    )
  )
    throw new Error("PDF tools require PDF files.");
  if (
    options.operation !== "merge" &&
    options.operation &&
    inputPaths.length !== 1
  )
    throw new Error("Select exactly one PDF for this operation.");
  if (options.outputFile && !absolute(options.outputFile))
    throw new Error("Output filename must be absolute.");
  const supports = (from, to) =>
    !!adapters.getAdapter(from, to) &&
    !(from === "pdf" && to === "pdf" && !options.operation);
  const plans = [];
  for (const input of [
    ...new Set(
      options.operation === "merge" ? inputPaths.slice(0, 1) : inputPaths,
    ),
  ]) {
    try {
      plans.push(
        ...(await scanForFiles(
          input,
          outputDir,
          format,
          options.recursive || false,
          supports,
        )),
      );
    } catch (error) {
      plans.push({
        inputPath: input,
        outputPath: "",
        inputFormat: "",
        outputFormat: format,
        supported: false,
        reason: error.message,
      });
    }
  }
  if (options.outputFile) {
    if (plans.length !== 1 || !fs.statSync(inputPaths[0]).isFile())
      throw new Error(
        "An output filename requires a single file or PDF merge.",
      );
    plans[0].outputPath = options.outputFile;
  }
  for (const plan of plans.filter((p) => p.supported)) {
    try {
      const adapter = adapters.getAdapter(plan.inputFormat, plan.outputFormat);
      adapter.validateParameters(parameters);
      plan.outputPaths = [plan.outputPath];
      if (
        plan.inputFormat === "pdf" &&
        ["png", "jpg", "jpeg", "webp"].includes(format)
      ) {
        plan.outputPaths = await new PdfAdapter().planRasterOutputs(
          plan,
          parameters,
        );
      }
      if (options.operation === "split")
        await new PdfAdapter().validatePageSelection(
          plan.inputPath,
          parameters.pages || "1",
        );
    } catch (error) {
      plan.supported = false;
      plan.reason = error.message;
    }
  }
  const destinations = new Map();
  const key = (p) =>
    process.platform === "win32" || process.platform === "darwin"
      ? p.toLowerCase()
      : p;
  for (const plan of plans) {
    if (!plan.supported || !plan.outputPath) continue;
    for (const outputPath of plan.outputPaths || [plan.outputPath]) {
      const destination = key(path.resolve(outputPath));
      if (!destinations.has(destination)) destinations.set(destination, []);
      destinations.get(destination).push({ plan, outputPath });
    }
  }
  for (const group of destinations.values()) {
    for (const { plan, outputPath } of group) {
      if (group.length > 1 || fs.existsSync(outputPath)) {
        plan.supported = false;
        plan.reason =
          group.length > 1
            ? `Multiple inputs would write to the same output: ${outputPath}`
            : `Output file already exists: ${outputPath}`;
      }
    }
  }
  return plans;
}
async function convertFiles(
  inputPaths,
  outputDir,
  format,
  options = {},
  progress = () => {},
) {
  const started = Date.now();
  const plans = await buildPlans(inputPaths, outputDir, format, options);
  const parameters = await resolveParameters(
    inputPaths,
    outputDir,
    format,
    options,
  );
  const queue = new JobQueue(options.concurrency ?? 1);
  const staging = new Map();
  let completed = plans.filter((p) => !p.supported).length;
  const notify = () =>
    progress({
      completed,
      total: plans.length,
      message:
        format === "txt"
          ? "Recognizing text; first use may download OCR resources…"
          : "Converting…",
    });
  for (const event of ["jobCompleted", "jobFailed"])
    queue.on(event, () => {
      completed++;
      notify();
    });
  const jobs = [];
  let logs = [];
  try {
    for (const plan of plans) {
      if (!plan.supported) {
        jobs.push({
          input_path: plan.inputPath,
          output_path: plan.outputPath,
          status: "failed",
          error: plan.reason,
          duration: 0,
          retryCount: 0,
        });
        continue;
      }
      fs.mkdirSync(path.dirname(plan.outputPath), { recursive: true });
      const directory = fs.mkdtempSync(
        path.join(path.dirname(plan.outputPath), ".fileconverter-"),
      );
      const stagedPath = path.join(directory, path.basename(plan.outputPath));
      staging.set(stagedPath, { directory, plan });
      await queue.addJob(
        { ...plan, outputPath: stagedPath },
        options.retries ?? 2,
        parameters,
      );
    }
    notify();
    const result = await queue.waitForCompletion();
    for (const job of result.jobs) {
      const { plan, directory } = staging.get(job.plan.outputPath);
      const outputPaths = plan.outputPaths || [plan.outputPath];
      let error = job.error;
      if (job.status === "success") {
        try {
          const published = [];
          try {
            for (const destination of outputPaths) {
              const source = path.join(directory, path.basename(destination));
              try {
                fs.linkSync(source, destination);
              } catch (cause) {
                if (
                  !["EPERM", "ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(
                    cause.code,
                  )
                )
                  throw cause;
                fs.copyFileSync(
                  source,
                  destination,
                  fs.constants.COPYFILE_EXCL,
                );
              }
              published.push({ destination, stat: fs.statSync(destination) });
            }
          } catch (cause) {
            for (const { destination, stat } of published) {
              try {
                const current = fs.lstatSync(destination);
                if (current.ino === stat.ino && current.dev === stat.dev)
                  fs.unlinkSync(destination);
              } catch {
                /* Preserve the original publication error. */
              }
            }
            throw cause;
          }
        } catch (cause) {
          error = `Could not save output without overwriting: ${cause.message}`;
        }
      }
      jobs.push({
        input_path: plan.inputPath,
        output_path: outputPaths[0],
        output_paths: outputPaths,
        status: job.status === "success" && !error ? "completed" : "failed",
        error,
        duration: job.duration,
        retryCount: job.retryCount,
        warning: plan.warning,
      });
    }
    logs = queue.getJobLogs().map((log) => ({
      ...log,
      outputPath:
        staging.get(log.outputPath)?.plan.outputPaths?.[0] ||
        staging.get(log.outputPath)?.plan.outputPath ||
        log.outputPath,
      outputPaths: staging.get(log.outputPath)?.plan.outputPaths,
    }));
    // Include validation and publication errors as final log entries as well.
    for (const job of jobs.filter((j) => j.status === "failed"))
      logs.push({
        inputPath: job.input_path,
        outputPath: job.output_path,
        success: false,
        error: job.error,
        duration: job.duration,
        parameters,
      });
  } finally {
    await queue.waitForCompletion();
    for (const { directory } of staging.values())
      fs.rmSync(directory, { recursive: true, force: true });
  }
  const succeeded = jobs.filter((j) => j.status === "completed").length;
  const ordered = plans.map((plan) =>
    jobs.find((job) => job.input_path === plan.inputPath),
  );
  return {
    success: plans.length > 0 && succeeded === jobs.length,
    message: `${succeeded} of ${jobs.length} files converted.`,
    totalJobs: jobs.length,
    successfulJobs: succeeded,
    failedJobs: jobs.length - succeeded,
    totalDuration: Date.now() - started,
    jobs: ordered,
    logs,
  };
}
async function handleRequest(action, payload, progress) {
  if (action === "convert")
    return convertFiles(
      payload.inputPaths,
      payload.outputDir,
      payload.format,
      payload.options,
      progress,
    );
  if (action === "preview")
    return buildPlans(
      payload.inputPaths,
      payload.outputDir,
      payload.format,
      payload.options,
    );
  if (action === "inputs:inspect") {
    if (
      !Array.isArray(payload.inputPaths) ||
      payload.inputPaths.some((p) => !absolute(p))
    )
      throw new Error("Invalid inputs.");
    const plans = [];
    for (const input of payload.inputPaths) {
      try {
        plans.push(
          ...(await scanForFiles(
            input,
            payload.outputDir || input,
            "txt",
            !!payload.recursive,
          )),
        );
      } catch {
        plans.push({ inputPath: input, inputFormat: "unknown" });
      }
    }
    return plans.map((plan) => ({
      inputPath: plan.inputPath,
      inputFormat: plan.inputFormat,
    }));
  }
  if (action === "info") {
    const adapters = new AdapterManager();
    return {
      adapters: adapters.listAdapters(),
      conversions: adapters.listAdapters().flatMap((a) =>
        a.supportedInputFormats.flatMap((inputFormat) =>
          a.supportedOutputFormats.map((outputFormat) => ({
            inputFormat,
            outputFormat,
            adapter: a.name,
            requiresOperation: inputFormat === "pdf" && outputFormat === "pdf",
          })),
        ),
      ),
      coreVersion: require("@fileconverter/core/package.json").version,
    };
  }
  const config = manager(payload.projectDirectory);
  if (action === "presets:list") return config.listPresets();
  if (
    !["global", "local"].includes(payload.scope) ||
    (payload.scope === "local" && !payload.projectDirectory)
  )
    throw new Error("Local presets require a project folder.");
  const builtins = (await config.listPresets()).filter(
    (p) => p.scope === "builtin",
  );
  if (
    typeof payload.name !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,99}$/.test(payload.name) ||
    builtins.some((p) => p.name === payload.name)
  )
    throw new Error(
      "Choose a valid custom preset name; built-in presets are read-only.",
    );
  if (action === "presets:delete")
    return config.deletePreset(payload.name, payload.scope);
  if (action === "presets:create") {
    if (typeof payload.description !== "string" || !payload.description.trim())
      throw new Error("A description is required.");
    const parameters = config.parsePresetParameters(payload.parameters);
    if (!config.validatePresetParameters(payload.type, parameters))
      throw new Error("Invalid parameters for this preset type.");
    validateOptions(parameters);
    await config.createPreset(
      payload.name,
      payload.description,
      payload.type,
      parameters,
      payload.scope,
    );
    return true;
  }
  throw new Error("Unknown request.");
}
if (process.send)
  process.once("message", async (request) => {
    try {
      const action = request.action || "convert";
      const result = await handleRequest(
        action,
        request.payload || request,
        (progress) => process.send({ progress }),
      );
      process.send({ ok: true, result }, () => process.disconnect());
    } catch (error) {
      process.send({ ok: false, error: error.message }, () =>
        process.disconnect(),
      );
    }
  });
module.exports = { convertFiles, buildPlans, handleRequest };
