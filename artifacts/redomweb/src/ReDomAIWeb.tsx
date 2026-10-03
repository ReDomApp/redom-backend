import { useState } from "react";
import { api, WebApiError } from "./lib/api";
import ReDomMark from "./assets/brand/redom-mark.svg";

type Quota = { entitlement: string; used: number; limit: number; remaining: number; resetAt: string };
type Result = { success: boolean; image: string; model: string; jobId?: string; generationMs?: number; quota?: Quota };

type VideoJob = {
  jobId: string;
  status: string;
  model?: string;
  runtime?: string;
  operation?: "generate" | "cgi";
  durationSeconds?: number;
  downloadUrl?: string | null;
  error?: string | null;
};

function quotaErrorMessage(error: unknown) {
  if (error instanceof WebApiError && error.code === "IMAGE_QUOTA_EXCEEDED") {
    const quota = (error.details as { quota?: Quota } | undefined)?.quota;
    const reset = quota?.resetAt ? new Date(quota.resetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    return "You’ve reached your current image-generation limit." + (reset ? " You can create another image at " + reset + "." : "") + " Upgrade your ReDom AI plan for enhanced image support.";
  }
  return error instanceof Error ? error.message : "ReDom-1.6RD— Image is temporarily unavailable.";
}

function toDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image."));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

export function ReDomAIWeb({ go }: { go: (path: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState("");
  const [model, setModel] = useState("ReDom-1.6RD— Image");
  const [jobId, setJobId] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [quota, setQuota] = useState<Quota | null>(null);
  const [videoMode, setVideoMode] = useState(false);
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null);

  const generateVideo = async () => {
    const value = prompt.trim();
    if (!value || loading) return;
    setLoading(true);
    setError("");
    setVideoJob(null);
    try {
      const created = await api<{ success: boolean; jobId: string; status: string; model: string; runtime: string }>("/ai/video", {
        method: "POST",
        body: JSON.stringify({ prompt: value, operation: "generate", durationSeconds: 300, resolution: "720p", aspectRatio: "16:9" }),
      });
      setModel(created.model);
      setVideoJob({ jobId: created.jobId, status: created.status, model: created.model, runtime: created.runtime });

      let status = created.status;
      for (let i = 0; i < 180 && status !== "completed" && status !== "failed" && status !== "blocked"; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const current = await api<{ success: boolean } & VideoJob>("/ai/video/" + encodeURIComponent(created.jobId));
        status = current.status;
        setVideoJob(current);
        if (current.downloadUrl || current.error) break;
      }
      if (status !== "completed") throw new Error("ReDom-v2.8—Video could not complete this request.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ReDom-v2.8—Video is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    const value = prompt.trim();
    if (!value || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await api<Result>("/ai/image", { method: "POST", body: JSON.stringify({ prompt: value }) });
      if (!result.image) throw new Error("ReDom-1.6RD— Image returned no image.");
      setImage(result.image);
      setModel(result.model || "ReDom-1.6RD— Image");
      setJobId(result.jobId || "");
      setQuota(result.quota || null);
      setEditing(false);
    } catch (e) {
      setError(quotaErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const edit = async () => {
    if (!reference || !prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await api<Result>("/ai/image/edit", { method: "POST", body: JSON.stringify({ imageDataUri: reference, prompt: prompt.trim() }) });
      if (!result.image) throw new Error("ReDom-1.6RD— Image returned no edited image.");
      setImage(result.image);
      setModel(result.model || "ReDom-1.6RD— Image");
      setJobId(result.jobId || "");
      setQuota(result.quota || null);
      setEditing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ReDom-1.6RD— Image could not edit this image.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="route-parity">
    <div className="parity-head">
      <button className="parity-back" aria-label="Back" onClick={() => go("/app/homeFeed")}>‹</button>
      <div>
        <div className="parity-eyebrow">AI</div>
        <h1>ReDom AI</h1>
        <p>{videoMode ? "Create paid ReDom-v2.8—Video projects with ReDom-controlled generation and output validation." : "Generate and edit images with the ReDom-controlled image engine."}</p>
      </div>
    </div>

    <section className="parity-card" style={{ display: "grid", gap: 16 }}>
      {quota ? <small style={{ color: "#667085" }}>Image allowance: {quota.remaining} of {quota.limit} remaining · resets {new Date(quota.resetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small> : null}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={ReDomMark} alt="" style={{ width: 44, height: 44 }} />
        <div><b>{model}</b><small style={{ display: "block", color: "#667085", marginTop: 3 }}>ReDom GPU inference environment</small></div>
      </div>

      {image && !videoMode ? <img src={image} alt="Generated by ReDom AI" style={{ width: "100%", maxWidth: 768, borderRadius: 18, display: "block" }} /> : null}
      {videoJob?.downloadUrl ? <video controls src={videoJob.downloadUrl} style={{ width: "100%", maxWidth: 900, borderRadius: 18, display: "block" }} /> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className={"parity-btn " + (!videoMode ? "parity-primary" : "parity-secondary")} onClick={() => setVideoMode(false)}>Image</button>
        <button className={"parity-btn " + (videoMode ? "parity-primary" : "parity-secondary")} onClick={() => setVideoMode(true)}>Video</button>
      </div>

      {videoMode ? <small style={{ color: "#667085" }}>ReDom-v2.8—Video is a paid ReDom feature. Projects can be up to 5 minutes and are rendered on ReDom-controlled GPU infrastructure before security validation and delivery.</small> : null}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={videoMode ? "Describe the video or CGI scene you want to create" : editing ? "Describe the changes to make" : "Describe the image you want to create"}
        rows={5}
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <label className="parity-btn parity-secondary" style={{ cursor: "pointer" }}>
          Reference image
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try { setReference(await toDataUri(file)); setEditing(true); setError(""); }
            catch (err) { setError(err instanceof Error ? err.message : "Could not read the reference image."); }
          }} />
        </label>
        {reference ? <button className="parity-btn parity-secondary" onClick={() => { setReference(""); setEditing(false); }}>Remove reference</button> : null}
        <button
          className="parity-btn parity-primary"
          disabled={!prompt.trim() || loading}
          onClick={() => void (videoMode ? generateVideo() : (reference ? edit() : generate()))}
        >
          {loading ? (videoMode ? "Rendering…" : "Creating…") : videoMode ? "Create video" : reference ? "Edit image" : "Create image"}
        </button>
      </div>

      {reference && !videoMode ? <small style={{ color: "#667085" }}>The selected reference image is sent only with this explicit ReDom AI image request.</small> : null}
      {videoJob ? <small style={{ color: "#667085" }}>Video job: {videoJob.jobId} · {videoJob.status}</small> : null}
      {jobId ? <small style={{ color: "#667085" }}>Generation: {jobId}</small> : null}
      {error ? <div className="parity-error">{error}</div> : null}
    </section>
  </div>;
}
