const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validHttps = (raw) => { try { const u = new URL(raw); return u.protocol === "https:" ? u.href : "#"; } catch { return "#"; } };
async function json(url) { const r = await fetch(url, {headers: {"Accept":"application/json"}, credentials:"same-origin"}); if(!r.ok) throw new Error("Request failed: " + r.status); return r.json(); }
function card(c) {
  const reward = c.reward_advertised ? (c.reward_amount_text || "Reward wording detected — verify") : "No reward confirmed by automatic extraction";
  return `<article class="card"><h3>${esc(c.title)}</h3><div class="meta">${esc(c.agency)} · Last checked ${esc(c.retrieved_at || "unknown")}</div><span class="reward ${c.reward_advertised ? "" : "unknown"}">${esc(reward)}</span><p class="summary">${esc((c.summary || "").slice(0,420))}${(c.summary||"").length>420?"…":""}</p><div class="meta">Source: <a target="_blank" rel="noopener noreferrer" href="${validHttps(c.source_url)}">official notice ↗</a></div><div class="actions"><button data-detail="${esc(c.id)}">View report</button><a target="_blank" rel="noopener noreferrer" href="${validHttps(c.tip_url || c.source_url)}">Reporting instructions ↗</a></div></article>`;
}
async function loadCases() {
  $("status").textContent = "Loading…";
  try {
    const params = new URLSearchParams({q:$("q").value, reward_only:String($("reward").checked), limit:"200"});
    const data = await json("/api/cases?" + params);
    $("total").textContent = data.count;
    $("rewards").textContent = data.cases.filter(c=>c.reward_advertised).length;
    $("cases").innerHTML = data.cases.length ? data.cases.map(card).join("") : '<div class="empty">No indexed notices yet. Use the protected admin ingestion endpoint to import an allowlisted official page.</div>';
    $("status").textContent = "Updated";
  } catch(e) { $("status").textContent = "Service unavailable"; $("cases").innerHTML = '<div class="empty">Could not load case records. Check that the service is running.</div>'; }
}
async function loadSources() {
  try {
    const [sources, links] = await Promise.all([json("/api/sources"),json("/api/reporting-links")]);
    $("sources").textContent = sources.length;
    $("links").innerHTML = links.map(s=>`<a target="_blank" rel="noopener noreferrer" href="${validHttps(s.case_list)}"><strong>${esc(s.agency)}</strong><br><small>Official case listings ↗</small></a>`).join("");
  } catch { $("links").innerHTML = '<div class="empty">Reporting links unavailable.</div>'; }
}
async function showDetail(id) {
  try {
    const c = await json("/api/cases/" + encodeURIComponent(id));
    const r = await fetch("/api/cases/" + encodeURIComponent(id) + "/report.md");
    const text = await r.text();
    $("detail-body").innerHTML = `<h2>${esc(c.title)}</h2><p><a target="_blank" rel="noopener noreferrer" href="${validHttps(c.source_url)}">Open original source ↗</a></p><pre class="detail-text">${esc(text)}</pre><p><a target="_blank" rel="noopener noreferrer" href="${validHttps(c.tip_url || c.source_url)}">Open official reporting destination ↗</a></p>`;
    $("detail").showModal();
  } catch { $("status").textContent = "Could not open report"; }
}
$("refresh").addEventListener("click", loadCases);
$("q").addEventListener("input", () => { clearTimeout(window.searchTimer); window.searchTimer=setTimeout(loadCases,250); });
$("reward").addEventListener("change", loadCases);
$("cases").addEventListener("click", e => { const b=e.target.closest("[data-detail]"); if(b) showDetail(b.dataset.detail); });
$("close").addEventListener("click", () => $("detail").close());
loadCases(); loadSources();
