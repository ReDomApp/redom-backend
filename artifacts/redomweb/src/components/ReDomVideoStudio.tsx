import { useState } from "react";
import { api } from "../lib/api";

type Mode = "video" | "movie" | "cartoon";
type VideoJob = { jobId: string; status: string; downloadUrl?: string | null; error?: string | null; model?: string };
type Project = { projectId: string; state: string; title?: string; project?: { title?: string; state?: string }; episodes?: Array<{title:string;synopsis:string}>; model?: string; status?: string; shotCount?: number };

const css = `
.redom-video-studio{max-width:920px;margin:0 auto;padding:24px;color:var(--text-primary,#17202a)}
.redom-video-studio *{box-sizing:border-box}
.rvs-heading{margin:0 0 8px;font-size:28px;font-weight:750;letter-spacing:-.6px}
.rvs-muted{color:var(--text-secondary,#667085);line-height:1.5}
.rvs-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:22px 0}
.rvs-mode{padding:16px 14px;border:1px solid #d9e0e8;border-radius:14px;background:var(--surface,#fff);text-align:left;color:inherit;cursor:pointer}
.rvs-mode[aria-pressed=true]{border:2px solid #1877f2;padding:15px 13px;background:color-mix(in srgb,#1877f2 6%,white)}
.rvs-mode strong{display:block;font-size:15px;margin-bottom:6px}
.rvs-panel{border:1px solid var(--border,#e3e8ef);border-radius:16px;background:var(--surface,#fff);padding:20px;display:grid;gap:16px}
.rvs-field{display:grid;gap:7px;font-size:13px;font-weight:650}
.rvs-field input,.rvs-field textarea,.rvs-field select{width:100%;border:1px solid #cfd6df;border-radius:10px;padding:12px;font:inherit;background:var(--surface,#fff);color:inherit}
.rvs-field textarea{min-height:128px;resize:vertical}
.rvs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.rvs-button{background:#1877f2;color:#fff;border:0;border-radius:10px;padding:13px 18px;font-weight:700;cursor:pointer}
.rvs-button:disabled{opacity:.55;cursor:wait}
.rvs-secondary{background:transparent;color:inherit;border:1px solid #cfd6df;border-radius:10px;padding:11px 15px;font-weight:650;cursor:pointer}
.rvs-status{padding:13px;border-radius:10px;background:#f2f6fc;color:#183d70;overflow-wrap:anywhere}
.rvs-error{padding:13px;border-radius:10px;background:#fff0f0;color:#a61b1b}
.rvs-result{display:grid;gap:10px;margin-top:18px}
@media(max-width:640px){.redom-video-studio{padding:16px}.rvs-modes{grid-template-columns:1fr}.rvs-grid{grid-template-columns:1fr}.rvs-panel{padding:15px}.rvs-heading{font-size:24px}}
`;

function toDataUri(file: File): Promise<string> {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read the reference image."));reader.readAsDataURL(file);});
}

export default function ReDomVideoStudio() {
  const [mode,setMode]=useState<Mode>("video");
  const [prompt,setPrompt]=useState("");
  const [reference,setReference]=useState("");
  const [duration,setDuration]=useState("20");
  const [storyMode,setStoryMode]=useState<"standalone"|"series">("standalone");
  const [aspect,setAspect]=useState("16:9");
  const [resolution,setResolution]=useState("720p");
  const [quality,setQuality]=useState("high");
  const [audio,setAudio]=useState(true);
  const [voice,setVoice]=useState(true);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const [job,setJob]=useState<VideoJob|null>(null);
  const [project,setProject]=useState<Project|null>(null);
  const [planReady,setPlanReady]=useState(false);

  const resetResult=()=>{setJob(null);setProject(null);setPlanReady(false);setStatus("");setError("");};
  const chooseReference=async(file?:File)=>{if(!file)return;if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("Choose a PNG, JPEG, or WebP reference image.");return;}if(file.size>15*1024*1024){setError("Reference images must be 15 MB or smaller.");return;}try{setReference(await toDataUri(file));setError("");}catch(e){setError(e instanceof Error?e.message:"Could not read image.");}};

  const create=async()=>{
    if(prompt.trim().length<5){setError("Describe the video, movie, or cartoon you want to create.");return;}
    setBusy(true);setError("");setStatus("Preparing your production and detecting the language of your prompt…");resetResult();
    try{
      if(mode==="video"){
        const result=await api<VideoJob & {success?:boolean}>("/ai/video",{method:"POST",body:JSON.stringify({prompt:prompt.trim(),referenceImageDataUri:reference||undefined,format:"video",durationSeconds:Number(duration),resolution,aspectRatio:aspect,watermark:true})});
        setJob(result);setStatus("Generation queued. ReDom is rendering and will burn your localized caption into the final video.");void pollVideo(result.jobId);
      }else{
        const result=await api<Project>("/ai/video/projects",{method:"POST",body:JSON.stringify({prompt:prompt.trim()+"\\n\\nProduction structure: "+(storyMode==="series"?"episodic series with recurring characters and a clear episode arc":"one-time standalone story with a complete ending"),referenceImageDataUri:reference||undefined,format:mode,duration:Number(duration),quality,aspectRatio:aspect,audio,voice})});
        setProject(result);setStatus("Project created. Building the story plan and character/scene structure…");
        const planned=await api<Project & {success?:boolean;episodes?:Array<{title:string;synopsis:string}>}>(`/ai/video/projects/${result.projectId}/plan`,{method:"POST",body:JSON.stringify({})});
        setProject({...planned,title:planned.project?.title||planned.title});setPlanReady(true);setStatus("Plan ready for review. Start production when you are satisfied with the story structure.");
      }
    }catch(e){setError(e instanceof Error?e.message:"Could not start this ReDom production.");setStatus("");}
    finally{setBusy(false);}
  };

  const pollVideo=async(jobId:string)=>{
    for(let i=0;i<120;i++){
      await new Promise(resolve=>setTimeout(resolve,5000));
      try{
        const next=await api<VideoJob>(`/ai/video/${encodeURIComponent(jobId)}`);
        setJob(next);
        if(next.status==="completed"){setStatus("Video complete. The localized caption and ReDom brand mark are embedded in the final render.");return;}
        if(next.status==="failed"||next.status==="blocked"){setError(next.error||"The generation job did not complete.");setStatus("");return;}
        setStatus(next.status==="processing"?"Rendering your scenes, caption and final watermark…":"Your job is queued for the native video worker…");
      }catch(e){if(i===119)setError(e instanceof Error?e.message:"Could not check video status.");}
    }
    setStatus("Rendering is still in progress. You can return to this project and check its status later.");
  };


  const pollProject=async(projectId:string)=>{
    for(let i=0;i<180;i++){
      await new Promise(resolve=>setTimeout(resolve,5000));
      try{
        const current=await api<any>(`/ai/video/projects/${encodeURIComponent(projectId)}`);
        const state=String(current.project?.state||current.state||"producing");
        setProject(previous=>previous?{...previous,state,title:current.project?.title||previous.title}:previous);
        if(state==="completed"){
          const output=await api<VideoJob>(`/ai/video/${encodeURIComponent("movie_project_"+projectId)}`);
          setJob(output);setStatus("Production complete. The final movie or cartoon has its localized caption and ReDom watermark.");return;
        }
        if(state==="failed"||state==="blocked"){setError("Production "+state+". Review the project status and try revising the plan.");setStatus("");return;}
        setStatus("Production in progress. ReDom is rendering shots and assembling the final episode…");
      }catch(e){if(i===179)setError(e instanceof Error?e.message:"Could not check production status.");}
    }
    setStatus("Production is still running. Reopen this project to check again.");
  };

  const produce=async()=>{
    if(!project?.projectId)return;
    setBusy(true);setError("");setStatus("Submitting the approved production to the GPU worker…");
    try{const result=await api<Project>(`/ai/video/projects/${project.projectId}/produce`,{method:"POST",body:JSON.stringify({})});setProject({...project,...result});setStatus("Production started. ReDom is generating shots and will assemble the final branded episode.");void pollProject(project.projectId);}
    catch(e){setError(e instanceof Error?e.message:"Could not start production.");setStatus("");}
    finally{setBusy(false);}
  };

  return <main className="redom-video-studio">
    <style>{css}</style>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}><div style={{width:44,height:44,borderRadius:12,background:"#1877f2",color:"#fff",display:"grid",placeItems:"center",fontWeight:800,fontSize:20}}>R</div><div><h1 className="rvs-heading">ReDom Video Studio</h1><div className="rvs-muted">Create short scenes, cinematic stories and animated episodes.</div></div></div>
    <div className="rvs-modes" role="group" aria-label="Choose production format">
      <button className="rvs-mode" aria-pressed={mode==="video"} onClick={()=>{setMode("video");resetResult();}}><strong>ReDom Videos</strong><span className="rvs-muted">Short clips, social videos and quick dramas.</span></button>
      <button className="rvs-mode" aria-pressed={mode==="movie"} onClick={()=>{setMode("movie");resetResult();}}><strong>ReDom Movie Studio</strong><span className="rvs-muted">Screenplays, scenes, recurring characters and episodes.</span></button>
      <button className="rvs-mode" aria-pressed={mode==="cartoon"} onClick={()=>{setMode("cartoon");resetResult();}}><strong>ReDom Cartoon</strong><span className="rvs-muted">Animated shorts, comedy, horror, children’s stories and series.</span></button>
    </div>
    <section className="rvs-panel">
      <label className="rvs-field">Describe what you want to create<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={8000} placeholder={mode==="cartoon"?"Example: Create a funny animated episode about a clever fox and a shy turtle. Write it in the language I used in this prompt.":"Describe the story, characters, action, mood, camera angles and intended audience. ReDom detects the language you use."}/></label>
      <label className="rvs-field">Character or visual reference image <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void chooseReference(e.target.files?.[0])}/><span className="rvs-muted">Optional. PNG, JPEG or WebP; maximum 15 MB.</span></label>
      {mode!=="video"&&<label className="rvs-field">Story structure<select value={storyMode} onChange={e=>setStoryMode(e.target.value as "standalone"|"series")}><option value="standalone">One-time story or short</option><option value="series">Episodes with recurring characters</option></select></label>}
      <div className="rvs-grid">
        <label className="rvs-field">Duration<select value={duration} onChange={e=>setDuration(e.target.value)}>{[10,20,30,45,60,90,120,180,300].map(v=><option key={v} value={v}>{v<60?v+" seconds":Math.floor(v/60)+" min"+(v%60?" "+v%60+" sec":"")}</option>)}</select></label>
        <label className="rvs-field">Aspect ratio<select value={aspect} onChange={e=>setAspect(e.target.value)}><option value="16:9">Landscape 16:9</option><option value="9:16">Portrait 9:16</option><option value="1:1">Square 1:1</option></select></label>
        <label className="rvs-field">{mode==="video"?"Resolution":"Production quality"}<select value={mode==="video"?resolution:quality} onChange={e=>mode==="video"?setResolution(e.target.value):setQuality(e.target.value)}>{mode==="video"?<><option value="720p">720p</option><option value="1080p">1080p</option></>:<><option value="fast">Fast</option><option value="standard">Standard</option><option value="high">High</option><option value="pro">Pro</option></>}</select></label>
      </div>
      {mode!=="video"&&<div className="rvs-grid"><label className="rvs-field" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={audio} onChange={e=>setAudio(e.target.checked)}/> Include audio direction</label><label className="rvs-field" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={voice} onChange={e=>setVoice(e.target.checked)}/> Include voice direction</label></div>}
      <div className="rvs-muted">Language detection and a caption in your prompt’s language are automatic. Final renders include the appropriate ReDom logo and AI-generated label.</div>
      <button className="rvs-button" disabled={busy} onClick={()=>void create()}>{busy?"Working…":mode==="video"?"Generate video":mode==="movie"?"Create movie plan":"Create cartoon plan"}</button>
      {status&&<div className="rvs-status" role="status">{status}</div>}
      {error&&<div className="rvs-error" role="alert">{error}</div>}
      {planReady&&project&&<div className="rvs-result"><h2 style={{margin:"4px 0"}}>{project.title||project.project?.title||"Production plan ready"}</h2><p className="rvs-muted">Review the story plan in your project before starting GPU generation. The production remains editable until rendering begins.</p>{project.episodes?.length ? <ol style={{paddingLeft:22,display:"grid",gap:10}}>{project.episodes.slice(0,12).map((episode,index)=><li key={index}><strong>{episode.title}</strong><div className="rvs-muted">{episode.synopsis}</div></li>)}</ol> : null}<button className="rvs-button" disabled={busy} onClick={()=>void produce()}>Start production</button></div>}
      {job?.downloadUrl&&job.status==="completed"&&<div className="rvs-result"><a className="rvs-button" href={job.downloadUrl}>Open completed video</a></div>}
      {project?.projectId&&<div className="rvs-muted">Project ID: {project.projectId}</div>}
      {job?.jobId&&<div className="rvs-muted">Generation job: {job.jobId} · Status: {job.status}</div>}
    </section>
  </main>;
}
