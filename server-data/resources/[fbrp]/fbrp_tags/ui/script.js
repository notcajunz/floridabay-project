// Escape anything player-provided before it goes into innerHTML.
// Names / callsigns / aliases are typed by players, so never trust them as HTML.
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Only allow http(s) image URLs for the department logo.
const safeImage = (url) => {
  const str = String(url ?? "");
  return /^https?:\/\//i.test(str) ? escapeHtml(str) : "";
};

let hideTimer = null;

const showCard = (innerRows, info, duration) => {
  const name = escapeHtml(info.name);
  const html = `
    <div id="id-card">
      <div id="top-info">
        <h2 id="state-name">Florida Bay</h2>
        <h2 id="top-id" style="color: #187943">LEO IDENTIFICATION CARD</h2>
      </div>
      <div id="info-wrapper">
        <div id="id-photo">
          <img src="${safeImage(info.dep_img)}" alt="PHOTO" id="id-pic" />
          <h2 id="signature">${name}</h2>
        </div>
        <div id="personal-info">
          <h2>
            <span class="info-text">Department<br></span>
            <span id="first-name">${escapeHtml(info.dep_name)}</span>
          </h2>
          ${innerRows}
        </div>
      </div>
    </div>
  `;

  document.body.innerHTML = html;

  // A new card replaces the old one, so cancel the old card's hide timer.
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    document.body.innerHTML = "";
    hideTimer = null;
  }, duration);
};

window.addEventListener("message", (e) => {
  const info = e.data;
  if (!info || !info.show) return;

  if (info.type === "showleoid") {
    let identifier = `${escapeHtml(info.callsign)} - ${escapeHtml(info.name)}`;
    if (info.rank) {
      identifier += `<br>${escapeHtml(info.rank)}`;
    }

    showCard(
      `<h2>
        <span class="info-text">Identifier<br></span>
        <span id="last-name">${identifier}</span>
      </h2>`,
      info,
      info.duration || 6500
    );
  } else if (info.type === "showleobusinesscard") {
    showCard(
      `<h2>
        <span class="info-text">Identifier<br></span>
        <span id="last-name">${escapeHtml(info.callsign)} - ${escapeHtml(info.name)}</span>
      </h2>
      <h2>
        <span class="info-text">Number<br></span>
        <span class="number">${escapeHtml(info.number)}</span>
      </h2>`,
      info,
      10000
    );
  }
});
