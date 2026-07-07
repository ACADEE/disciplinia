/* Disciplina — SPA vanilla JS. Toutes les vues sont rendues dans #main. */
"use strict";

const $ = (sel, el = document) => el.querySelector(sel);
const main = $("#main");
let REF = null; // référentiels (motifs, sanctions, statuts…)

// ---------- utilitaires ----------
// Code d'accès (déploiement public avec APP_PASSWORD) : demandé au premier 401,
// conservé pour la durée de l'onglet.
let CODE_ACCES = sessionStorage.getItem("disciplina-code") || "";

async function api(url, options = {}, redemander = true) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(CODE_ACCES ? { "x-app-password": CODE_ACCES } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && redemander) {
    const saisie = window.prompt("Code d'accès à l'application :");
    if (saisie === null) throw new Error("Accès refusé — code requis.");
    CODE_ACCES = saisie.trim();
    sessionStorage.setItem("disciplina-code", CODE_ACCES);
    return api(url, options, false);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erreur || `Erreur ${res.status}`);
  return data;
}

function toast(msg, erreur = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (erreur ? " erreur" : "");
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 4000);
}

// Popup de confirmation modale. `corpsHtml` doit être déjà échappé par l'appelant.
// Renvoie une promesse résolue à true (confirmé) ou false (annulé).
function confirmModal({ titre, corpsHtml = "", texteConfirmer = "Confirmer", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${esc(titre)}</h2>
        <div class="modal-body">${corpsHtml}</div>
        <div class="modal-actions">
          <button class="btn" data-a="annuler">Annuler</button>
          <button class="btn ${danger ? "danger" : "primary"}" data-a="ok">${esc(texteConfirmer)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const fermer = (val) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === "Escape") fermer(false); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fermer(false); });
    overlay.querySelector('[data-a="annuler"]').addEventListener("click", () => fermer(false));
    overlay.querySelector('[data-a="ok"]').addEventListener("click", () => fermer(true));
    document.addEventListener("keydown", onKey);
    overlay.querySelector('[data-a="ok"]').focus();
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function dateFr(iso) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
}
function statutBadge(id) {
  const s = REF.statuts.find((x) => x.id === id);
  return `<span class="badge ${id}">${esc(s ? s.label : id)}</span>`;
}
function niveauBadge(n) {
  if (!n) return "—";
  const libs = { 1: "Légère", 2: "Sérieuse", 3: "Grave", 4: "Très grave" };
  return `<span class="badge niveau-${n}">${n} — ${libs[n] || ""}</span>`;
}
function sanctionLabel(id) {
  const s = REF.sanctions.find((x) => x.id === id);
  return s ? s.label : id || "—";
}
function alertesHtml(alertes) {
  return (alertes || []).map((a) => `<div class="alerte ${a.niveau}">${esc(a.texte)}</div>`).join("");
}

// Palette pour le camembert des motifs.
const PALETTE = ["#1f4e79", "#2e8b57", "#c9820a", "#8e44ad", "#c0392b", "#16a085", "#2980b9", "#d35400", "#7f8c8d", "#b7950b"];

function pointPolaire(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function arcCamembert(cx, cy, r, debut, fin) {
  const [x1, y1] = pointPolaire(cx, cy, r, fin);
  const [x2, y2] = pointPolaire(cx, cy, r, debut);
  const grand = fin - debut <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${grand} 0 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

// Camembert SVG + légende à partir d'entrées [label, valeur]. Regroupe au-delà de maxParts.
function camembertHtml(entries, maxParts = 8) {
  const tries = entries.slice().sort((a, b) => b[1] - a[1]);
  let parts = tries;
  if (tries.length > maxParts) {
    const tete = tries.slice(0, maxParts - 1);
    const reste = tries.slice(maxParts - 1).reduce((s, [, n]) => s + n, 0);
    parts = [...tete, ["Autres motifs", reste]];
  }
  const total = parts.reduce((s, [, n]) => s + n, 0) || 1;
  let acc = 0;
  const slices = parts
    .map(([, n], i) => {
      const debut = (acc / total) * 360;
      acc += n;
      let fin = (acc / total) * 360;
      if (fin - debut >= 360) fin = 359.999; // un seul motif = cercle quasi plein
      return `<path d="${arcCamembert(90, 90, 88, debut, fin)}" fill="${PALETTE[i % PALETTE.length]}" stroke="#fff" stroke-width="1"></path>`;
    })
    .join("");
  const legende = parts
    .map(([label, n], i) => {
      const pct = Math.round((n / total) * 100);
      return `<div class="cam-leg"><span class="cam-dot" style="background:${PALETTE[i % PALETTE.length]}"></span><span class="cam-lbl" title="${esc(label)}">${esc(label)}</span><b>${n}</b><span class="cam-pct">${pct}%</span></div>`;
    })
    .join("");
  return `<div class="cam-wrap"><svg viewBox="0 0 180 180" class="cam-svg" role="img" aria-label="Répartition des motifs">${slices}</svg><div class="cam-legend">${legende}</div></div>`;
}

// ---------- navigation ----------
document.querySelectorAll(".nav-item").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    VUES[btn.dataset.vue]();
  })
);

// ---------- Tableau de bord ----------
async function vueDashboard() {
  const d = await api("/api/dashboard");
  const maxMotif = Math.max(1, ...Object.values(d.parMotif));
  const mois = Object.keys(d.parMois).sort();
  const maxMois = Math.max(1, ...Object.values(d.parMois));

  main.innerHTML = `
    <h1>Tableau de bord</h1>
    <p class="sous-titre">Synthèse direction — procédures disciplinaires</p>
    ${!d.reglementDepose ? `<div class="gap-note">⚠️ GAP : le règlement intérieur réel n'est pas encore déposé — les courriers ne peuvent pas citer ses articles. À faire dans <b>Configuration</b>.</div>` : ""}
    <div class="grid cols-4">
      <div class="panel kpi"><div class="val">${d.total}</div><div class="lib">Dossiers au total</div></div>
      <div class="panel kpi"><div class="val">${d.enCours}</div><div class="lib">Dossiers en cours</div></div>
      <div class="panel kpi"><div class="val">${(d.parStatut.envoye || 0) + (d.parStatut.archive || 0)}</div><div class="lib">Courriers envoyés / archivés</div></div>
      <div class="panel kpi"><div class="val" style="color:${d.alertes.length ? "var(--danger)" : "var(--ok)"}">${d.alertes.length}</div><div class="lib">Alertes de délai</div></div>
    </div>
    ${
      d.alertes.length
        ? `<div class="panel"><h2>⏰ Alertes de délais (prescription 2 mois)</h2>${d.alertes
            .map((a) => `<div class="alerte ${a.niveau}"><b>${esc(a.reference)}</b> — ${esc(a.salarieNom)} : ${esc(a.texte)}</div>`)
            .join("")}</div>`
        : ""
    }
    <div class="grid cols-2">
      <div class="panel">
        <h2>Répartition par motif</h2>
        ${Object.keys(d.parMotif).length ? camembertHtml(Object.entries(d.parMotif)) : `<p style="color:var(--muted)">Aucun dossier.</p>`}
      </div>
      <div class="panel">
        <h2>Dossiers par mois (date du fait)</h2>
        ${mois
          .map(
            (m) => `
          <div class="bar-row"><span>${m}</span>
          <div class="bar-track"><div class="bar-fill warn" style="width:${(d.parMois[m] / maxMois) * 100}%"></div></div><b>${d.parMois[m]}</b></div>`
          )
          .join("")}
        <h2 style="margin-top:20px">Salariés les plus concernés</h2>
        <table><tbody>
          ${d.topSalaries.map(([nom, n]) => `<tr><td>${esc(nom)}</td><td style="text-align:right"><b>${n}</b> dossier(s)</td></tr>`).join("")}
        </tbody></table>
      </div>
    </div>
    <div class="panel">
      <h2>Répartition par statut</h2>
      ${Object.entries(d.parStatut).map(([s, n]) => `${statutBadge(s)} <b style="margin-right:16px">${n}</b>`).join(" ")}
    </div>`;
}

// ---------- Liste des dossiers ----------
async function vueDossiers() {
  const dossiers = await api("/api/dossiers");
  main.innerHTML = `
    <h1>Dossiers disciplinaires</h1>
    <p class="sous-titre">${dossiers.length} dossier(s) — cliquer sur une ligne pour ouvrir</p>
    <div class="toolbar">
      <input id="filtre-texte" placeholder="Rechercher (salarié, référence, motif…)" />
      <select id="filtre-statut"><option value="">Tous les statuts</option>${REF.statuts.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select>
    </div>
    <div class="panel"><table>
      <thead><tr><th>Référence</th><th>Salarié</th><th>Motif</th><th>Date du fait</th><th>Gravité</th><th>Sanction</th><th>Statut</th></tr></thead>
      <tbody id="tbody-dossiers"></tbody>
    </table></div>`;

  function rendre() {
    const q = $("#filtre-texte").value.toLowerCase();
    const st = $("#filtre-statut").value;
    const filtres = dossiers.filter(
      (d) =>
        (!st || d.statut === st) &&
        (!q || `${d.reference} ${d.salarieNom} ${d.motifLabel}`.toLowerCase().includes(q))
    );
    $("#tbody-dossiers").innerHTML = filtres.length
      ? filtres
          .map(
            (d) => `
      <tr class="clickable" data-id="${d.id}">
        <td><b>${esc(d.reference)}</b></td><td>${esc(d.salarieNom)}</td><td>${esc(d.motifLabel)}</td>
        <td>${dateFr(d.dateFait)}</td><td>${niveauBadge(d.niveauGravite)}</td>
        <td>${esc(d.sanctionRetenue ? sanctionLabel(d.sanctionRetenue) : "—")}</td><td>${statutBadge(d.statut)}</td>
      </tr>`
          )
          .join("")
      : `<tr><td colspan="7" style="color:var(--muted)">Aucun dossier ne correspond.</td></tr>`;
    document.querySelectorAll("#tbody-dossiers tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", () => vueDetail(tr.dataset.id))
    );
  }
  $("#filtre-texte").addEventListener("input", rendre);
  $("#filtre-statut").addEventListener("change", rendre);
  rendre();
}

// ---------- Détail d'un dossier (qualification → courrier → validation) ----------
async function vueDetail(id, opts = {}) {
  let dossier, qualif;
  try {
    [dossier, qualif] = await Promise.all([
      api(`/api/dossiers/${id}`),
      api(`/api/dossiers/${id}/qualification`),
    ]);
  } catch (e) {
    // Ne pas laisser une erreur non catchée (ex. « Dossier introuvable ») casser l'app.
    main.innerHTML = `
      <button class="lien-retour" id="retour">← Retour aux dossiers</button>
      <h1>Dossier indisponible</h1>
      <div class="alerte danger">${esc(e.message)}</div>
      <div class="panel"><p>Impossible de charger ce dossier. Il a peut-être été supprimé, ou le serveur n'a pas répondu (ex. délai dépassé lors d'une génération). Revenez à la liste et réessayez.</p></div>`;
    $("#retour").addEventListener("click", vueDossiers);
    return;
  }
  const sanctionActuelle = dossier.sanctionRetenue || qualif.sanctionProposee;
  const convocationPossible = ["convocation"].includes(
    dossier.typeCourrier || qualif.typeCourrier
  );

  main.innerHTML = `
    <button class="lien-retour" id="retour">← Retour aux dossiers</button>
    <h1>${esc(dossier.reference)} — ${esc(dossier.salarieNom)}</h1>
    <p class="sous-titre">${esc(dossier.motifLabel)} · Fait du ${dateFr(dossier.dateFait)} · ${statutBadge(dossier.statut)} · <button class="lien-inline" id="btn-histo-salarie">👤 Historique disciplinaire du salarié</button></p>

    <div class="grid cols-2">
      <div class="panel">
        <h2>1. Fait rapporté</h2>
        <p style="font-size:14px"><b>Description :</b> ${esc(dossier.description)}</p>
        <p style="font-size:13.5px"><b>Lieu :</b> ${esc(dossier.lieu || "—")} · <b>Connaissance du fait :</b> ${dateFr(dossier.dateConnaissance)}</p>
        ${dossier.temoins ? `<p style="font-size:13.5px"><b>Témoins / preuves :</b> ${esc(dossier.temoins)}</p>` : ""}
        <h2 style="margin-top:18px">Historique</h2>
        <ul class="timeline">
          ${(dossier.historique || []).map((h) => `<li><span class="quand">${new Date(h.date).toLocaleString("fr-FR")}</span>${esc(h.action)}</li>`).join("")}
        </ul>
      </div>

      <div class="panel">
        <h2>2. Qualification</h2>
        ${alertesHtml(qualif.alertes)}
        <p style="font-size:13.5px">Proposition de l'outil (grille de gravité${qualif.recidive ? ", <b>récidive détectée</b>" : ""}) :
        ${niveauBadge(qualif.niveauGravite)} → <b>${esc(sanctionLabel(qualif.sanctionProposee))}</b></p>
        <label>Sanction retenue (modifiable — la décision reste humaine)</label>
        <select id="sel-sanction">${REF.sanctions.map((s) => `<option value="${s.id}" ${s.id === sanctionActuelle ? "selected" : ""}>${s.label}</option>`).join("")}</select>
        <div class="btn-row"><button class="btn primary" id="btn-qualifier">Appliquer la qualification</button></div>
      </div>
    </div>

    <div class="panel" id="section-courrier">
      <h2>3. Courrier</h2>
      ${
        dossier.generation && dossier.generation.statut === "en_cours"
          ? `<div class="alerte info" id="gen-encours">⏳ Rédaction du courrier par l'IA en cours… (jusqu'à ~1 min). Le résultat s'affichera automatiquement.</div>`
          : ""
      }
      ${
        dossier.sanctionRetenue
          ? `
        <div class="grid cols-2 no-print">
          <div>
            <label>Type de courrier</label>
            <select id="sel-type">${REF.typesCourrier.map((t) => `<option value="${t.id}" ${t.id === (dossier.typeCourrier || qualif.typeCourrier) ? "selected" : ""}>${t.label}</option>`).join("")}</select>
            <div id="bloc-entretien" ${convocationPossible ? "" : "hidden"}>
              <label>Entretien préalable — date</label><input type="date" id="ent-date" value="${esc((dossier.entretien || {}).date || "")}" />
              <label>Heure</label><input type="time" id="ent-heure" value="${esc((dossier.entretien || {}).heure || "")}" />
              <label>Lieu</label><input id="ent-lieu" value="${esc((dossier.entretien || {}).lieu || "")}" placeholder="Par défaut : siège de l'entreprise" />
              <label style="font-weight:400"><input type="checkbox" id="ent-map" style="width:auto" ${dossier.miseAPiedConservatoire ? "checked" : ""}/> Mise à pied conservatoire (faute grave présumée)</label>
            </div>
          </div>
          <div>
            <label>Consignes particulières pour la rédaction (optionnel)</label>
            <textarea id="consignes" rows="4" placeholder="Ex. : insister sur les obligations de sécurité, mentionner le rapport du chef d'exploitation…">${esc(dossier.consignesRedaction || "")}</textarea>
            <div class="btn-row">
              <button class="btn primary" id="btn-generer">${dossier.courrier ? "Régénérer le courrier" : "Générer le courrier"} ${REF.apiKeyPresente ? `(${REF.modele})` : "(mode simulation)"}</button>
            </div>
            ${!REF.apiKeyPresente ? `<div class="gap-note">⚠️ GAP : aucune clé API Anthropic configurée — la génération sera simulée. Renseignez la clé dans Configuration.</div>` : ""}
          </div>
        </div>`
          : `<p style="color:var(--muted)">Appliquez d'abord la qualification (étape 2).</p>`
      }
      ${
        dossier.courrier
          ? `
        <div id="zone-courrier">
          <div class="courrier" id="courrier-lecture">${esc(dossier.courrier)}</div>
          <textarea class="courrier-edit" id="courrier-edit" hidden>${esc(dossier.courrier)}</textarea>
          <div class="btn-row no-print">
            <button class="btn" id="btn-editer">✏️ Modifier</button>
            <button class="btn" id="btn-word">📄 Télécharger WORD</button>
            <button class="btn" id="btn-copier">📋 Copier</button>
          </div>
        </div>`
          : ""
      }
    </div>

    <div class="panel no-print">
      <h2>4. Validation & archivage</h2>
      <div class="btn-row">
        ${dossier.statut === "courrier_genere" ? `<button class="btn primary" data-statut="en_validation">Soumettre à validation</button>` : ""}
        ${dossier.statut === "en_validation" ? `<button class="btn success" data-statut="valide">✓ Valider le courrier</button><button class="btn" data-statut="courrier_genere">Renvoyer en rédaction</button>` : ""}
        ${dossier.statut === "valide" ? `<button class="btn primary" data-statut="envoye">📮 Marquer comme envoyé (LRAR)</button>` : ""}
        ${dossier.statut === "envoye" ? `<button class="btn" data-statut="archive">🗄️ Archiver le dossier</button>` : ""}
        ${!["archive", "sans_suite"].includes(dossier.statut) ? `<button class="btn danger-outline" data-statut="sans_suite">Classer sans suite</button>` : ""}
      </div>
      <p class="hint">Circuit : courrier généré → validation (direction) → validé → envoyé → archivé. GAP : l'envoi réel (LRAR/e-mail) n'est pas connecté — le statut est déclaratif.</p>
    </div>`;

  $("#retour").addEventListener("click", vueDossiers);
  $("#btn-histo-salarie")?.addEventListener("click", () => vueHistoriqueSalarie(dossier.salarieId));

  $("#btn-qualifier")?.addEventListener("click", async () => {
    try {
      await api(`/api/dossiers/${id}/qualifier`, { method: "POST", body: { sanctionRetenue: $("#sel-sanction").value } });
      toast("Qualification appliquée — étape 3 débloquée.");
      await vueDetail(id, { focusCourrier: true });
    } catch (e) { toast(e.message, true); }
  });

  $("#sel-type")?.addEventListener("change", () => {
    $("#bloc-entretien").hidden = !["convocation", "notification_sanction"].includes($("#sel-type").value);
  });

  $("#btn-generer")?.addEventListener("click", async (ev) => {
    const btn = ev.target;
    btn.disabled = true;
    btn.textContent = "Génération lancée…";
    try {
      // 202 immédiat : la génération se fait en tâche de fond (pas de timeout serverless).
      await api(`/api/dossiers/${id}/generer-courrier`, {
        method: "POST",
        body: {
          typeCourrier: $("#sel-type").value,
          entretien: $("#ent-date") ? { date: $("#ent-date").value, heure: $("#ent-heure").value, lieu: $("#ent-lieu").value } : null,
          miseAPiedConservatoire: $("#ent-map") ? $("#ent-map").checked : false,
          consignesRedaction: $("#consignes").value,
        },
      });
      await suivreEtAfficherGeneration(id, btn);
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
      btn.textContent = "Générer le courrier";
    }
  });

  $("#btn-editer")?.addEventListener("click", async (ev) => {
    const lecture = $("#courrier-lecture");
    const edit = $("#courrier-edit");
    if (edit.hidden) {
      edit.hidden = false; lecture.hidden = true; ev.target.textContent = "💾 Enregistrer";
    } else {
      try {
        await api(`/api/dossiers/${id}/courrier`, { method: "PATCH", body: { courrier: edit.value } });
        toast("Courrier enregistré.");
        vueDetail(id);
      } catch (e) { toast(e.message, true); }
    }
  });
  $("#btn-word")?.addEventListener("click", async (ev) => {
    const btn = ev.target;
    btn.disabled = true;
    try {
      const { filename, base64 } = await api(`/api/dossiers/${id}/courrier-docx`);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Document Word téléchargé.");
    } catch (e) { toast(e.message, true); }
    btn.disabled = false;
  });
  $("#btn-copier")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(dossier.courrier || "");
    toast("Courrier copié dans le presse-papiers.");
  });

  document.querySelectorAll("[data-statut]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/dossiers/${id}/statut`, { method: "POST", body: { statut: btn.dataset.statut } });
        toast("Statut mis à jour.");
        vueDetail(id);
      } catch (e) { toast(e.message, true); }
    })
  );

  // Déblocage visible de l'étape 3 après application de la qualification.
  if (opts.focusCourrier) {
    const sec = $("#section-courrier");
    if (sec) {
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
      sec.classList.add("surbrillance");
      setTimeout(() => sec.classList.remove("surbrillance"), 1600);
    }
  }

  // Reprise du suivi si le dossier est rouvert alors qu'une génération est en cours
  // (ex. rechargement de page pendant la rédaction par l'IA).
  if (dossier.generation && dossier.generation.statut === "en_cours") {
    const btn = $("#btn-generer");
    if (btn) { btn.disabled = true; btn.textContent = "Rédaction par l'IA en cours…"; }
    suivreEtAfficherGeneration(id, btn);
  }
}

// Interroge le dossier jusqu'à ce que la génération soit terminée / en erreur.
async function suivreGeneration(id, { maxMs = 180000, intervalMs = 2500 } = {}) {
  const debut = Date.now();
  while (Date.now() - debut < maxMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let d;
    try { d = await api(`/api/dossiers/${id}`); } catch { continue; }
    const g = d.generation;
    if (g && g.statut === "termine") return "termine";
    if (g && g.statut === "erreur") return { statut: "erreur", message: g.message };
    if (!g && d.courrier) return "termine"; // compat anciens dossiers
  }
  return "timeout";
}

// Suit la génération et met à jour l'UI ; `btn` (optionnel) est le bouton à réactiver en cas d'échec.
async function suivreEtAfficherGeneration(id, btn) {
  if (btn) btn.textContent = "Rédaction par l'IA en cours… (jusqu'à ~1 min)";
  const r = await suivreGeneration(id);
  if (r === "termine") {
    toast("Courrier généré.");
    await vueDetail(id, { focusCourrier: true });
  } else if (r && r.statut === "erreur") {
    toast(`Échec de la génération : ${r.message || "erreur"}`, true);
    await vueDetail(id);
  } else {
    toast("La génération prend plus de temps que prévu. Réactualisez le dossier dans un instant.", true);
    if (btn) { btn.disabled = false; btn.textContent = "Générer le courrier"; }
  }
}

// ---------- Historique disciplinaire d'un salarié ----------
async function vueHistoriqueSalarie(id) {
  let h;
  try {
    h = await api(`/api/salaries/${id}/historique`);
  } catch (e) { toast(e.message, true); return; }
  const s = h.salarie;
  main.innerHTML = `
    <button class="lien-retour" id="retour">← Retour aux dossiers</button>
    <h1>${esc(s.prenom)} ${esc(s.nom)}</h1>
    <p class="sous-titre">${esc(s.poste || "")}${s.dateEmbauche ? " · Embauché le " + dateFr(s.dateEmbauche) : ""}</p>
    <div class="grid cols-4">
      <div class="panel kpi"><div class="val">${h.stats.total}</div><div class="lib">Dossiers au total</div></div>
      <div class="panel kpi"><div class="val" style="color:${h.stats.sanctionsInvocables ? "var(--danger)" : "var(--ok)"}">${h.stats.sanctionsInvocables}</div><div class="lib">Sanctions invocables (&lt; 3 ans)</div></div>
    </div>
    <div class="panel">
      <h2>Historique disciplinaire</h2>
      ${
        h.dossiers.length
          ? `<table>
        <thead><tr><th>Référence</th><th>Date du fait</th><th>Motif</th><th>Sanction</th><th>Statut</th></tr></thead>
        <tbody>${h.dossiers
          .map(
            (d) => `<tr class="clickable" data-id="${d.id}"><td><b>${esc(d.reference)}</b></td><td>${dateFr(d.dateFait)}</td><td>${esc(d.motifLabel)}</td><td>${esc(d.sanctionRetenue ? sanctionLabel(d.sanctionRetenue) : "—")}</td><td>${statutBadge(d.statut)}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
          : `<p style="color:var(--muted)">Aucun dossier pour ce salarié.</p>`
      }
    </div>`;
  $("#retour").addEventListener("click", vueDossiers);
  document.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => vueDetail(tr.dataset.id)));
}

// ---------- Nouveau dossier ----------
async function vueNouveau() {
  const salaries = await api("/api/salaries");
  main.innerHTML = `
    <h1>Nouveau dossier disciplinaire</h1>
    <p class="sous-titre">Saisie du fait rapporté — la qualification est proposée à l'étape suivante</p>
    <div class="panel" style="max-width:760px">
      <label>Salarié concerné *</label>
      <select id="f-salarie">
        ${salaries.map((s) => `<option value="${s.id}">${esc(s.prenom)} ${esc(s.nom)} — ${esc(s.poste)}</option>`).join("")}
        <option value="__nouveau__">➕ Autre salarié (ajouter)…</option>
      </select>
      <div id="bloc-nouveau-salarie" hidden>
        <div class="grid cols-2">
          <div><label>Prénom *</label><input id="ns-prenom" /></div>
          <div><label>Nom *</label><input id="ns-nom" /></div>
        </div>
        <label>Poste</label><input id="ns-poste" placeholder="Ex. : Conducteur ligne régulière" />
      </div>
      <label>Motif disciplinaire *</label>
      <select id="f-motif">${REF.motifs.map((m) => `<option value="${m.id}">${m.label}</option>`).join("")}</select>
      <div class="grid cols-2">
        <div><label>Date du fait *</label><input type="date" id="f-date" /></div>
        <div><label>Date de connaissance par l'employeur</label><input type="date" id="f-connaissance" /><div class="hint">Point de départ du délai de 2 mois. Par défaut : date du fait.</div></div>
      </div>
      <label>Lieu</label><input id="f-lieu" placeholder="Ex. : Dépôt d'Annecy, ligne 3, RD 1508…" />
      <label>Description circonstanciée du fait *</label>
      <textarea id="f-description" rows="5" placeholder="Décrire précisément : quoi, quand, où, comment le fait a été constaté. Cette description alimente directement le courrier."></textarea>
      <label>Témoins / éléments de preuve</label>
      <input id="f-temoins" placeholder="Ex. : rapport du chef d'exploitation, données chronotachygraphe, 2 témoins…" />
      <div class="btn-row"><button class="btn primary" id="btn-creer">Créer le dossier et qualifier →</button></div>
    </div>`;

  $("#f-salarie").addEventListener("change", () => {
    $("#bloc-nouveau-salarie").hidden = $("#f-salarie").value !== "__nouveau__";
  });

  $("#btn-creer").addEventListener("click", async () => {
    try {
      let salarieId = $("#f-salarie").value;
      if (salarieId === "__nouveau__") {
        const s = await api("/api/salaries", {
          method: "POST",
          body: { prenom: $("#ns-prenom").value.trim(), nom: $("#ns-nom").value.trim(), poste: $("#ns-poste").value.trim() },
        });
        salarieId = s.id;
      }
      const dossier = await api("/api/dossiers", {
        method: "POST",
        body: {
          salarieId,
          motifId: $("#f-motif").value,
          dateFait: $("#f-date").value,
          dateConnaissance: $("#f-connaissance").value || undefined,
          lieu: $("#f-lieu").value.trim(),
          description: $("#f-description").value.trim(),
          temoins: $("#f-temoins").value.trim(),
        },
      });
      toast(`Dossier ${dossier.reference} créé.`);
      vueDetail(dossier.id);
    } catch (e) { toast(e.message, true); }
  });
}

// ---------- Configuration ----------
async function vueConfig() {
  const [c, salaries, dossiers] = await Promise.all([
    api("/api/config"),
    api("/api/salaries"),
    api("/api/dossiers"),
  ]);
  const nbDossiersDe = (sid) => dossiers.filter((d) => d.salarieId === sid).length;
  main.innerHTML = `
    <h1>Configuration</h1>
    <p class="sous-titre">Espace administrateur — règlement intérieur, grille de gravité, entreprise, salariés, API</p>

    <div class="panel">
      <h2>Entreprise</h2>
      <div class="gap-note">⚠️ GAP : les coordonnées ci-dessous sont FICTIVES — à remplacer par celles de l'entreprise réelle.</div>
      <div class="grid cols-2">
        <div><label>Raison sociale</label><input id="c-nom" value="${esc(c.entreprise.nom)}" /></div>
        <div><label>Ville (pour la datation des courriers)</label><input id="c-ville" value="${esc(c.entreprise.ville || "")}" /></div>
      </div>
      <label>Adresse</label><input id="c-adresse" value="${esc(c.entreprise.adresse)}" />
      <div class="grid cols-2">
        <div><label>Signataire des courriers</label><input id="c-signataire" value="${esc(c.entreprise.signataire)}" /></div>
        <div><label>Fonction du signataire</label><input id="c-fonction" value="${esc(c.entreprise.fonctionSignataire)}" /></div>
      </div>
      <label>Convention collective</label><input id="c-ccn" value="${esc(c.entreprise.conventionCollective)}" />
    </div>

    <div class="panel">
      <h2>Règlement intérieur</h2>
      ${
        c.reglementInterieur && c.reglementInterieur.trim()
          ? `<p style="font-size:13px;color:var(--ok)">✓ Règlement déposé (${c.reglementInterieur.length.toLocaleString("fr-FR")} caractères) — il sera cité dans les courriers.</p>`
          : `<div class="gap-note">⚠️ GAP : aucun règlement intérieur déposé. Sans lui, les courriers s'appuient uniquement sur le Code du travail. Déposez le texte réel ci-dessous (collage ou fichier .txt/.md). Les PDF/Word ne sont pas encore pris en charge : copiez-collez leur contenu (import PDF/DOCX prévu en phase 2).</div>`
      }
      <label>Texte du règlement intérieur</label>
      <textarea id="c-reglement" rows="10" placeholder="Coller ici le texte intégral du règlement intérieur…">${esc(c.reglementInterieur || "")}</textarea>
      <label>… ou charger un fichier texte (.txt / .md)</label>
      <input type="file" id="c-fichier" accept=".txt,.md" />
      <label>Durée maximale de mise à pied disciplinaire prévue au règlement intérieur (jours)</label>
      <input type="number" id="c-map" min="1" max="30" value="${c.miseAPiedDureeMaxJours || ""}" placeholder="Ex. : 5" style="max-width:140px" />
      <div class="hint">Obligatoire pour qu'une mise à pied disciplinaire soit valable (jurisprudence constante).</div>
    </div>

    <div class="panel">
      <h2>Bases de référence de la sanction</h2>
      <div class="hint" style="margin-bottom:10px">Dans cette entreprise, la sanction s'appuie surtout sur le <b>code du travail</b>, le <b>code de la route</b> (infractions de conduite), les <b>process internes</b> et les <b>règles de courtoisie</b> — le règlement intérieur n'est que secondaire. Le code du travail et le code de la route sont connus de l'IA ; renseignez ci-dessous vos sources internes pour qu'elle s'y réfère.</div>
      <label>Process internes de l'entreprise</label>
      <textarea id="c-process" rows="6" placeholder="Coller ici les process/consignes internes servant de base aux sanctions (prise de service, contrôles sécurité, gestion des recettes, etc.)…">${esc(c.processInternes || "")}</textarea>
      <label>Règles de courtoisie / savoir-être attendu</label>
      <textarea id="c-courtoisie" rows="5" placeholder="Coller ici la charte de courtoisie / savoir-être (tenue, relation aux usagers, respect des collègues, etc.)…">${esc(c.reglesCourtoisie || "")}</textarea>
    </div>

    <div class="panel">
      <h2>Grille de gravité</h2>
      <div class="gap-note">⚠️ GAP : grille par défaut proposée par l'outil — à valider/ajuster selon la politique disciplinaire réelle de l'entreprise.</div>
      <table class="grille-table">
        <thead><tr><th>Motif</th><th>Niveau (1-4)</th><th>Sanction 1ʳᵉ occurrence</th><th>Sanction en récidive (&lt; 3 ans)</th></tr></thead>
        <tbody>
          ${c.grille
            .map(
              (g, i) => `
            <tr data-i="${i}">
              <td style="font-size:12.5px">${esc(g.motifLabel)}</td>
              <td><select class="g-niveau">${[1, 2, 3, 4].map((n) => `<option ${n === g.niveau ? "selected" : ""}>${n}</option>`).join("")}</select></td>
              <td><select class="g-s1">${REF.sanctions.map((s) => `<option value="${s.id}" ${s.id === g.sanction1 ? "selected" : ""}>${s.label}</option>`).join("")}</select></td>
              <td><select class="g-s2">${REF.sanctions.map((s) => `<option value="${s.id}" ${s.id === g.sanctionRecidive ? "selected" : ""}>${s.label}</option>`).join("")}</select></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Salariés</h2>
      <div class="gap-note">⚠️ Supprimer un salarié supprime aussi <b>définitivement</b> tous ses dossiers disciplinaires. Action irréversible, confirmation demandée.</div>
      ${
        salaries.length
          ? `<table>
        <thead><tr><th>Salarié</th><th>Poste</th><th>Dossiers rattachés</th><th></th></tr></thead>
        <tbody>
          ${salaries
            .map(
              (s) => `<tr>
            <td><b>${esc(s.prenom)} ${esc(s.nom)}</b></td>
            <td>${esc(s.poste || "—")}</td>
            <td><button class="lien-inline btn-voir-dossiers" data-id="${s.id}">${nbDossiersDe(s.id)} dossier(s)</button></td>
            <td style="text-align:right"><button class="btn danger-outline btn-suppr-salarie" data-id="${s.id}">🗑 Supprimer</button></td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>`
          : `<p style="color:var(--muted)">Aucun salarié.</p>`
      }
    </div>

    <div class="panel">
      <h2>API Anthropic (génération des courriers)</h2>
      <div class="grid cols-2">
        <div>
          <label>Clé API</label>
          <input type="password" id="c-apikey" value="${esc(c.apiKey)}" placeholder="sk-ant-…" />
          <div class="hint">Alternative recommandée : variable d'environnement ANTHROPIC_API_KEY. La clé saisie ici est stockée en local (data/config.json) — ne convient pas à un serveur partagé.</div>
        </div>
        <div>
          <label>Modèle</label>
          <input id="c-modele" value="${esc(c.modele || "claude-sonnet-5")}" />
          <div class="hint">Demandé pour ce projet : claude-sonnet-5.</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <h2>Sauvegarde des données</h2>
      <div class="gap-note">⚠️ Le stockage en ligne (Netlify Blobs) n'a pas de sauvegarde automatique. Téléchargez régulièrement une sauvegarde (ex. chaque semaine) et conservez le fichier en lieu sûr.</div>
      <p style="font-size:13.5px">Le fichier contient tous les dossiers, salariés et la configuration (la clé API n'y figure jamais).</p>
      <div class="btn-row"><button class="btn" id="btn-export">💾 Télécharger une sauvegarde</button></div>
    </div>

    <div class="btn-row"><button class="btn primary" id="btn-save-config">💾 Enregistrer la configuration</button></div>`;

  // Voir les dossiers rattachés à un salarié → ouvre son historique.
  document.querySelectorAll(".btn-voir-dossiers").forEach((btn) =>
    btn.addEventListener("click", () => vueHistoriqueSalarie(btn.dataset.id))
  );

  // Suppression d'un salarié (et de ses dossiers) avec confirmation.
  document.querySelectorAll(".btn-suppr-salarie").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const s = salaries.find((x) => x.id === btn.dataset.id);
      const rattaches = dossiers.filter((d) => d.salarieId === s.id);
      const liste = rattaches.length
        ? `<ul class="modal-list">${rattaches
            .map((d) => `<li><b>${esc(d.reference)}</b> — ${esc(d.motifLabel)} <span style="color:var(--muted)">(${dateFr(d.dateFait)})</span> ${statutBadge(d.statut)}</li>`)
            .join("")}</ul>`
        : `<p style="color:var(--muted)">Aucun dossier rattaché.</p>`;
      const corps = `
        <p>Vous allez supprimer <b>${esc(s.prenom)} ${esc(s.nom)}</b> et <b>${rattaches.length} dossier(s)</b> rattaché(s). Cette action est <b>irréversible</b>.</p>
        ${liste}`;
      const ok = await confirmModal({
        titre: "Supprimer ce salarié et ses dossiers ?",
        corpsHtml: corps,
        texteConfirmer: `Supprimer définitivement (${rattaches.length} dossier(s))`,
        danger: true,
      });
      if (!ok) return;
      try {
        const res = await api(`/api/salaries/${s.id}`, { method: "DELETE" });
        toast(`« ${s.prenom} ${s.nom} » supprimé (${res.dossiersSupprimes} dossier(s)).`);
        vueConfig();
      } catch (e) { toast(e.message, true); }
    })
  );

  $("#btn-export").addEventListener("click", async () => {
    try {
      const data = await api("/api/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `disciplina-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`Sauvegarde téléchargée (${data.dossiers.length} dossier(s)).`);
    } catch (e) { toast(e.message, true); }
  });

  $("#c-fichier").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      $("#c-reglement").value = reader.result;
      toast(`Fichier « ${f.name} » chargé — pensez à enregistrer.`);
    };
    reader.readAsText(f, "utf-8");
  });

  $("#btn-save-config").addEventListener("click", async () => {
    const grille = [...document.querySelectorAll(".grille-table tbody tr")].map((tr, i) => ({
      ...c.grille[i],
      niveau: Number(tr.querySelector(".g-niveau").value),
      sanction1: tr.querySelector(".g-s1").value,
      sanctionRecidive: tr.querySelector(".g-s2").value,
    }));
    try {
      await api("/api/config", {
        method: "PUT",
        body: {
          entreprise: {
            nom: $("#c-nom").value,
            ville: $("#c-ville").value,
            adresse: $("#c-adresse").value,
            signataire: $("#c-signataire").value,
            fonctionSignataire: $("#c-fonction").value,
            conventionCollective: $("#c-ccn").value,
          },
          reglementInterieur: $("#c-reglement").value,
          processInternes: $("#c-process").value,
          reglesCourtoisie: $("#c-courtoisie").value,
          miseAPiedDureeMaxJours: Number($("#c-map").value) || null,
          grille,
          apiKey: $("#c-apikey").value,
          modele: $("#c-modele").value || "claude-sonnet-5",
        },
      });
      toast("Configuration enregistrée.");
      await chargerReferentiels();
    } catch (e) { toast(e.message, true); }
  });
}

const VUES = { dashboard: vueDashboard, dossiers: vueDossiers, nouveau: vueNouveau, config: vueConfig };

// ---------- démarrage ----------
async function chargerReferentiels() {
  REF = await api("/api/referentiels");
  const cfg = await api("/api/config");
  $("#brand-entreprise").textContent = cfg.entreprise.nom;
  const st = $("#api-status");
  st.className = "api-status " + (REF.apiKeyPresente ? "ok" : "ko");
  st.textContent = REF.apiKeyPresente ? `✓ API connectée (${REF.modele})` : "⚠ Clé API absente — mode simulation";
  majFooter();
}

// Footer : statut de la connexion à l'API Anthropic + modèle.
function majFooter() {
  const f = $("#footer-api");
  if (!f || !REF) return;
  f.className = "footer-api " + (REF.apiKeyPresente ? "ok" : "ko");
  f.innerHTML = REF.apiKeyPresente
    ? `<span class="dot"></span> API Anthropic connectée — modèle ${esc(REF.modele)}`
    : `<span class="dot"></span> Mode simulation — clé API Anthropic absente (modèle cible : ${esc(REF.modele)})`;
}

(async () => {
  try {
    await chargerReferentiels();
    vueDashboard();
  } catch (e) {
    // Ne jamais laisser la zone centrale vide : afficher l'erreur plutôt qu'un écran blanc.
    main.innerHTML = `
      <h1>Impossible de charger l'application</h1>
      <div class="alerte danger">${esc(e.message)}</div>
      <div class="panel">
        <p>Le serveur (API) n'a pas répondu correctement. Vérifiez :</p>
        <ul>
          <li>que le code d'accès saisi est correct (le cas échéant) ;</li>
          <li>en ligne : que les variables <b>APP_PASSWORD</b> et <b>ANTHROPIC_API_KEY</b> sont définies dans Netlify, puis redéployez ;</li>
          <li>la console du navigateur et les logs de la fonction Netlify pour le détail.</li>
        </ul>
        <div class="btn-row">
          <button class="btn primary" onclick="sessionStorage.removeItem('disciplina-code');location.reload()">Ressaisir le code d'accès</button>
          <button class="btn" onclick="location.reload()">Réessayer</button>
        </div>
      </div>`;
  }
})();
