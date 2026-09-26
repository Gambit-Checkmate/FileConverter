import { useState } from 'react';
import { CheckCircle, FolderOpen, Upload, XCircle } from 'lucide-react';
import './App.css';

const outputFormats = ['jpg', 'png', 'webp', 'tiff', 'pdf', 'html', 'txt', 'md'];

function App() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('png');
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState('');

  async function selectFiles() {
    try {
      const paths = await window.fileConverter.selectFiles();
      if (paths.length > 0) {
        setSelectedFiles((current) => [...new Set([...current, ...paths])]);
        setConversionResult(null);
        setError('');
      }
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function selectOutputDir() {
    try {
      const path = await window.fileConverter.selectOutputFolder();
      if (path) {
        setOutputDir(path);
        setError('');
      }
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function startConversion() {
    setIsConverting(true);
    setConversionResult(null);
    setError('');
    try {
      const result: ConversionResult = await window.fileConverter.convertFiles(selectedFiles, outputDir, selectedFormat);
      setConversionResult(result);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setIsConverting(false);
    }
  }

  async function openOutputFolder() {
    try {
      await window.fileConverter.openOutputFolder(outputDir);
    } catch (cause) {
      setError(String(cause));
    }
  }

  return (
    <div className="app">
      <header className="header"><h1>FileConverter</h1></header>
      <main className="main">
        <section className="section">
          <h2>Files</h2>
          <button className="file-select-btn" onClick={selectFiles} disabled={isConverting}>
            <Upload size={20} /> Select files
          </button>
          {selectedFiles.length > 0 && (
            <div className="file-list">
              <p>{selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected</p>
              {selectedFiles.map((file) => <div className="file-item" key={file}>{file}</div>)}
              <button className="text-btn" onClick={() => setSelectedFiles([])} disabled={isConverting}>Clear selection</button>
            </div>
          )}
        </section>

        <section className="section">
          <h2>Output folder</h2>
          <button className="folder-select-btn" onClick={selectOutputDir} disabled={isConverting}>
            <FolderOpen size={20} /> Select output folder
          </button>
          {outputDir && <div className="output-dir"><span>{outputDir}</span><button className="open-btn" onClick={openOutputFolder}>Open</button></div>}
        </section>

        <section className="section">
          <h2>Output format</h2>
          <select className="format-select" value={selectedFormat} onChange={(event) => setSelectedFormat(event.target.value)} disabled={isConverting}>
            {outputFormats.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
          </select>
          <p className="hint">Only supported format pairs can be converted. Results are shown for each file.</p>
        </section>

        <section className="section">
          <button className="convert-btn" onClick={startConversion} disabled={isConverting || selectedFiles.length === 0 || !outputDir}>
            {isConverting ? 'Converting…' : 'Start conversion'}
          </button>
        </section>

        {error && <div className="section result error" role="alert"><XCircle size={20} />{error}</div>}
        {conversionResult && (
          <section className="section" aria-live="polite">
            <h2>Results</h2>
            <div className={`result ${conversionResult.success ? 'success' : 'error'}`}>
              {conversionResult.success ? <CheckCircle size={20} /> : <XCircle size={20} />}
              {conversionResult.message}
            </div>
            <div className="file-list">
              {conversionResult.jobs.map((job) => (
                <div className="file-item" key={job.input_path}>
                  <strong>{job.status === 'completed' ? '✓' : '✗'} {job.input_path}</strong>
                  <div>{job.status === 'completed' ? job.output_path : job.error}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
