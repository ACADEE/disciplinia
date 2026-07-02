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
        ${Object.entries(d.parMotif)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([motif, n]) => `
          <div class="bar-row"><span title="${esc(motif)}">${esc(motif.length > 34 ? motif.slice(0, 33) + "…" : motif)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(n / maxMotif) * 100}%"></div></div><b>${n}</b></div>`
          )
          .join("")}
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
async function vueDetail(id) {
  const [dossier, qualif] = await Promise.all([
    api(`/api/dossiers/${id}`),
    api(`/api/dossiers/${id}/qualification`),
  ]);
  const sanctionActuelle = dossier.sanctionRetenue || qualif.sanctionProposee;
  const convocationPossible = ["convocation"].includes(
    dossier.typeCourrier || qualif.typeCourrier
  );

  main.innerHTML = `
    <button class="lien-retour" id="retour">← Retour aux dossiers</button>
    <h1>${esc(dossier.reference)} — ${esc(dossier.salarieNom)}</h1>
    <p class="sous-titre">${esc(dossier.motifLabel)} · Fait du ${dateFr(dossier.dateFait)} · ${statutBadge(dossier.statut)}</p>

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

    <div class="panel">
      <h2>3. Courrier</h2>
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
            <button class="btn" id="btn-imprimer">🖨️ Imprimer / PDF</button>
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

  $("#btn-qualifier")?.addEventListener("click", async () => {
    try {
      await api(`/api/dossiers/${id}/qualifier`, { method: "POST", body: { sanctionRetenue: $("#sel-sanction").value } });
      toast("Qualification appliquée.");
      vueDetail(id);
    } catch (e) { toast(e.message, true); }
  });

  $("#sel-type")?.addEventListener("change", () => {
    $("#bloc-entretien").hidden = !["convocation", "notification_sanction"].includes($("#sel-type").value);
  });

  $("#btn-generer")?.addEventListener("click", async (ev) => {
    const btn = ev.target;
    btn.disabled = true;
    btn.textContent = "Génération en cours…";
    try {
      await api(`/api/dossiers/${id}/generer-courrier`, {
        method: "POST",
        body: {
          typeCourrier: $("#sel-type").value,
          entretien: $("#ent-date") ? { date: $("#ent-date").value, heure: $("#ent-heure").value, lieu: $("#ent-lieu").value } : null,
          miseAPiedConservatoire: $("#ent-map") ? $("#ent-map").checked : false,
          consignesRedaction: $("#consignes").value,
        },
      });
      toast("Courrier généré.");
      vueDetail(id);
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
  $("#btn-imprimer")?.addEventListener("click", () => window.print());
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
  const c = await api("/api/config");
  main.innerHTML = `
    <h1>Configuration</h1>
    <p class="sous-titre">Espace administrateur — règlement intérieur, grille de gravité, entreprise, API</p>

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

    <div class="btn-row"><button class="btn primary" id="btn-save-config">💾 Enregistrer la configuration</button></div>`;

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
}

(async () => {
  await chargerReferentiels();
  vueDashboard();
})();
