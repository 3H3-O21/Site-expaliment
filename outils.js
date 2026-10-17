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
   TO-DO LISTE
   Enregistrée dans Firestore (document utilisateurs/{uid}, champ « taches »).
   Format : [{ id, texte, fait }]
   ========================================================== */
const listeTodo = $('#todo-liste');
const formTodo = $('#form-todo');
const champTodo = $('#todo-texte');
const compteurTodo = $('#todo-compteur');
const boutonNettoyer = $('#btn-todo-nettoyer');

let uid = null;            // utilisateur connecté
let chargementOk = false;  // les tâches ont bien été lues (sinon on n'enregistre rien)
let taches = [];
let delaiMessage = null;

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

// Nettoie les données lues dans Firestore (au cas où elles seraient incomplètes)
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

async function enregistrerTaches() {
  if (!uid || !chargementOk) return;
  majStatutTodo('Enregistrement…');
  try {
    await setDoc(doc(db, 'utilisateurs', uid), { taches }, { merge: true });
    majStatutTodo('Enregistré');
  } catch (err) {
    console.error(err);
    majStatutTodo('Non enregistré');
    messageTodo('Impossible d\'enregistrer les tâches. Vérifie ta connexion.');
  }
}

function creerItem(tache) {
  const item = document.createElement('li');
  item.className = 'todo-item' + (tache.fait ? ' fait' : '');

  const idCase = `todo-case-${tache.id}`;

  const caseACocher = document.createElement('input');
  caseACocher.type = 'checkbox';
  caseACocher.className = 'todo-case';
  caseACocher.id = idCase;
  caseACocher.checked = tache.fait;
  caseACocher.addEventListener('change', () => {
    tache.fait = caseACocher.checked;
    rendreTodo();
    enregistrerTaches();
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
    taches = taches.filter((t) => t.id !== tache.id);
    rendreTodo();
    enregistrerTaches();
  });

  item.append(caseACocher, texte, supprimer);
  return item;
}

function rendreTodo() {
  const aFaire = taches.filter((t) => !t.fait);
  const faites = taches.filter((t) => t.fait);
  const ordre = [...aFaire, ...faites]; // les tâches terminées descendent en bas

  if (ordre.length) {
    listeTodo.replaceChildren(...ordre.map(creerItem));
  } else {
    const vide = document.createElement('li');
    vide.className = 'todo-vide';
    vide.textContent = 'Aucune tâche pour l\'instant.';
    listeTodo.replaceChildren(vide);
  }

  if (!taches.length) compteurTodo.textContent = '';
  else if (!aFaire.length) compteurTodo.textContent = 'Tout est fait.';
  else compteurTodo.textContent = aFaire.length === 1 ? '1 tâche à faire' : `${aFaire.length} tâches à faire`;

  boutonNettoyer.hidden = !faites.length;
}

formTodo.addEventListener('submit', (e) => {
  e.preventDefault();

  const texte = champTodo.value.trim();
  if (!texte) return;

  if (!chargementOk) {
    messageTodo('Les tâches sont en cours de chargement, réessaie dans un instant.');
    return;
  }

  taches.unshift({ id: genererId(), texte, fait: false }); // la plus récente en haut
  champTodo.value = '';
  champTodo.focus();

  rendreTodo();
  enregistrerTaches();
});

boutonNettoyer.addEventListener('click', () => {
  if (!confirm('Retirer toutes les tâches terminées ?')) return;
  taches = taches.filter((t) => !t.fait);
  rendreTodo();
  enregistrerTaches();
});

// Charge les tâches de la personne connectée (et vide la liste à la déconnexion)
onAuthStateChanged(auth, async (utilisateur) => {
  if (!utilisateur) {
    uid = null;
    chargementOk = false;
    taches = [];
    rendreTodo();
    majStatutTodo('');
    return;
  }

  const moi = utilisateur.uid;
  uid = moi;
  chargementOk = false;
  taches = [];
  rendreTodo();

  try {
    const instantane = await getDoc(doc(db, 'utilisateurs', moi));
    if (uid !== moi) return; // quelqu'un d'autre s'est connecté entre-temps
    const donnees = instantane.exists() ? instantane.data() : {};
    taches = normaliserTaches(donnees.taches);
    chargementOk = true;
  } catch (err) {
    // On n'enregistre rien tant que la lecture a échoué : on ne risque pas d'écraser les vraies tâches.
    console.error(err);
    messageTodo('Impossible de charger tes tâches. Vérifie ta connexion.');
    return;
  }

  rendreTodo();
  majStatutTodo('');
});

rendreTodo();