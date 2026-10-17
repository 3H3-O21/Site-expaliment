import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';

/* ==========================================================
   Outils : menu « Outils », convertisseur minutes -> heures, to-do liste
   Ce fichier est chargé après script.js. Il réutilise la même connexion
   Firebase (même application, même utilisateur).
   ========================================================== */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (selecteur) => document.querySelector(selecteur);

function genererId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ----------------------------------------------------------
   Menu « Outils » (en haut de la page de suivi des heures)
   Les éléments avec data-goto="todo" sont gérés par script.js.
   ---------------------------------------------------------- */
const boutonOutils = $('#btn-outils');
const menuOutils = $('#menu-outils');

function ouvrirMenuOutils() {
  menuOutils.hidden = false;
  boutonOutils.setAttribute('aria-expanded', 'true');

  const bouton = boutonOutils.getBoundingClientRect();
  const menu = menuOutils.getBoundingClientRect();
  menuOutils.style.left = `${Math.max(8, Math.min(bouton.left, window.innerWidth - menu.width - 8))}px`;
  menuOutils.style.top = `${bouton.bottom + 8}px`;

  const premier = menuOutils.querySelector('button');
  if (premier) premier.focus();
}

function fermerMenuOutils(rendreLeFocus = false) {
  if (menuOutils.hidden) return;
  menuOutils.hidden = true;
  boutonOutils.setAttribute('aria-expanded', 'false');
  if (rendreLeFocus) boutonOutils.focus();
}

boutonOutils.addEventListener('click', () => {
  if (menuOutils.hidden) ouvrirMenuOutils();
  else fermerMenuOutils();
});

// Un clic sur une option referme le menu (l'action elle-même est ailleurs)
menuOutils.addEventListener('click', (e) => {
  if (e.target.closest('button')) fermerMenuOutils();
});

document.addEventListener('click', (e) => {
  if (!menuOutils.hidden && !menuOutils.contains(e.target) && !boutonOutils.contains(e.target)) {
    fermerMenuOutils();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fermerMenuOutils(true);
});
window.addEventListener('resize', () => fermerMenuOutils());

/* ==========================================================
   CONVERTISSEUR : heures et minutes -> heures décimales
   1,45 (1 h 45) -> 1,75      105 (minutes) -> 1,75
   ========================================================== */
const dialogueConvertisseur = $('#dialogue-convertisseur');
const champConvertisseur = $('#valeur-convertisseur');
const resultatConvertisseur = $('#resultat-convertisseur');
const detailConvertisseur = $('#detail-convertisseur');
const boutonCopier = $('#btn-copier-resultat');
const infoConvertisseur = $('#message-convertisseur');

const AIDE_FORMAT = 'Écris 1,45 (1 h 45) ou 105 (minutes). Les minutes prennent 2 chiffres : 1,05.';
let dernierResultat = '';

// "1,45" -> 1 h 45 min   "105" -> 105 min   texte invalide -> { erreur }
function convertir(texte) {
  const t = texte.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return { vide: true };

  let heures = 0;
  let minutes;

  let m = t.match(/^(\d{1,3})[,.:h](\d{2})$/);
  if (m) {
    heures = Number(m[1]);
    minutes = Number(m[2]);
    if (minutes > 59) return { erreur: 'Les minutes vont de 00 à 59 (ex. 1,45 pour 1 h 45).' };
  } else {
    m = t.match(/^(\d{1,5})(?:min)?$/);
    if (!m) return { erreur: AIDE_FORMAT };
    minutes = Number(m[1]);
  }

  const total = heures * 60 + minutes;
  const decimal = Math.round((total / 60) * 100) / 100;
  return {
    total,
    h: Math.floor(total / 60),
    min: total % 60,
    texte: String(decimal).replace('.', ',')
  };
}

function majConvertisseur() {
  infoConvertisseur.textContent = '';
  infoConvertisseur.className = 'message';

  const r = convertir(champConvertisseur.value);

  if (r.vide || r.erreur) {
    dernierResultat = '';
    resultatConvertisseur.textContent = '-';
    detailConvertisseur.textContent = r.erreur || AIDE_FORMAT;
    boutonCopier.disabled = true;
    return;
  }

  dernierResultat = r.texte;
  resultatConvertisseur.textContent = `${r.texte} h`;
  detailConvertisseur.textContent =
    `${r.h} h ${String(r.min).padStart(2, '0')} min (${r.total} min au total)`;
  boutonCopier.disabled = false;
}

function ouvrirConvertisseur() {
  champConvertisseur.value = '';
  majConvertisseur();
  dialogueConvertisseur.showModal();
  champConvertisseur.focus();
}

$('#btn-ouvrir-convertisseur').addEventListener('click', ouvrirConvertisseur);
champConvertisseur.addEventListener('input', majConvertisseur);
$('#form-convertisseur').addEventListener('submit', (e) => e.preventDefault()); // Entrée ne ferme pas la fenêtre
$('#btn-fermer-convertisseur').addEventListener('click', () => dialogueConvertisseur.close());

boutonCopier.addEventListener('click', async () => {
  if (!dernierResultat) return;
  try {
    await navigator.clipboard.writeText(dernierResultat);
    infoConvertisseur.textContent = `« ${dernierResultat} » copié.`;
    infoConvertisseur.className = 'message message--ok';
  } catch (err) {
    console.error(err);
    infoConvertisseur.textContent = 'Copie impossible : sélectionne le résultat et copie-le à la main.';
    infoConvertisseur.className = 'message message--erreur';
  }
});

/* ==========================================================
   TO-DO LISTE PAR PROJET
   Enregistrée dans Firestore (document utilisateurs/{uid}, champ « projets »).
   Format : [{ id, nom, taches: [{ id, texte, fait }] }]

   Ancien format : si le compte n'a que l'ancien champ « taches », ces tâches
   sont reprises dans un projet « Général » (rien n'est perdu). L'ancien champ
   n'est pas supprimé de Firestore, il n'est simplement plus utilisé.
   ========================================================== */
const listeTodo = $('#todo-liste');
const formTodo = $('#form-todo');
const champTodo = $('#todo-texte');
const compteurTodo = $('#todo-compteur');
const boutonNettoyer = $('#btn-todo-nettoyer');

const listeProjets = $('#projet-liste');
const boutonAjouterProjet = $('#btn-projet-ajouter');
const titreProjet = $('#todo-projet-titre');
const menuProjet = $('#menu-projet');

const dialogueProjet = $('#dialogue-projet');
const formRenommer = $('#form-renommer');
const champRenommer = $('#valeur-renommer');
const titreDialogueProjet = $('#titre-projet');
const boutonValiderProjet = $('#btn-valider-projet');

const MAX_PROJETS = 50;
const NOM_PROJET_MAX = 60;
const CLE_PROJET_ACTIF = 'todo-projet-actif';

let uid = null;            // utilisateur connecté
let chargementOk = false;  // les projets ont bien été lus (sinon on n'enregistre rien)
let projets = [];
let projetActifId = null;
let delaiMessage = null;
let modeProjet = 'creer'; // la fenêtre sert à créer ou à renommer
let cibleProjet = null;   // projet visé par « Renommer »

function majStatutTodo(texte) {
  $('#statut-todo').textContent = texte;
}

function messageTodo(texte, type = 'erreur') {
  const el = $('#message-todo');
  el.textContent = texte;
  el.className = texte ? `message message--${type}` : 'message';
  clearTimeout(delaiMessage);
  if (texte) {
    delaiMessage = setTimeout(() => {
      el.textContent = '';
      el.className = 'message';
    }, 5000);
  }
}

/* ----------------------------------------------------------
   Données : nettoyage, projet actif
   ---------------------------------------------------------- */
// Nettoie les tâches lues dans Firestore (au cas où elles seraient incomplètes)
function normaliserTaches(brut) {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((t) => ({
      id: typeof t.id === 'string' && t.id ? t.id : genererId(),
      texte: String(t.texte ?? '').slice(0, 200),
      fait: Boolean(t.fait)
    }))
    .filter((t) => t.texte.trim());
}

function nettoyerNom(texte) {
  return String(texte ?? '').trim().replace(/\s+/g, ' ').slice(0, NOM_PROJET_MAX);
}

function projetGeneral(taches = []) {
  // id fixe : le projet repris de l'ancien format garde la même identité d'une visite à l'autre
  return { id: 'general', nom: 'Général', taches };
}

function normaliserProjets(donnees) {
  // Ancien format (champ « taches » seulement) : tout va dans « Général »
  if (!Array.isArray(donnees.projets)) {
    return [projetGeneral(normaliserTaches(donnees.taches))];
  }

  const vus = new Set();
  const liste = donnees.projets
    .filter((p) => p && typeof p === 'object')
    .map((p) => {
      let id = typeof p.id === 'string' && p.id ? p.id : genererId();
      if (vus.has(id)) id = genererId();
      vus.add(id);
      return { id, nom: nettoyerNom(p.nom) || 'Sans nom', taches: normaliserTaches(p.taches) };
    });

  if (!liste.length) liste.push(projetGeneral());
  return liste;
}

function projetActif() {
  return projets.find((p) => p.id === projetActifId) || null;
}

function lireProjetLocal() {
  try {
    return localStorage.getItem(CLE_PROJET_ACTIF);
  } catch {
    return null;
  }
}

function sauverProjetLocal(id) {
  try {
    localStorage.setItem(CLE_PROJET_ACTIF, id);
  } catch {
    // stockage indisponible (navigation privée, etc.) : sans importance
  }
}

function choisirProjet(id) {
  const projet = projets.find((p) => p.id === id) || projets[0] || null;
  projetActifId = projet ? projet.id : null;
  if (projet) sauverProjetLocal(projet.id);
  rendreTout();
}

async function enregistrerProjets() {
  if (!uid || !chargementOk) return;
  majStatutTodo('Enregistrement…');
  try {
    await setDoc(doc(db, 'utilisateurs', uid), { projets }, { merge: true });
    majStatutTodo('Enregistré');
  } catch (err) {
    console.error(err);
    majStatutTodo('Non enregistré');
    messageTodo('Impossible d\'enregistrer les tâches. Vérifie ta connexion.');
  }
}

/* ----------------------------------------------------------
   Affichage : colonne des projets (à gauche)
   ---------------------------------------------------------- */
function nbAFaire(projet) {
  return projet.taches.filter((t) => !t.fait).length;
}

function creerProjetItem(projet) {
  const item = document.createElement('li');

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'projet-item';
  if (projet.id === projetActifId) bouton.setAttribute('aria-current', 'true');
  bouton.addEventListener('click', () => choisirProjet(projet.id));
  bouton.addEventListener('contextmenu', (e) => ouvrirMenuProjet(e, projet));

  const icone = document.createElement('span');
  icone.className = 'projet-icone';
  icone.setAttribute('aria-hidden', 'true');
  icone.textContent = Array.from(projet.nom)[0].toUpperCase();

  const nom = document.createElement('span');
  nom.className = 'projet-nom';
  nom.textContent = projet.nom;
  nom.title = projet.nom;

  bouton.append(icone, nom);

  const reste = nbAFaire(projet);
  if (reste) {
    const compte = document.createElement('span');
    compte.className = 'projet-compte';
    compte.textContent = String(reste);
    compte.title = reste === 1 ? '1 tâche à faire' : `${reste} tâches à faire`;
    bouton.append(compte);
  }

  item.append(bouton);
  return item;
}

function rendreProjets() {
  listeProjets.replaceChildren(...projets.map(creerProjetItem));
}

/* ----------------------------------------------------------
   Affichage : tâches du projet choisi
   ---------------------------------------------------------- */
/* ----------------------------------------------------------
   Déplacer les tâches à la main (souris, doigt ou clavier)
   Seules les tâches à faire se déplacent : les tâches terminées restent en bas.
   ---------------------------------------------------------- */
const ICONE_POIGNEE =
  '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" focusable="false">' +
  '<circle cx="2.5" cy="3" r="1.4" fill="currentColor"/><circle cx="7.5" cy="3" r="1.4" fill="currentColor"/>' +
  '<circle cx="2.5" cy="8" r="1.4" fill="currentColor"/><circle cx="7.5" cy="8" r="1.4" fill="currentColor"/>' +
  '<circle cx="2.5" cy="13" r="1.4" fill="currentColor"/><circle cx="7.5" cy="13" r="1.4" fill="currentColor"/>' +
  '</svg>';

let glissement = null; // { items, depart, cible, rects, ecart, poignee, pointerId, departY, clientY, raf }

function deplacerTache(id, nouvelIndex) {
  const projet = projetActif();
  if (!projet) return;

  const aFaire = projet.taches.filter((t) => !t.fait);
  const faites = projet.taches.filter((t) => t.fait);
  const de = aFaire.findIndex((t) => t.id === id);
  if (de < 0) return;

  const [tache] = aFaire.splice(de, 1);
  aFaire.splice(Math.max(0, Math.min(nouvelIndex, aFaire.length)), 0, tache);
  projet.taches = [...aFaire, ...faites];

  rendreTout();
  enregistrerProjets();
}

function positionnerGlissement() {
  const g = glissement;
  const dy = g.clientY + window.scrollY - g.departY;
  const moi = g.rects[g.depart];
  const centre = moi.haut + moi.hauteur / 2 + dy;

  // Nouvelle place = nombre de tâches dont le centre est plus haut que celui de la tâche déplacée
  let cible = 0;
  g.rects.forEach((r, i) => {
    if (i !== g.depart && r.haut + r.hauteur / 2 < centre) cible++;
  });
  g.cible = cible;

  const pas = moi.hauteur + g.ecart;
  g.items.forEach((el, i) => {
    if (i === g.depart) {
      el.style.transform = `translateY(${dy}px)`;
      return;
    }
    let decalage = 0;
    if (i > g.depart && i <= cible) decalage = -pas;
    else if (i < g.depart && i >= cible) decalage = pas;
    el.style.transform = decalage ? `translateY(${decalage}px)` : '';
  });
}

// Défile la page quand on tire une tâche près du haut ou du bas de l'écran
function suivreGlissement() {
  if (!glissement) return;
  const g = glissement;
  const marge = 60;
  if (g.clientY < marge) window.scrollBy(0, -Math.ceil((marge - g.clientY) / 4));
  else if (g.clientY > window.innerHeight - marge) window.scrollBy(0, Math.ceil((g.clientY - (window.innerHeight - marge)) / 4));
  positionnerGlissement();
  g.raf = requestAnimationFrame(suivreGlissement);
}

function demarrerGlissement(e, item) {
  if (glissement || (e.pointerType === 'mouse' && e.button !== 0)) return;

  const items = [...listeTodo.querySelectorAll('.todo-item:not(.fait)')];
  const depart = items.indexOf(item);
  if (depart < 0 || items.length < 2) return;

  e.preventDefault();
  const poignee = e.currentTarget;
  poignee.setPointerCapture(e.pointerId);

  const defilement = window.scrollY;
  glissement = {
    items,
    depart,
    cible: depart,
    rects: items.map((el) => {
      const r = el.getBoundingClientRect();
      return { haut: r.top + defilement, hauteur: r.height };
    }),
    ecart: parseFloat(getComputedStyle(listeTodo).rowGap) || 0,
    poignee,
    pointerId: e.pointerId,
    departY: e.clientY + defilement,
    clientY: e.clientY,
    raf: 0
  };

  item.classList.add('deplace');
  listeTodo.classList.add('en-deplacement');
  document.body.classList.add('deplacement-en-cours');
  suivreGlissement();
}

function terminerGlissement(annuler = false) {
  const g = glissement;
  if (!g) return;
  glissement = null;

  cancelAnimationFrame(g.raf);
  try {
    g.poignee.releasePointerCapture(g.pointerId);
  } catch {
    // déjà relâché : sans importance
  }

  g.items.forEach((el) => {
    el.style.transform = '';
    el.classList.remove('deplace');
  });
  listeTodo.classList.remove('en-deplacement');
  document.body.classList.remove('deplacement-en-cours');

  if (annuler || g.cible === g.depart) return;
  deplacerTache(g.items[g.depart].dataset.id, g.cible);
}

function creerPoignee(tache, item) {
  const poignee = document.createElement('button');
  poignee.type = 'button';
  poignee.className = 'todo-poignee';
  poignee.title = 'Glisser pour déplacer';
  poignee.setAttribute('aria-label', `Déplacer la tâche : ${tache.texte} (flèches haut et bas)`);
  poignee.innerHTML = ICONE_POIGNEE; // texte fixe défini plus haut, aucune donnée d'utilisateur

  poignee.addEventListener('pointerdown', (e) => demarrerGlissement(e, item));
  poignee.addEventListener('pointermove', (e) => {
    if (glissement && glissement.pointerId === e.pointerId) glissement.clientY = e.clientY;
  });
  poignee.addEventListener('pointerup', (e) => {
    if (glissement && glissement.pointerId === e.pointerId) terminerGlissement(false);
  });
  poignee.addEventListener('pointercancel', () => terminerGlissement(true));

  // Au clavier : flèche haut ou bas sur la poignée
  poignee.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();

    const projet = projetActif();
    if (!projet) return;
    const aFaire = projet.taches.filter((t) => !t.fait);
    const i = aFaire.findIndex((t) => t.id === tache.id);
    const cible = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (i < 0 || cible < 0 || cible >= aFaire.length) return;

    deplacerTache(tache.id, cible);
    const nouvelItem = [...listeTodo.children].find((li) => li.dataset.id === tache.id);
    const nouvellePoignee = nouvelItem && nouvelItem.querySelector('.todo-poignee');
    if (nouvellePoignee) nouvellePoignee.focus();
  });

  return poignee;
}

function creerItem(tache, projet) {
  const item = document.createElement('li');
  item.className = 'todo-item' + (tache.fait ? ' fait' : '');
  item.dataset.id = tache.id;

  const idCase = `todo-case-${tache.id}`;

  const caseACocher = document.createElement('input');
  caseACocher.type = 'checkbox';
  caseACocher.className = 'todo-case';
  caseACocher.id = idCase;
  caseACocher.checked = tache.fait;
  caseACocher.addEventListener('change', () => {
    tache.fait = caseACocher.checked;
    rendreTout();
    enregistrerProjets();
  });

  const texte = document.createElement('label');
  texte.className = 'todo-texte';
  texte.htmlFor = idCase;
  texte.textContent = tache.texte;

  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'todo-supprimer';
  supprimer.textContent = '×';
  supprimer.title = 'Supprimer la tâche';
  supprimer.setAttribute('aria-label', `Supprimer la tâche : ${tache.texte}`);
  supprimer.addEventListener('click', () => {
    projet.taches = projet.taches.filter((t) => t.id !== tache.id);
    rendreTout();
    enregistrerProjets();
  });

  // Tâche à faire : poignée pour la déplacer. Tâche terminée : espace vide pour garder l'alignement.
  let poignee;
  if (tache.fait) {
    poignee = document.createElement('span');
    poignee.className = 'todo-poignee-vide';
  } else {
    poignee = creerPoignee(tache, item);
  }

  item.append(poignee, caseACocher, texte, supprimer);
  return item;
}

function rendreTaches() {
  const projet = projetActif();
  const taches = projet ? projet.taches : [];

  titreProjet.textContent = projet ? projet.nom : '';

  const aFaire = taches.filter((t) => !t.fait);
  const faites = taches.filter((t) => t.fait);
  const ordre = [...aFaire, ...faites]; // les tâches terminées descendent en bas

  if (ordre.length) {
    listeTodo.replaceChildren(...ordre.map((t) => creerItem(t, projet)));
  } else {
    const vide = document.createElement('li');
    vide.className = 'todo-vide';
    vide.textContent = projet ? 'Aucune tâche dans ce projet pour l\'instant.' : '';
    listeTodo.replaceChildren(vide);
  }

  if (!taches.length) compteurTodo.textContent = '';
  else if (!aFaire.length) compteurTodo.textContent = 'Tout est fait.';
  else compteurTodo.textContent = aFaire.length === 1 ? '1 tâche à faire' : `${aFaire.length} tâches à faire`;

  boutonNettoyer.hidden = !faites.length;
}

function rendreTout() {
  rendreProjets();
  rendreTaches();
}

/* ----------------------------------------------------------
   Actions : tâches
   ---------------------------------------------------------- */
formTodo.addEventListener('submit', (e) => {
  e.preventDefault();

  const texte = champTodo.value.trim();
  if (!texte) return;

  const projet = projetActif();
  if (!chargementOk || !projet) {
    messageTodo('Les tâches sont en cours de chargement, réessaie dans un instant.');
    return;
  }

  projet.taches.unshift({ id: genererId(), texte, fait: false }); // la plus récente en haut
  champTodo.value = '';
  champTodo.focus();

  rendreTout();
  enregistrerProjets();
});

boutonNettoyer.addEventListener('click', () => {
  const projet = projetActif();
  if (!projet) return;
  if (!confirm('Retirer toutes les tâches terminées de ce projet ?')) return;
  projet.taches = projet.taches.filter((t) => !t.fait);
  rendreTout();
  enregistrerProjets();
});

/* ----------------------------------------------------------
   Actions : projets (ajouter, renommer, supprimer)
   ---------------------------------------------------------- */
function ouvrirDialogueProjet(mode, projet = null) {
  if (mode === 'renommer' && !projet) return;
  if (mode === 'creer') {
    if (!chargementOk) {
      messageTodo('Les projets sont en cours de chargement, réessaie dans un instant.');
      return;
    }
    if (projets.length >= MAX_PROJETS) {
      messageTodo(`Tu as atteint le maximum de ${MAX_PROJETS} projets.`);
      return;
    }
  }

  modeProjet = mode;
  cibleProjet = projet;
  titreDialogueProjet.textContent = mode === 'creer' ? 'Nouveau projet' : 'Renommer le projet';
  boutonValiderProjet.textContent = mode === 'creer' ? 'Créer' : 'Enregistrer';
  champRenommer.value = mode === 'creer' ? '' : projet.nom;

  dialogueProjet.showModal();
  champRenommer.focus();
  champRenommer.select();
}

boutonAjouterProjet.addEventListener('click', () => ouvrirDialogueProjet('creer'));

formRenommer.addEventListener('submit', (e) => {
  e.preventDefault(); // la fenêtre se ferme nous-mêmes, la page ne se recharge jamais
  const nom = nettoyerNom(champRenommer.value);
  if (!nom) {
    champRenommer.focus();
    return;
  }

  if (modeProjet === 'creer') {
    if (!chargementOk || projets.length >= MAX_PROJETS) return;
    const projet = { id: genererId(), nom, taches: [] };
    projets.push(projet); // en bas de la liste, dans l'ordre de création
    dialogueProjet.close();
    choisirProjet(projet.id);
    champTodo.focus(); // on peut écrire la première tâche tout de suite
  } else {
    if (!cibleProjet || !projets.includes(cibleProjet)) return;
    cibleProjet.nom = nom;
    dialogueProjet.close();
    rendreTout();
  }
  enregistrerProjets();
});

$('#btn-annuler-renommer').addEventListener('click', () => dialogueProjet.close());

function supprimerProjet(projet) {
  if (!projets.includes(projet) || projets.length < 2) return;

  if (projet.taches.length) {
    const n = projet.taches.length;
    const texte = `Supprimer le projet « ${projet.nom} » et ses ${n} ${n === 1 ? 'tâche' : 'tâches'} ?`;
    if (!confirm(texte)) return;
  }

  const index = projets.indexOf(projet);
  const etaitActif = projet.id === projetActifId;
  projets = projets.filter((p) => p !== projet);

  if (etaitActif) {
    // On passe au projet voisin
    choisirProjet(projets[Math.min(index, projets.length - 1)].id);
  } else {
    rendreTout();
  }
  enregistrerProjets();
}

/* ----------------------------------------------------------
   Menu du clic droit sur un projet : Renommer / Supprimer
   (même style que le menu du clic droit sur une case)
   ---------------------------------------------------------- */
function cacherMenuProjet() {
  menuProjet.hidden = true;
}

function optionMenuProjet(texte, action, desactive = false, titre = '') {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.setAttribute('role', 'menuitem');
  bouton.textContent = texte;
  bouton.disabled = desactive;
  if (titre) bouton.title = titre;
  bouton.addEventListener('click', () => {
    cacherMenuProjet();
    action();
  });
  menuProjet.append(bouton);
}

function ouvrirMenuProjet(e, projet) {
  e.preventDefault();
  menuProjet.replaceChildren();

  optionMenuProjet('Renommer', () => ouvrirDialogueProjet('renommer', projet));
  optionMenuProjet(
    'Supprimer',
    () => supprimerProjet(projet),
    projets.length < 2,
    projets.length < 2 ? 'Il faut garder au moins un projet' : ''
  );

  menuProjet.hidden = false;

  // Position : à la souris, sans sortir de l'écran
  menuProjet.style.left = '0px';
  menuProjet.style.top = '0px';
  const taille = menuProjet.getBoundingClientRect();
  menuProjet.style.left = `${Math.max(8, Math.min(e.clientX, window.innerWidth - taille.width - 8))}px`;
  menuProjet.style.top = `${Math.max(8, Math.min(e.clientY, window.innerHeight - taille.height - 8))}px`;

  menuProjet.querySelector('button').focus();
}

document.addEventListener('click', (e) => {
  if (!menuProjet.hidden && !menuProjet.contains(e.target)) cacherMenuProjet();
});
document.addEventListener('contextmenu', (e) => {
  if (!menuProjet.hidden && !e.target.closest('.projet-item')) cacherMenuProjet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cacherMenuProjet();
});
window.addEventListener('blur', cacherMenuProjet);
window.addEventListener('resize', cacherMenuProjet);
window.addEventListener('scroll', cacherMenuProjet, true);

/* ----------------------------------------------------------
   Chargement : à la connexion (et on vide tout à la déconnexion)
   ---------------------------------------------------------- */
onAuthStateChanged(auth, async (utilisateur) => {
  if (!utilisateur) {
    uid = null;
    chargementOk = false;
    projets = [];
    projetActifId = null;
    cacherMenuProjet();
    terminerGlissement(true);
    rendreTout();
    majStatutTodo('');
    return;
  }

  const moi = utilisateur.uid;
  uid = moi;
  chargementOk = false;
  projets = [];
  projetActifId = null;
  rendreTout();

  try {
    const instantane = await getDoc(doc(db, 'utilisateurs', moi));
    if (uid !== moi) return; // quelqu'un d'autre s'est connecté entre-temps
    const donnees = instantane.exists() ? instantane.data() : {};
    projets = normaliserProjets(donnees);
    chargementOk = true;
  } catch (err) {
    // On n'enregistre rien tant que la lecture a échoué : on ne risque pas d'écraser les vraies tâches.
    console.error(err);
    messageTodo('Impossible de charger tes tâches. Vérifie ta connexion.');
    return;
  }

  // Dernier projet ouvert sur cet appareil (sinon le premier)
  choisirProjet(lireProjetLocal());
  majStatutTodo('');
});

rendreTout();