const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const ticketId = Number(new URLSearchParams(location.search).get("id"));
const requestedRefresh = new URLSearchParams(location.search).get("refresh") === "1";
let payload = null;

const api = async (path, options = {}) => {
  const response = await fetch(`api/${path}`, { ...options, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
  return data;
};
const date = (value) => value ? new Date(Number(value)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
const size = (bytes) => { const n = Number(bytes || 0); return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`; };
const safeUrl = (value) => { try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : "#"; } catch { return "#"; } };

function show(id) {
  for (const selector of ["#transcript-loading", "#transcript-auth", "#transcript-error", "#transcript-view"]) $(selector).hidden = selector !== id;
}

function messageHtml(message) {
  const author = message.author || {};
  const content = esc(message.content).replace(/\n/g, "<br>");
  const embeds = (message.embeds || []).map((embed) => { const color = `#${Math.max(0, Number(embed.color || 4372696)).toString(16).padStart(6, "0").slice(-6)}`; return `<div class="transcript-embed" style="--embed:${color}"><small>${esc(embed.author || "Embedded message")}</small>${embed.title ? `<b>${esc(embed.title)}</b>` : ""}${embed.description ? `<p>${esc(embed.description).replace(/\n/g, "<br>")}</p>` : ""}${(embed.fields || []).map((field) => `<div><strong>${esc(field.name)}</strong><span>${esc(field.value).replace(/\n/g, "<br>")}</span></div>`).join("")}</div>`; }).join("");
  const attachments = (message.attachments || []).map((file) => {
    const url = safeUrl(file.url);
    const image = String(file.contentType || "").startsWith("image/") && url !== "#" ? `<img src="${esc(url)}" alt="${esc(file.name || "Ticket attachment")}" loading="lazy">` : "";
    return `<a class="transcript-attachment" href="${esc(url)}" target="_blank" rel="noopener">${image}<span><b>${esc(file.name || "Attachment")}</b><small>${esc(size(file.size))} · Open original</small></span></a>`;
  }).join("");
  const reactions = (message.reactions || []).map((r) => `<span class="transcript-reaction">${esc(r.emoji)} ${Number(r.count)}</span>`).join("");
  const searchable = `${author.name || ""} ${author.username || ""} ${message.content || ""} ${(message.embeds || []).map((e) => `${e.title || ""} ${e.description || ""}`).join(" ")}`.toLowerCase();
  return `<article class="transcript-message" data-search="${esc(searchable)}"><img src="${esc(safeUrl(author.avatar))}" alt="" loading="lazy"><div class="transcript-bubble"><header><b>${esc(author.name || author.username || "Unknown")}</b>${author.bot ? '<span class="pill pill-sea">BOT</span>' : ""}<small>@${esc(author.username || "unknown")} · ${esc(date(message.at))}</small></header>${content ? `<p>${content}</p>` : ""}${embeds}${attachments ? `<div class="transcript-attachments">${attachments}</div>` : ""}${reactions ? `<div class="transcript-reactions">${reactions}</div>` : ""}</div></article>`;
}

function render(data) {
  payload = data;
  const t = data.transcript;
  const ticket = t.ticket || {};
  document.title = `Ticket #${ticket.id} transcript · Florida Bay`;
  $("#transcript-type").textContent = ticket.typeLabel || "Support ticket";
  $("#transcript-title").textContent = ticket.subject || `Ticket #${ticket.id}`;
  $("#transcript-subtitle").textContent = `${ticket.guildName || "Florida Bay"} · private conversation archive`;
  $("#transcript-number").textContent = `#${ticket.id}`;
  $("#transcript-status").textContent = ticket.status === "closed" ? "Closed archive" : "Open ticket";
  $("#transcript-facts").innerHTML = `<div><small>Opened</small><b>${esc(date(ticket.createdAt))}</b></div><div><small>Status</small><b>${esc(ticket.status === "closed" ? "Closed" : "Open")}</b></div><div><small>Messages</small><b>${Number(t.messageCount || t.messages?.length || 0)}</b></div><div><small>Archive revision</small><b>${Number(t.revision || 1)}</b></div>${ticket.closeReason ? `<div class="wide"><small>Closure reason</small><b>${esc(ticket.closeReason)}</b></div>` : ""}`;
  $("#transcript-notice").hidden = !t.partial;
  $("#transcript-notice").innerHTML = t.partial ? `<div><b>Historical archive</b><br>${esc(t.archiveNotice || "This transcript was rebuilt from preserved ticket history.")}</div>` : "";
  $("#transcript-messages").innerHTML = (t.messages || []).map(messageHtml).join("") || '<div class="empty"><b>No messages captured</b><span>This ticket did not contain any transcriptable messages.</span></div>';
  $("#transcript-generated").textContent = `Generated ${date(t.generatedAt)} · revision ${Number(t.revision || 1)}`;
  $("#transcript-refresh").hidden = !data.viewer?.canRefresh;
  updateFilter();
  show("#transcript-view");
}

function updateFilter() {
  const query = String($("#transcript-search")?.value || "").trim().toLowerCase();
  const rows = [...document.querySelectorAll(".transcript-message")];
  let visible = 0;
  for (const row of rows) { const match = !query || row.dataset.search.includes(query); row.hidden = !match; if (match) visible += 1; }
  $("#transcript-result-count").textContent = query ? `${visible} of ${rows.length} messages` : `${rows.length} messages`;
}

async function load(refresh = requestedRefresh) {
  if (!Number.isSafeInteger(ticketId) || ticketId < 1) throw new Error("This transcript link is invalid.");
  const session = await api("auth/session");
  if (!session.authenticated) return show("#transcript-auth");
  show("#transcript-loading");
  render(await api(`transcript?id=${ticketId}${refresh ? "&refresh=1" : ""}`));
}

$("#transcript-search").addEventListener("input", updateFilter);
$("#transcript-refresh").addEventListener("click", async () => { const button = $("#transcript-refresh"); button.disabled = true; button.textContent = "Refreshing…"; try { await load(true); } catch (error) { alert(error.message); } finally { button.disabled = false; button.textContent = "Refresh archive"; } });
$("#transcript-login").addEventListener("click", async () => { try { location.href = (await api(`auth/start?next=transcript:${ticketId}`)).url; } catch (error) { $("#transcript-auth-message").textContent = error.message; } });
$("#transcript-dm-start").addEventListener("submit", async (event) => { event.preventDefault(); const discordId = new FormData(event.currentTarget).get("discordId"); try { await api("auth/dm/start", { method: "POST", body: JSON.stringify({ discordId }) }); $("#transcript-dm-verify").elements.discordId.value = discordId; event.currentTarget.hidden = true; $("#transcript-dm-verify").hidden = false; $("#transcript-auth-message").className = "form-message good"; $("#transcript-auth-message").textContent = "Code sent — check your Discord DMs."; } catch (error) { $("#transcript-auth-message").textContent = error.message; } });
$("#transcript-dm-verify").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api("auth/dm/verify", { method: "POST", body: JSON.stringify({ discordId: form.get("discordId"), code: form.get("code") }) }); await load(); } catch (error) { $("#transcript-auth-message").textContent = error.message; } });

load().catch((error) => { $("#transcript-error-message").textContent = error.message; show("#transcript-error"); });
