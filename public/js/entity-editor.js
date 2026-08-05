// entity-editor.js
// Show entities one-by-one and let user pick an image from a local file upload

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("fetch failed " + path);
  return res.json();
}

const entityNameEl = document.getElementById("entity-name");
const currentImgEl = document.getElementById("current-img");
const localFileEl = document.getElementById("local-file");
const previewImgEl = document.getElementById("preview-img");
const assignBtn = document.getElementById("assign-btn");
const assignStatus = document.getElementById("assign-status");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");

let db = {};
let mapping = {};
let names = [];
let idx = 0;
let selectedFile = null;

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function renderEntity() {
  const name = names[idx];
  entityNameEl.textContent = name + `  (${idx + 1}/${names.length})`;
  const m = mapping[name];
  if (m) {
    currentImgEl.src = m;
  } else {
    currentImgEl.src = "assets/entities/placeholder.svg";
  }
  assignStatus.textContent = "";
  selectedFile = null;
  localFileEl.value = "";
  previewImgEl.style.display = "none";
  previewImgEl.src = "";
  adjustImageDisplay(currentImgEl);
}

async function init() {
  db = await loadJson("/db.json");
  mapping = await loadJson("/assets/entities/mapping.json").catch(() => ({}));
  names = Object.keys(db).sort((a, b) => a.localeCompare(b, "fr"));
  renderEntity();
}
prevBtn.addEventListener("click", () => {
  idx = (idx - 1 + names.length) % names.length;
  renderEntity();
});
nextBtn.addEventListener("click", () => {
  idx = (idx + 1) % names.length;
  renderEntity();
});

localFileEl.addEventListener("change", () => {
  const file = localFileEl.files[0];
  if (!file) {
    selectedFile = null;
    previewImgEl.style.display = "none";
    previewImgEl.src = "";
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    // set onload handler before assigning src so we can inspect natural size
    previewImgEl.onload = () => adjustImageDisplay(previewImgEl);
    previewImgEl.src = reader.result;
    previewImgEl.style.display = "block";
    // in case image is already decoded, call adjust immediately
    if (previewImgEl.complete && previewImgEl.naturalWidth)
      adjustImageDisplay(previewImgEl);
  };
  reader.readAsDataURL(file);
});

// Adjust image display for small pixel-art sprites vs screenshots
function adjustImageDisplay(imgEl) {
  const handle = () => {
    try {
      const w = imgEl.naturalWidth || 0;
      const h = imgEl.naturalHeight || 0;
      // consider small sprites (<=32px) as pixel-art and upscale with crisp rendering
      if (w > 0 && h > 0 && w <= 32 && h <= 32) {
        imgEl.classList.add("pixelated");
        imgEl.style.width = "480px";
        imgEl.style.height = "480px";
      } else {
        imgEl.classList.remove("pixelated");
        // restore to default review size
        imgEl.style.width = "240px";
        imgEl.style.height = "240px";
      }
    } catch (e) {
      // ignore
    }
  };
  if (imgEl.complete) return handle();
  imgEl.addEventListener("load", handle, { once: true });
}

assignBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    assignStatus.textContent =
      "Choisis d'abord une image depuis ton ordinateur.";
    return;
  }
  const name = names[idx];
  assignStatus.textContent = "Envoi...";
  try {
    const fileData = await fileToBase64(selectedFile);
    const res = await fetch("/admin/upload-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityName: name,
        fileName: selectedFile.name,
        fileData,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      assignStatus.textContent = "Erreur: " + (json.error || res.status);
      return;
    }
    mapping[name] = json.mappingEntry || json.dest;
    currentImgEl.src = mapping[name];
    assignStatus.textContent = "Image assignée.";
  } catch (err) {
    assignStatus.textContent = "Erreur réseau";
    console.error(err);
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

init().catch((err) => {
  console.error(err);
  alert("Init fail: " + err.message);
});
