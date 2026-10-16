const button = document.querySelector("#verify-button");
const message = document.querySelector("#verify-message");
const params = new URLSearchParams(location.search);

if (params.get("done")) {
  document.querySelector("#verify-start").style.display = "none";
  document.querySelector("#verify-done").style.display = "grid";
  const role = params.get("role");
  if (params.get("authorized") === "1")
    document.querySelector("#verify-done-text").textContent = "You are verified and authorized. /join and the community server selector can now add you directly to Florida Bay servers.";
  else if (role === "pending")
    document.querySelector("#verify-done-text").textContent = "You are verified. Join the Florida Bay Discord and your member role will be applied the moment you arrive.";
  else if (role === "failed")
    document.querySelector("#verify-done-text").textContent = "You are verified, but the member role could not be applied automatically. Ask a staff member to assign it.";
}

button.addEventListener("click", async () => {
  button.disabled = true;
  message.textContent = "";
  try {
    const response = await fetch("api/auth/start?next=verify", { credentials: "same-origin", cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.error || "Could not start Discord sign-in.");
    location.href = result.url;
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});
