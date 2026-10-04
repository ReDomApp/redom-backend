import "../creative-studio.css";
import { useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

type Intelligence = {
  metadata: { mimeType: string; bytes: number; width: number | null; height: number | null; aspectRatio: number | null; format: string; hasAlpha: boolean | null };
  request: { operation: string; objective: string; targetPlatform?: string; targetBytes?: number };
  analysis: { likelyBrand: string | null; brandConfidence: number | null; evidence: string[]; detectedText: string[]; objects: string[]; colors: string[]; typography: string[]; composition: string; visualStyle: string[]; intendedUses: string[] };
  plan: { operation: string; steps: string[]; preserve: string[]; change: string[]; warnings: string[] };
  platform?: { name: string; dimensions?: { width: number; height: number }; aspectRatio?: string; maxBytes?: number; formats?: string[]; notes: string[] };
};

function dataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be decoded."));
    image.src = src;
  });
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The browser could not encode the image.")), type, quality);
  });
}

async function prepareImage(src: string, width: number, height: number, targetBytes?: number) {
  const image = await loadImage(src);
  const targetWidth = Math.max(1, Math.round(width || image.naturalWidth));
  const targetHeight = Math.max(1, Math.round(height || image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const drawCover = (outWidth: number, outHeight: number) => {
    const scale = Math.max(outWidth / image.naturalWidth, outHeight / image.naturalHeight);
    const sourceWidth = outWidth / scale;
    const sourceHeight = outHeight / scale;
    const sourceX = Math.max(0, (image.naturalWidth - sourceWidth) / 2);
    const sourceY = Math.max(0, (image.naturalHeight - sourceHeight) / 2);
    ctx.clearRect(0, 0, outWidth, outHeight);
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outWidth, outHeight);
  };

  let outWidth = targetWidth;
  let outHeight = targetHeight;
  drawCover(outWidth, outHeight);
  const type = "image/webp";
  let quality = 0.92;
  let blob = await canvasBlob(canvas, type, quality);
  const limit = targetBytes && targetBytes > 0 ? targetBytes : Infinity;

  for (let attempt = 0; attempt < 18 && blob.size > limit; attempt += 1) {
    quality -= 0.05;
    if (quality >= 0.35) {
      blob = await canvasBlob(canvas, type, Math.max(0.35, quality));
    } else {
      outWidth = Math.max(320, Math.round(outWidth * 0.88));
      outHeight = Math.max(180, Math.round(outHeight * 0.88));
      canvas.width = outWidth;
      canvas.height = outHeight;
      drawCover(outWidth, outHeight);
      quality = 0.78;
      blob = await canvasBlob(canvas, type, quality);
    }
  }
  if (blob.size > limit) throw new Error(`The browser could not reach the requested file-size limit without reducing the image further. Final size: ${Math.ceil(blob.size / 1024)} KB.`);
  return { blob, width: outWidth, height: outHeight };
}

async function makePdf(src: string) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  const jpeg = await canvasBlob(canvas, "image/jpeg", 0.92);
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0];
  let position = 0;
  const push = (value: Uint8Array) => { parts.push(value); position += value.length; };
  const text = (value: string) => push(encoder.encode(value));
  text("%PDF-1.4\n");
  offsets[1] = position; text("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets[2] = position; text("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets[3] = position;
  const pageWidth = image.naturalWidth * 72 / 96;
  const pageHeight = image.naturalHeight * 72 / 96;
  text(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n`);
  offsets[4] = position; text(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.naturalWidth} /Height ${image.naturalHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`); push(jpegBytes); text("\nendstream\nendobj\n");
  offsets[5] = position;
  const content = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im Do\nQ\n`;
  text(`5 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  const xref = position;
  text("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) text(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  text(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

export default function ReDomCreativeStudio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("");
  const [targetKb, setTargetKb] = useState("");
  const [analysis, setAnalysis] = useState<Intelligence | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const sizeLabel = useMemo(() => file ? `${(file.size / 1024).toFixed(1)} KB` : "", [file]);

  const chooseFile = async (selected: File | null) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) { setError("Please upload an image file."); return; }
    if (selected.size > 35 * 1024 * 1024) { setError("This image is larger than ReDom AI's supported upload size."); return; }
    setFile(selected);
    setPreview(await dataUri(selected));
    setAnalysis(null);
    setError("");
    setStatus("");
  };

  const applyWorkflow = async (result: Intelligence) => {
    const operation = result.plan.operation;
    if (["compress"].includes(operation)) { await compress(result); return; }
    if (["platform_prepare"].includes(operation)) { await preparePlatform(result); return; }
    if (["convert_to_pdf"].includes(operation)) { await pdf(); return; }
    if (["edit","text_replacement","creative_branding","enhance","upscale"].includes(operation)) { await editImage(result); return; }
    setStatus("Analysis completed. ReDom did not modify the image because the request was informational.");
  };

  const analyze = async (overridePrompt?: string, autoApply = false) => {
    if (!preview) { setError("Upload an image first."); return; }
    const request = overridePrompt ?? prompt;
    setBusy(true); setError(""); setStatus("Understanding the image and researching the request…");
    try {
      const targetBytes = targetKb ? Math.floor(Number(targetKb) * 1024) : undefined;
      const result = await api<Intelligence>("/ai/image/intelligence", {
        method: "POST",
        body: JSON.stringify({ dataUri: preview, prompt: request, targetPlatform: platform || undefined, targetBytes }),
      });
      setAnalysis(result);
      setStatus(result.analysis.likelyBrand ? `Image understood. Likely brand: ${result.analysis.likelyBrand}.` : "Image understood and workflow planned.");
      if (autoApply) await applyWorkflow(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image intelligence failed.");
      setStatus("");
    } finally { setBusy(false); }
  };

  const editImage = async (intel: Intelligence | null = analysis) => {
    if (!preview) { setError("Upload an image first."); return; }
    setBusy(true); setError(""); setStatus("Applying the requested creative edit…");
    try {
      const context = intel ? [
        `Detected colors: ${intel.analysis.colors.join(", ")}`,
        `Detected typography: ${intel.analysis.typography.join(", ")}`,
        `Composition: ${intel.analysis.composition}`,
        `Preserve: ${intel.plan.preserve.join(", ")}`,
        `Change: ${intel.plan.change.join(", ")}`,
      ].join("\n") : "";
      const response = await api<any>("/ai/image/edit", {
        method: "POST",
        body: JSON.stringify({
          imageDataUri: preview,
          prompt: `${prompt.trim() || "Improve this image professionally."}\n\nReDom Image Intelligence context:\n${context}\n\nEdit only what the user requested. Preserve all unrelated visual elements. If this is a branding request inspired by another brand, create an original ReDom result and do not copy protected logos or distinctive trademarks.`,
          outputFormat: "webp",
        }),
      });
      if (!response?.image) throw new Error("The image editor returned no image.");
      setPreview(response.image);
      const bytes = atob(response.image.split(",")[1] || "");
      const array = Uint8Array.from(bytes, c => c.charCodeAt(0));
      setFile(new File([array], "redom-creative-result.webp", { type: "image/webp" }));
      setStatus("Creative edit completed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image edit failed.");
      setStatus("");
    } finally { setBusy(false); }
  };

  const preparePlatform = async (intel: Intelligence | null = analysis) => {
    if (!preview) return;
    const p = intel?.platform;
    if (!p?.dimensions) { setError("Research the requested platform first so ReDom can use its current dimensions."); return; }
    setBusy(true); setError(""); setStatus(`Preparing the image for ${p.name}…`);
    try {
      const result = await prepareImage(preview, p.dimensions.width, p.dimensions.height, p.maxBytes || (targetKb ? Number(targetKb) * 1024 : undefined));
      setPreview(URL.createObjectURL(result.blob));
      setFile(new File([result.blob], `redom-${p.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.webp`, { type: "image/webp" }));
      downloadBlob(result.blob, `redom-${p.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.webp`);
      setStatus(`Prepared and downloaded: ${result.width} × ${result.height}, ${Math.ceil(result.blob.size / 1024)} KB.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Platform preparation failed."); setStatus(""); }
    finally { setBusy(false); }
  };

  const compress = async (intel: Intelligence | null = analysis) => {
    const requestedBytes = intel?.request.targetBytes || (targetKb ? Number(targetKb) * 1024 : 0);
    if (!preview || !requestedBytes) { setError("Tell ReDom the maximum file size, for example 500 KB."); return; }
    setBusy(true); setError(""); setStatus("Optimizing image size…");
    try {
      const img = await loadImage(preview);
      const result = await prepareImage(preview, img.naturalWidth, img.naturalHeight, requestedBytes);
      setPreview(URL.createObjectURL(result.blob));
      setFile(new File([result.blob], "redom-compressed.webp", { type: "image/webp" }));
      downloadBlob(result.blob, "redom-compressed.webp");
      setStatus(`Compressed successfully: ${Math.ceil(result.blob.size / 1024)} KB.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Compression failed."); setStatus(""); }
    finally { setBusy(false); }
  };

  const pdf = async () => {
    if (!preview) return;
    setBusy(true); setError(""); setStatus("Creating the downloadable PDF…");
    try { const blob = await makePdf(preview); downloadBlob(blob, "redom-image.pdf"); setStatus("PDF created and downloaded."); }
    catch (e) { setError(e instanceof Error ? e.message : "PDF creation failed."); setStatus(""); }
    finally { setBusy(false); }
  };

  return <div className="creative-studio">
    <div className="creative-hero">
      <div><span className="creative-kicker">ReDom AI</span><h1>Image Intelligence &amp; Creative Studio</h1><p>Upload an image and describe the objective naturally. ReDom understands the image, researches current requirements when needed, chooses the appropriate workflow, and produces a usable result.</p></div>
      <div className="creative-badge">Nothing generic</div>
    </div>

    <div className="creative-grid">
      <section className="creative-card">
        <div className="creative-card-head"><div><h2>Reference image</h2><p>Brand, text, colors, layout, dimensions and file properties are inspected from the actual upload.</p></div><button className="creative-secondary" onClick={() => inputRef.current?.click()}>Upload image</button></div>
        <input ref={inputRef} hidden type="file" accept="image/*" onChange={e => void chooseFile(e.target.files?.[0] || null)}/>
        {preview ? <div className="creative-preview"><img src={preview} alt="Uploaded reference"/></div> : <button className="creative-dropzone" onClick={() => inputRef.current?.click()}><strong>Upload an image</strong><span>PNG, JPEG, WebP and other browser-supported image formats</span></button>}
        {file ? <div className="creative-meta"><span>{file.name}</span><span>{sizeLabel}</span></div> : null}
      </section>

      <section className="creative-card">
        <h2>What do you want to accomplish?</h2>
        <p>Use normal language. You do not need to know image-processing terminology.</p>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder='Examples: "Find out what brand this is", "Make this my Facebook cover", "Change only ReDom to Facebook", "Use these colors to make a ReDom logo", "Compress this below 500 KB", "Make this look more professional".'/>
        <div className="creative-chips">
          {["Identify this brand","Make this my Facebook cover","Change only the text","Build ReDom branding from this","Compress below 500 KB","Make this beautiful","Export as PDF"].map(x => <button key={x} onClick={() => { setPrompt(x); if (x.includes("Facebook")) setPlatform("Facebook"); if (x.includes("500")) setTargetKb("500"); }}>{x}</button>)}
        </div>
        <div className="creative-options">
          <label>Platform (optional)<input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="Facebook, LinkedIn, YouTube…"/></label>
          <label>Maximum size KB (optional)<input value={targetKb} onChange={e => setTargetKb(e.target.value.replace(/[^0-9]/g,""))} placeholder="500"/></label>
        </div>
        <div className="creative-actions">
          <button className="creative-primary" disabled={busy || !preview} onClick={() => void analyze(undefined, true)}>{busy ? "Working…" : "Understand & do it"}</button>
          <button className="creative-secondary" disabled={busy || !preview} onClick={() => void analyze()}>{busy ? "Working…" : "Understand image"}</button>
        </div>
        {status ? <div className="creative-status">{status}</div> : null}
        {error ? <div className="creative-error">{error}</div> : null}
      </section>
    </div>

    {analysis ? <section className="creative-card creative-results">
      <div className="creative-card-head"><div><h2>Image intelligence</h2><p>{analysis.request.objective}</p></div><span className="creative-operation">{analysis.plan.operation}</span></div>
      <div className="creative-facts">
        <div><b>Format</b><span>{analysis.metadata.format}</span></div>
        <div><b>Dimensions</b><span>{analysis.metadata.width && analysis.metadata.height ? `${analysis.metadata.width} × ${analysis.metadata.height}` : "Detected by visual analysis"}</span></div>
        <div><b>File size</b><span>{Math.ceil(analysis.metadata.bytes / 1024)} KB</span></div>
        <div><b>Aspect ratio</b><span>{analysis.metadata.aspectRatio ? analysis.metadata.aspectRatio.toFixed(3) : "—"}</span></div>
      </div>
      {analysis.analysis.likelyBrand ? <div className="creative-brand"><strong>Likely brand: {analysis.analysis.likelyBrand}</strong>{analysis.analysis.brandConfidence != null ? <span>Confidence {Math.round(analysis.analysis.brandConfidence)}%</span> : null}<p>{analysis.analysis.evidence.join(" ")}</p></div> : null}
      <div className="creative-columns">
        <div><h3>Detected text</h3><p>{analysis.analysis.detectedText.length ? analysis.analysis.detectedText.join(" · ") : "No visible text was confidently detected."}</p></div>
        <div><h3>Colors</h3><p>{analysis.analysis.colors.length ? analysis.analysis.colors.join(" · ") : "No reliable palette returned."}</p></div>
        <div><h3>Visual style</h3><p>{analysis.analysis.visualStyle.length ? analysis.analysis.visualStyle.join(" · ") : "No style summary returned."}</p></div>
        <div><h3>Intended uses</h3><p>{analysis.analysis.intendedUses.length ? analysis.analysis.intendedUses.join(" · ") : "No intended use identified."}</p></div>
      </div>
      {analysis.platform ? <div className="creative-platform"><h3>{analysis.platform.name} preparation</h3><p>{analysis.platform.dimensions ? `${analysis.platform.dimensions.width} × ${analysis.platform.dimensions.height}` : "Dimensions not verified"}{analysis.platform.aspectRatio ? ` · ${analysis.platform.aspectRatio}` : ""}{analysis.platform.maxBytes ? ` · max ${Math.ceil(analysis.platform.maxBytes / 1024)} KB` : ""}</p><ul>{analysis.platform.notes.map((x,i)=><li key={i}>{x}</li>)}</ul><button className="creative-primary" onClick={() => void preparePlatform()} disabled={busy || !analysis.platform.dimensions}>Prepare &amp; download</button></div> : null}
      <div className="creative-plan"><div><h3>Preserve</h3><ul>{analysis.plan.preserve.map((x,i)=><li key={i}>{x}</li>)}</ul></div><div><h3>Change</h3><ul>{analysis.plan.change.map((x,i)=><li key={i}>{x}</li>)}</ul></div><div><h3>Steps</h3><ol>{analysis.plan.steps.map((x,i)=><li key={i}>{x}</li>)}</ol></div></div>
      <div className="creative-export"><button className="creative-secondary" onClick={() => void compress()} disabled={busy || !targetKb}>Compress &amp; download</button><button className="creative-secondary" onClick={() => void pdf()} disabled={busy}>Download PDF</button></div>
    </section> : null}
  </div>;
}
