const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const BASKET_KEY = "fbrp_tebex_basket_v2";
const state = { catalog: null, basket: null, identity: null, category: "all", search: "", currentProduct: null, busy: false };

function text(html = "") {
  const document = new DOMParser().parseFromString(String(html), "text/html");
  return document.body.textContent?.replace(/\s+/g, " ").trim() || "";
}
function safeImage(value) {
  try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function money(value, currency = state.catalog?.store?.currency || "USD") {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency || "USD"), currencyDisplay: "narrowSymbol" }).format(Number(value || 0)); }
  catch { return `${Number(value || 0).toFixed(2)} ${currency}`; }
}
function packageId(item) { return String(item.ident || item.id); }
function packageImage(item) {
  const primary = [...(item.media || [])].sort((a, b) => Number(b.primary) - Number(a.primary)).find((asset) => asset.type === "image");
  return safeImage(primary?.url || item.image);
}
function allPackages() { return (state.catalog?.categories || []).flatMap((category) => (category.packages || []).map((item) => ({ ...item, _category: category }))); }
function productById(id) { return allPackages().find((item) => packageId(item) === String(id)); }
function initials(value) { return String(value || "FB").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function quantity(item) { return Number(item.in_basket?.quantity || item.quantity || 1); }

async function api(path, options = {}) {
  const response = await fetch(`/api/store/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.error || "The store could not complete that request."); error.status = response.status; error.payload = payload; throw error; }
  return payload;
}
function toast(message, error = false) {
  const node = $("#toast"); node.textContent = message; node.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = "toast", 3200);
}
function setBusy(value) { state.busy = value; $("#cart")?.classList.toggle("busy", value); $("#product-dialog")?.classList.toggle("busy", value); }

async function load() {
  const saved = localStorage.getItem(BASKET_KEY) || "";
  const query = saved ? `?basket=${encodeURIComponent(saved)}` : "";
  try {
    const [catalog, identity] = await Promise.all([api(`catalog${query}`), api("identity")]);
    state.catalog = catalog; state.identity = identity;
    if (saved) {
      try { state.basket = (await api(`basket?id=${encodeURIComponent(saved)}`)).basket; }
      catch (error) { if ([400, 404, 422].includes(error.status)) localStorage.removeItem(BASKET_KEY); else throw error; }
    }
    render(); handleReturn();
  } catch (error) {
    $("#loading-grid").hidden = true;
    if (error.status === 503 && error.payload?.configured === false) $("#setup-state").hidden = false;
    else { $("#empty-state").hidden = false; $("#empty-state h3").textContent = "The store is taking a breather."; $("#empty-state p").textContent = error.message; }
  }
}

function render() {
  $("#loading-grid").hidden = true;
  renderIdentity(); renderCategories(); renderProducts(); renderModules(); renderCart();
}
function renderIdentity() {
  const button = $("#discord-account"); const label = $("#discord-account-label");
  button.classList.toggle("connected", Boolean(state.identity?.authenticated));
  label.textContent = state.identity?.authenticated ? state.identity.user?.username || "Discord connected" : "Sign in with Discord";
}
function signIn() { window.location.assign("https://floridabay.net/store-login"); }
function renderCategories() {
  const categories = state.catalog?.categories || [];
  $("#all-count").textContent = allPackages().length;
  const list = $("#category-list"); list.replaceChildren();
  for (const category of categories) {
    const button = document.createElement("button"); button.type = "button"; button.className = `category${state.category === String(category.id) ? " active" : ""}`; button.dataset.category = category.id;
    const label = document.createElement("span"); label.textContent = category.name;
    const count = document.createElement("b"); count.textContent = (category.packages || []).length;
    button.append(label, count); list.append(button);
  }
  $("[data-category='all']").classList.toggle("active", state.category === "all");
}
function renderProducts() {
  const query = state.search.toLowerCase();
  const products = allPackages().filter((item) => (state.category === "all" || String(item._category.id) === state.category) && (!query || `${item.name} ${text(item.description)} ${item._category.name}`.toLowerCase().includes(query)));
  const grid = $("#product-grid"); grid.replaceChildren(); $("#empty-state").hidden = products.length > 0;
  for (const item of products) {
    const card = document.createElement("article"); card.className = "product"; card.dataset.product = packageId(item);
    const media = document.createElement("button"); media.type = "button"; media.className = "product-media"; media.setAttribute("aria-label", `View ${item.name}`);
    const image = packageImage(item);
    media.innerHTML = `${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : `<span class="monogram">${escapeHtml(initials(item.name))}</span>`}<span class="product-type">${item.type === "subscription" || item.is_recurring ? "Membership" : "One time"}</span>`;
    const body = document.createElement("div"); body.className = "product-body";
    const original = Number(item.base_price || 0) + Number(item.discount || 0);
    body.innerHTML = `<span class="product-category"></span><h3></h3><p class="product-description"></p><div class="product-buy"><span class="price">${Number(item.discount) > 0 ? `<del>${money(original, item.currency)}</del>` : ""}<strong>${money(item.total_price ?? item.base_price, item.currency)}</strong><small>${item.type === "subscription" || item.is_recurring ? "recurring" : "one-time"}</small></span><button class="add" type="button">Add to basket</button></div>`;
    $(".product-category", body).textContent = item._category.name; $("h3", body).textContent = item.name; $(".product-description", body).textContent = text(item.description) || "Support Florida Bay with this package.";
    card.append(media, body); grid.append(card);
  }
}
function renderModules() {
  const rail = $("#community-rail"); rail.replaceChildren();
  const modules = state.catalog?.sidebar || [];
  for (const module of modules.slice(0, 4)) {
    const card = document.createElement("section"); card.className = "module";
    const data = module.data || {}; const label = document.createElement("span"); label.className = "module-label"; label.textContent = data.header || module.type?.replaceAll("_", " ") || "Florida Bay"; card.append(label);
    if (["payment_goal", "community_goal"].includes(module.type)) {
      card.innerHTML += `<h3>${Number(data.percentage || 0).toFixed(0)}% of the way</h3><p>Thank you for keeping Florida Bay moving.</p><div class="progress"><i style="width:${Math.min(100,Math.max(0,Number(data.percentage || 0)))}%"></i></div>`;
    } else if (module.type === "top_customer") {
      const h3 = document.createElement("h3"); h3.textContent = data.username || "Our community"; const p = document.createElement("p"); p.textContent = "Top supporter this month"; card.append(h3, p);
    } else if (module.type === "recent_payments") {
      for (const payment of (data.payments || []).slice(0, 4)) { const row = document.createElement("div"); row.className = "payment"; row.innerHTML = `<span class="avatar">${escapeHtml(initials(payment.username))}</span><div><b></b><span></span></div>`; $("b", row).textContent = payment.username; $(".payment span", row).textContent = payment.package?.name || "Supporter"; card.append(row); }
    } else if (module.type === "featured_package" && data.package) {
      const h3 = document.createElement("h3"); h3.textContent = data.package.name; const p = document.createElement("p"); p.textContent = `${money(data.package.total_price ?? data.package.base_price, data.package.currency)} · Featured package`; card.append(h3, p);
    } else { const p = document.createElement("p"); p.textContent = text(data.text) || "Every purchase helps fund the next chapter of Florida Bay."; card.append(p); }
    rail.append(card);
  }
  if (!rail.children.length) { const card = document.createElement("section"); card.className = "module"; card.innerHTML = `<span class="module-label">Community funded</span><h3>Built for better stories.</h3><p>Support goes back into hosting, development, and original Florida Bay systems.</p>`; rail.append(card); }
}

function renderCart() {
  const items = state.basket?.packages || []; const count = items.reduce((sum, item) => sum + quantity(item), 0); $("#cart-count").textContent = count;
  $("#cart-empty").hidden = items.length > 0; $("#cart-content").hidden = !items.length; $("#cart-footer").hidden = !items.length;
  if (!items.length) return;
  const account = $("#cart-account"); account.replaceChildren();
  const discord = document.createElement("span"); discord.textContent = `Discord: ${state.identity?.user?.username || "not connected"}`;
  const fivem = document.createElement("b"); fivem.textContent = state.basket.username ? `FiveM: ${state.basket.username}` : "FiveM account links before checkout";
  account.append(discord, document.createTextNode(" · "), fivem);
  const list = $("#cart-items"); list.replaceChildren();
  for (const item of items) {
    const catalogItem = productById(item.ident || item.id) || item; const row = document.createElement("article"); row.className = "cart-item"; row.dataset.product = packageId(catalogItem);
    const image = packageImage(catalogItem); const thumb = image ? document.createElement("img") : document.createElement("span"); thumb.className = "cart-thumb"; if (image) { thumb.src = image; thumb.alt = ""; }
    const copy = document.createElement("div"); copy.innerHTML = `<h3></h3><p>${item.type === "subscription" || item.is_recurring ? "Recurring package" : "One-time package"}</p><div class="cart-controls"><button type="button" data-action="down" aria-label="Decrease quantity">−</button><span>${quantity(item)}</span><button type="button" data-action="up" aria-label="Increase quantity">+</button><button class="remove" type="button" data-action="remove">Remove</button></div>`; $("h3", copy).textContent = item.name;
    const price = document.createElement("strong"); price.textContent = money(item.in_basket?.price ?? 0, state.basket.currency); row.append(thumb, copy, price); list.append(row);
  }
  $("#cart-subtotal").textContent = money(state.basket.base_price, state.basket.currency); $("#cart-total").textContent = money(state.basket.total_price, state.basket.currency);
}

async function ensureBasket() {
  if (!state.identity?.authenticated) { signIn(); throw new Error("Sign in with Discord to continue."); }
  if (state.basket?.ident) return state.basket;
  state.basket = (await api("basket/create", { method: "POST", body: "{}" })).basket;
  localStorage.setItem(BASKET_KEY, state.basket.ident); return state.basket;
}
const PENDING_KEY = "fbrp_tebex_pending_package";
function needsAccountLink(basket) { return Boolean(state.catalog?.store?.supports_usernames) && !basket?.username; }
// Tebex refuses to add packages ("User must login before adding packages to basket") until the basket
// is linked to the buyer's FiveM account, so link first and remember the package for when they return.
async function linkAccount(basket, pendingId) {
  const { providers } = await api("basket/auth", { method: "POST", body: JSON.stringify({ basket: basket.ident }) });
  const url = safeImage((providers || [])[0]?.url);
  if (!url) throw new Error("Tebex did not provide an account sign-in link.");
  if (pendingId) localStorage.setItem(PENDING_KEY, pendingId);
  toast("Link your FiveM account with Tebex to add packages. Redirecting…");
  window.location.assign(url);
}
async function addToBasket(item, basket) {
  state.basket = (await api("basket/package", { method: "POST", body: JSON.stringify({ basket: basket.ident, package: packageId(item), quantity: 1, dynamic: packageId(item).startsWith("dyn_") }) })).basket;
  localStorage.setItem(BASKET_KEY, state.basket.ident); renderCart(); toast(`${item.name} added to your basket.`);
}
async function addProduct(item) {
  if (state.busy) return; if (!state.identity?.authenticated) return signIn(); setBusy(true);
  try {
    const basket = await ensureBasket();
    if (needsAccountLink(basket)) { await linkAccount(basket, packageId(item)); return; }
    await addToBasket(item, basket);
  }
  catch (error) { toast(error.message, true); } finally { setBusy(false); }
}
// Back from the Tebex FiveM sign-in: add the package the buyer originally clicked.
async function resumePending() {
  const id = localStorage.getItem(PENDING_KEY); if (!id) return;
  localStorage.removeItem(PENDING_KEY);
  const item = productById(id); if (!item || !state.basket?.ident) return;
  if (needsAccountLink(state.basket)) { toast("Tebex did not confirm your FiveM account. Try adding the package again.", true); return; }
  setBusy(true);
  try { await addToBasket(item, state.basket); } catch (error) { toast(error.message, true); } finally { setBusy(false); }
}
async function cartAction(id, action) {
  if (state.busy || !state.basket) return; const item = productById(id) || state.basket.packages.find((entry) => String(entry.ident || entry.id) === id); const current = quantity(state.basket.packages.find((entry) => String(entry.ident || entry.id) === id) || {}); setBusy(true);
  try { state.basket = (await api("basket/package", { method:"POST", body:JSON.stringify({ basket:state.basket.ident, package:id, action:action === "remove" || (action === "down" && current <= 1) ? "remove" : "quantity", quantity:action === "up" ? current + 1 : current - 1 }) })).basket; renderCart(); if (!state.basket.packages?.length) toast(`${item?.name || "Package"} removed.`); }
  catch(error){toast(error.message,true)} finally{setBusy(false)}
}
async function applyCode() {
  const code = $("#code-input").value.trim(); if (!code || !state.basket || state.busy) return; setBusy(true);
  try { state.basket = (await api("basket/code", { method:"POST", body:JSON.stringify({ basket:state.basket.ident, type:$("#code-type").value, code }) })).basket; $("#code-input").value=""; renderCart(); toast("Code applied."); }
  catch(error){toast(error.message,true)} finally{setBusy(false)}
}
async function checkout() {
  if (!state.basket || state.busy) return; setBusy(true);
  try {
    if (!state.identity?.authenticated) { signIn(); return; }
    if (state.catalog.store.supports_usernames && !state.basket.username) {
      const { providers } = await api("basket/auth", { method:"POST", body:JSON.stringify({ basket:state.basket.ident }) }); const provider = (providers || [])[0]; if (!provider?.url) throw new Error("Tebex did not provide an account sign-in link."); window.location.assign(provider.url); return;
    }
    if (!safeImage(state.basket.links?.checkout)) throw new Error("Tebex checkout is not ready for this basket."); window.location.assign(state.basket.links.checkout);
  } catch(error){toast(error.message,true);setBusy(false)}
}
function openCart() { $("#scrim").hidden=false; $("#cart").classList.add("open"); $("#cart").setAttribute("aria-hidden","false"); $("#cart-open").setAttribute("aria-expanded","true"); document.body.style.overflow="hidden"; setTimeout(()=>$("#cart-close").focus(),50); }
function closeCart() { $("#cart").classList.remove("open"); $("#cart").setAttribute("aria-hidden","true"); $("#cart-open").setAttribute("aria-expanded","false"); $("#scrim").hidden=true; document.body.style.overflow=""; }
function openProduct(item) { state.currentProduct=item; const image=packageImage(item); $("#dialog-media").innerHTML=image?`<img src="${escapeHtml(image)}" alt="">`:`<span class="monogram">${escapeHtml(initials(item.name))}</span>`; $("#dialog-category").textContent=item._category.name; $("#dialog-title").textContent=item.name; $("#dialog-description").textContent=text(item.description)||"Support Florida Bay with this package."; $("#dialog-price").textContent=money(item.total_price??item.base_price,item.currency); $("#product-dialog").showModal(); }
function handleReturn() { const params=new URLSearchParams(location.search); const result=params.get("checkout"); if(result){const node=$("#checkout-result");node.hidden=false;const paid=result==="complete"&&state.basket?.complete;node.textContent=paid?"Thank you for supporting Florida Bay. Tebex has confirmed your payment and will deliver eligible perks automatically.":result==="complete"?"Tebex is still confirming your payment. Keep your receipt and check your account shortly.":"Checkout was cancelled. Your basket is still here whenever you’re ready.";history.replaceState({},"",location.pathname);if(paid){localStorage.removeItem(BASKET_KEY);state.basket=null;renderCart();}} else if(params.get("auth")==="complete"){history.replaceState({},"",location.pathname);toast("FiveM account linked.");openCart();resumePending();} else if(params.get("signin")==="complete"){history.replaceState({},"",location.pathname);toast("Discord connected for automatic role delivery.");} else if(params.get("signin")==="expired"){history.replaceState({},"",location.pathname);toast("That Discord sign-in expired. Please try again.",true);} }

document.addEventListener("click", (event) => {
  const category=event.target.closest("[data-category]"); if(category){state.category=category.dataset.category;renderCategories();renderProducts();return}
  const card=event.target.closest(".product"); if(card){const item=productById(card.dataset.product);if(event.target.closest(".add"))addProduct(item);else if(event.target.closest(".product-media"))openProduct(item);return}
  const control=event.target.closest(".cart-controls button");if(control){cartAction(control.closest(".cart-item").dataset.product,control.dataset.action);return}
});
$("#search").addEventListener("input",(event)=>{state.search=event.target.value.trim();renderProducts()});
$("#discord-account").addEventListener("click",()=>{if(!state.identity?.authenticated)signIn()});
$("#cart-open").addEventListener("click",openCart);$("#cart-close").addEventListener("click",closeCart);$("#scrim").addEventListener("click",closeCart);$("#cart-browse").addEventListener("click",closeCart);$("#checkout").addEventListener("click",checkout);$("#code-apply").addEventListener("click",applyCode);
$(".dialog-close").addEventListener("click",()=>$("#product-dialog").close());$("#dialog-add").addEventListener("click",async()=>{await addProduct(state.currentProduct);$("#product-dialog").close();openCart()});
document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&$("#cart").classList.contains("open"))closeCart()});
load();
