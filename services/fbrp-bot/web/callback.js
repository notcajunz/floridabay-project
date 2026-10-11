const params = new URLSearchParams(location.hash.slice(1));
const status = document.querySelector("#callback-status");
const back = document.querySelector("#callback-return");

async function finish() {
  const accessToken = params.get("access_token");
  const state = params.get("state");
  if (!accessToken || !state) throw new Error(params.get("error_description") || "Discord sign-in was cancelled.");
  history.replaceState(null, "", location.pathname);
  const response = await fetch("../api/auth/discord", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, state }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Discord sign-in failed.");
  if (String(result.next || "").startsWith("transcript:"))
    location.replace(`../transcript.html?id=${encodeURIComponent(result.next.slice("transcript:".length))}`);
  else location.replace(result.next === "verify" ? `../verify.html?done=1&role=${encodeURIComponent(result.role || "")}` : "../portal.html");
}

finish().catch((error) => {
  status.textContent = error.message;
  back.hidden = false;
  document.querySelector("#callback-spinner")?.remove();
});
