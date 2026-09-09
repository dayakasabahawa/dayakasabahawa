"use strict";

/* ============================================================
   දායක සභාව — Client-side video share
   Videos are stored in IndexedDB. A unique link carries an id.
   Anyone opening that link (on this browser) can download.
   ============================================================ */

const DB_NAME = "daayaka_sabahawa";
const DB_VERSION = 1;
const STORE = "videos";

let db = null;
let selectedFile = null;
let myVideos = [];

const $ = (id) => document.getElementById(id);

/* ---------------- IndexedDB ---------------- */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function putVideo(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

function getVideo(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllVideos() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

function deleteVideo(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------------- utilities ---------------- */
function uid(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

function fmtBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return v.toFixed(1) + " " + units[i];
}

function fmtDate(ms) {
  return new Date(ms).toLocaleString("si-LK", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fileExt(name) {
  const m = /\.([^.]+)$/.exec(name || "");
  return m ? m[1].toUpperCase() : "VIDEO";
}

function toast(msg, ms = 2400) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}

function videoTypeSupported() {
  const v = document.createElement("video");
  return v.canPlayType && (v.canPlayType("video/mp4") || v.canPlayType("video/webm") || v.canPlayType("video/ogg"));
}

/* ---------------- navigation ---------------- */
function showView(name) {
  document.querySelectorAll(".view").forEach((s) => s.classList.remove("active"));
  $("view-" + name).classList.add("active");
  addNav(name);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addNav(active) {
  const nav = $("topnav");
  const isHome = active === "upload";
  nav.innerHTML = "";
  const a = document.createElement("a");
  a.href = window.location.pathname + "#upload";
  a.textContent = isHome ? "වීඩියෝ උඩුගත කරන්න" : "← උඩුගත කිරීමට";
  nav.appendChild(a);
}

/* ---------------- routing ---------------- */
function route() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("v");
  if (id) {
    showView("download");
    loadDownload(id);
    return true;
  }
  showView("upload");
  return null;
}

/* ============================================================
   UPLOAD FLOW
   ============================================================ */
const dropzone = $("dropzone");
const fileInput = $("fileInput");

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
});

["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handleFile(f);
  else toast("දැන් වීඩියෝ ගොනුවක් ඇද දමන්න");
});

function handleFile(file) {
  if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|ogg|mkv|avi)$/i.test(file.name)) {
    toast("කරුණාකර වීඩියෝ ගොනුවක් තෝරන්න");
    return;
  }
  selectedFile = file;
  $("fileName").textContent = file.name;
  $("fileSize").textContent = fmtBytes(file.size);
  const url = URL.createObjectURL(file);
  $("previewVideo").src = url;
  $("filePreview").classList.remove("hidden");
  $("dzInner").classList.add("hidden");
  $("progressWrap").classList.add("hidden");
  $("progressFill").style.width = "0%";
  $("progressText").textContent = "0%";
  $("successCard").classList.add("hidden");
}

$("btnReset").addEventListener("click", () => resetUpload());
$("btnUpload").addEventListener("click", () => uploadSelected());

function resetUpload() {
  selectedFile = null;
  fileInput.value = "";
  $("previewVideo").removeAttribute("src");
  $("filePreview").classList.add("hidden");
  $("dzInner").classList.remove("hidden");
  $("successCard").classList.add("hidden");
}

async function uploadSelected() {
  if (!selectedFile) return;
  const btn = $("btnUpload");
  btn.disabled = true;
  $("progressWrap").classList.remove("hidden");

  const id = uid();
  const t0 = performance.now();

  // Simulated smooth progress while IndexedDB stores the blob.
  const progress = new Promise((res) => {
    let p = 0;
    const iv = setInterval(() => {
      p = Math.min(p + Math.random() * 18 + 8, 92);
      $("progressFill").style.width = p + "%";
      $("progressText").textContent = Math.round(p) + "%";
      if (p >= 92) { clearInterval(iv); res(); }
    }, 120);
  });

  const rawBlob = selectedFile;
  const url = URL.createObjectURL(rawBlob);
  const meta = await new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => res({ duration: v.duration || 0, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => res({ duration: 0, width: 0, height: 0 });
    v.src = url;
  });

  const record = {
    id,
    name: selectedFile.name,
    type: selectedFile.type || "video/mp4",
    size: selectedFile.size,
    blob: rawBlob,
    createdAt: Date.now(),
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
  };

  try {
    await Promise.all([progress, putVideo(record)]);
    $("progressFill").style.width = "100%";
    $("progressText").textContent = "100%";
    const elapsed = Math.max(400, performance.now() - t0);
    await new Promise((r) => setTimeout(r, 350));

    const link = makeLink(id);
    $("shareLink").value = link;
    resetUpload();
    $("successCard").classList.remove("hidden");
    toast("වීඩියෝව සාර්ථකව උඩුගත විය!");
    refreshList();
  } catch (err) {
    console.error(err);
    toast("උඩුගත කිරීම අසාර්ථක විය");
  } finally {
    btn.disabled = false;
    $("progressWrap").classList.add("hidden");
  }
}

function makeLink(id) {
  const url = new URL(window.location.href);
  url.search = "?v=" + id;
  url.hash = "";
  return url.href;
}

/* ---------------- share ---------------- */
$("btnCopy").addEventListener("click", async () => {
  const input = $("shareLink");
  const val = input.value;
  try {
    await navigator.clipboard.writeText(val);
    toast("ලින්ක් එක පිටපත් විය!");
  } catch (err) {
    input.select();
    document.execCommand("copy");
    toast("ලින්ක් එක පිටපත් විය!");
  }
});

function shareTo(url) {
  window.open(url, "_blank", "noopener,width=680,height=520");
}
$("btnWhatsapp").addEventListener("click", () => {
  if ($("shareLink").value)
    shareTo("https://wa.me/?text=" + encodeURIComponent($("shareLink").value));
});
$("btnFacebook").addEventListener("click", () => {
  if ($("shareLink").value)
    shareTo("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent($("shareLink").value));
});
$("btnTelegram").addEventListener("click", () => {
  if ($("shareLink").value)
    shareTo("https://t.me/share/url?url=" + encodeURIComponent($("shareLink").value) + "&text=" + encodeURIComponent("වීඩියෝවක් මට බෙදාගත්තා! 🎬"));
});
$("btnViber").addEventListener("click", () => {
  if ($("shareLink").value)
    shareTo("viber://forward?text=" + encodeURIComponent($("shareLink").value));
});

/* ============================================================
   MY VIDEOS LIST
   ============================================================ */
function refreshList() {
  getAllVideos().then((items) => {
    myVideos = items;
    $("myCount").textContent = items.length;
    const grid = $("listGrid");
    grid.innerHTML = "";

    if (!items.length) {
      $("emptyNote").classList.remove("hidden");
      return;
    }
    $("emptyNote").classList.add("hidden");

    items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "list-item";

      const thumb = document.createElement("div");
      thumb.className = "li-thumb";
      const v = document.createElement("video");
      v.src = URL.createObjectURL(item.blob);
      v.muted = true;
      v.preload = "metadata";
      thumb.appendChild(v);

      const body = document.createElement("div");
      body.className = "li-body";
      const name = document.createElement("div");
      name.className = "li-name";
      name.title = item.name;
      name.textContent = item.name;
      const meta = document.createElement("div");
      meta.className = "chip";
      meta.style.cssText = "margin-bottom:10px;display:inline-block;";
      meta.textContent = fmtBytes(item.size) + " · " + item.width + "×" + item.height;
      const actions = document.createElement("div");
      actions.className = "li-actions";

      const btnOpen = document.createElement("button");
      btnOpen.className = "btn primary";
      btnOpen.textContent = "ලින්ක්";
      btnOpen.addEventListener("click", () => {
        const link = makeLink(item.id);
        $("shareLink").value = link;
        resetUpload();
        showView("upload");
        $("successCard").classList.remove("hidden");
        $("successCard").scrollIntoView({ behavior: "smooth", block: "center" });
      });

      const btnDel = document.createElement("button");
      btnDel.className = "btn danger";
      btnDel.textContent = "මකන්න";
      btnDel.addEventListener("click", async () => {
        const ok = confirm('"' + item.name + '" මකා දමන්නද?');
        if (!ok) return;
        try {
          await deleteVideo(item.id);
          toast("වීඩියෝව මකා දැමුවා");
          refreshList();
        } catch (err) {
          toast("මකා දැමීම අසාර්ථකයි");
        }
      });

      actions.append(btnOpen, btnDel);
      body.append(name, meta, actions);
      el.append(thumb, body);
      grid.appendChild(el);
    });
  }).catch(() => {});
}

/* ============================================================
   DOWNLOAD FLOW
   ============================================================ */
async function loadDownload(id) {
  const loading = $("dlLoading");
  const error = $("dlError");
  const body = $("dlBody");
  loading.classList.remove("hidden");
  error.classList.add("hidden");
  body.classList.add("hidden");

  try {
    const record = await getVideo(id);
    await new Promise((r) => setTimeout(r, 550)); // small polish delay
    loading.classList.add("hidden");

    if (!record || !record.blob) {
      error.classList.remove("hidden");
      return;
    }

    const blobUrl = URL.createObjectURL(record.blob);
    $("dlTitle").textContent = record.name;
    $("dlSize").textContent = fmtBytes(record.size);
    $("dlType").textContent = fileExt(record.name);
    $("dlDate").textContent = fmtDate(record.createdAt);
    $("dlVideo").src = blobUrl;

    const a = $("btnDownload");
    a.onclick = () => {
      a.disabled = true;
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = record.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => { a.disabled = false; toast("බාගැනීම ආරම්භ විය"); }, 400);
    };

    body.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    loading.classList.add("hidden");
    error.classList.remove("hidden");
  }
}

$("btnGoHome").addEventListener("click", () => {
  history.replaceState(null, "", window.location.pathname);
  route();
});

/* ---------------- init ---------------- */
(async function init() {
  $("year").textContent = new Date().getFullYear();
  try {
    await openDB();
  } catch (err) {
    console.error("IndexedDB unavailable", err);
  }
  route();
  refreshList();
  document.title = "දායක සභාව | Video Share";

  window.addEventListener("popstate", route);
})();