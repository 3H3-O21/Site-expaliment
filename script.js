import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';

/* ==========================================================
   Firebase
   ========================================================== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'fr'; // courriels de Firebase en français
const db = getFirestore(app);

const MDP_MIN = 8;

const $ = (selecteur) => document.querySelector(selecteur);

/* ----------------------------------------------------------
   Messages d'erreur en français
   ---------------------------------------------------------- */
const ERREURS = {
  'auth/email-already-in-use': 'Un compte existe déjà avec ce courriel.',
  'auth/invalid-email': 'Ce courriel n\'est pas valide.',
  'auth/weak-password': `Mot de passe trop faible (minimum ${MDP_MIN} caractères).`,
  'auth/invalid-credential': 'Courriel ou mot de passe incorrect.',
  'auth/user-not-found': 'Courriel ou mot de passe incorrect.',
  'auth/wrong-password': 'Courriel ou mot de passe incorrect.',
  'auth/too-many-requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
  'auth/network-request-failed': 'Problème de connexion réseau. Réessaie.',
  'auth/invalid-api-key': 'Configuration Firebase manquante : remplis firebase-config.js.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Configuration Firebase manquante : remplis firebase-config.js.',
  'permission-denied': 'Accès refusé : vérifie les règles Firestore.',
  'unavailable': 'Impossible de joindre la base de données. Vérifie ta connexion.'
};

function messageErreur(err) {
  console.error(err);
  return ERREURS[err.code] || 'Une erreur est survenue. Réessaie.';
}

/* ----------------------------------------------------------
   Navigation entre les écrans
   ---------------------------------------------------------- */
function afficherMessage(vueId, texte, type = 'erreur') {
  const el = document.querySelector(`#${vueId} .message:not([data-verif])`);
  if (!el) return;
  el.textContent = texte;
  el.className = `message message--${type}`;
}

function afficher(id, texte, type) {
  document.querySelectorAll('.view').forEach((vue) => {
    vue.classList.toggle('active', vue.id === id);
  });

  // Nettoyage : messages et champs des autres écrans
  document.querySelectorAll('.message').forEach((m) => {
    m.textContent = '';
    m.className = 'message';
  });
  document.querySelectorAll('form').forEach((f) => {
    if (!f.closest(`#${id}`)) f.reset();
  });

  if (texte) afficherMessage(id, texte, type);

  window.scrollTo(0, 0);
  const premierChamp = document.querySelector(`#${id} input:not(:disabled)`);
  if (premierChamp) premierChamp.focus();
}

function vueActive() {
  const vue = document.querySelector('.view.active');
  return vue ? vue.id : null;
}

// Tous les éléments avec data-goto="id-de-l-ecran" changent d'écran
document.addEventListener('click', (e) => {
  const cible = e.target.closest('[data-goto]');
  if (cible) afficher(cible.dataset.goto);
});

// Désactive le bouton d'envoi pendant la requête (évite les doubles clics)
async function avecBouton(formulaire, action) {
  const bouton = formulaire.querySelector('[type="submit"]');
  bouton.disabled = true;
  try {
    await action();
  } finally {
    bouton.disabled = false;
  }
}

/* ----------------------------------------------------------
   Inscription : compte Firebase + document dans Firestore
                 + courriel de vérification
   ---------------------------------------------------------- */
$('#form-inscription').addEventListener('submit', (e) => {
  e.preventDefault();

  const courriel = $('#inscription-courriel').value.trim();
  const motDePasse = $('#inscription-mdp').value;

  if (motDePasse.length < MDP_MIN) {
    afficherMessage('inscription', `Le mot de passe doit contenir au moins ${MDP_MIN} caractères.`);
    return;
  }

  avecBouton(e.target, async () => {
    let credentiel;
    try {
      credentiel = await createUserWithEmailAndPassword(auth, courriel, motDePasse);
    } catch (err) {
      afficherMessage('inscription', messageErreur(err));
      return;
    }

    // Le compte existe : onAuthStateChanged affiche l'écran connecté.
    // On enregistre ensuite le profil et on envoie le courriel de vérification.
    // { merge: true } : ne jamais écraser la feuille de temps si elle est déjà là.
    try {
      await setDoc(
        doc(db, 'utilisateurs', credentiel.user.uid),
        { courriel: credentiel.user.email, creeLe: serverTimestamp() },
        { merge: true }
      );
      await sendEmailVerification(credentiel.user);
    } catch (err) {
      afficherMessage('app', messageErreur(err));
    }
  });
});

/* ----------------------------------------------------------
   Connexion
   ---------------------------------------------------------- */
$('#form-connexion').addEventListener('submit', (e) => {
  e.preventDefault();

  const courriel = $('#connexion-courriel').value.trim();
  const motDePasse = $('#connexion-mdp').value;

  avecBouton(e.target, async () => {
    try {
      await signInWithEmailAndPassword(auth, courriel, motDePasse);
      // La suite est gérée par onAuthStateChanged
    } catch (err) {
      afficherMessage('connexion', messageErreur(err));
    }
  });
});

/* ----------------------------------------------------------
   Mot de passe oublié : Firebase envoie un courriel avec un lien
   ---------------------------------------------------------- */
$('#form-oubli').addEventListener('submit', (e) => {
  e.preventDefault();

  const courriel = $('#oubli-courriel').value.trim();

  avecBouton(e.target, async () => {
    try {
      await sendPasswordResetEmail(auth, courriel);
    } catch (err) {
      // On ne révèle pas si un courriel a un compte ou non
      if (err.code !== 'auth/user-not-found') {
        afficherMessage('oubli', messageErreur(err));
        return;
      }
    }
    afficherMessage(
      'oubli',
      'Si un compte existe avec ce courriel, un lien de réinitialisation vient d\'être envoyé. Pense à vérifier tes indésirables.',
      'ok'
    );
  });
});

$('#btn-renvoyer-verif').addEventListener('click', async () => {
  try {
    await sendEmailVerification(auth.currentUser);
    afficherMessage('app', 'Courriel de vérification renvoyé.', 'ok');
  } catch (err) {
    afficherMessage('app', messageErreur(err));
  }
});

/* ==========================================================
   FEUILLE DE TEMPS
   Chaque utilisateur a sa feuille, enregistrée dans Firestore
   (document utilisateurs/{uid}, champ « feuille »).

   Format des données :
   lignes : [{ id, objet, tache, jours: [{ s: secondes, c: commentaire } x 7] }]
   chrono : null ou { ligneId, jour, debut: horodatage en ms, base: secondes au départ }
   ========================================================== */
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const JOURS_COMPLETS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MAX_HEURES_PAR_CASE = 24;
const DELAI_SAUVEGARDE_MS = 600;

const ICONE_CHRONO =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">' +
  '<circle cx="8" cy="9.2" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<path d="M8 9.2V6.6M6.2 1.8h3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
  '</svg>';

const corps = $('#feuille-corps');
const menu = $('#menu-contextuel');
const infobulle = $('#infobulle');
const dialogue = $('#dialogue-commentaire');

let uid = null;               // utilisateur connecté
let chargementOk = false;     // les données ont bien été lues (sinon on n'enregistre rien)
let lignes = [];
let chrono = null;            // un seul chrono à la fois
let minuteur = null;          // setInterval du chrono
let delaiSauvegarde = null;
let delaiAvertissement = null;
let cibleCommentaire = null;  // { ligne, jour } pendant que la fenêtre est ouverte
const cellules = new Map();   // "idLigne:jour" -> éléments de la case

/* ----------------------------------------------------------
   Outils : temps
   ---------------------------------------------------------- */
// 5400 s -> "1,5"   900 s -> "0,25"   0 s -> ""
function formaterHeures(secondes) {
  if (!secondes) return '';
  const heures = Math.round((secondes / 3600) * 100) / 100;
  return String(heures === 0 ? 0.01 : heures).replace('.', ',');
}

// Texte d'une case : "-" quand il n'y a aucun temps
function texteCase(secondes) {
  return secondes ? formaterHeures(secondes) : '-';
}

// Cases « Total » sous les jours de la semaine
const totauxJours = JOURS.map((_, i) => document.querySelector(`.total-jour[data-jour="${i}"]`));

// Additionne les temps de chaque jour (un chrono en marche est compté une fois arrêté)
function majTotaux() {
  JOURS.forEach((_, jour) => {
    const secondes = lignes.reduce((somme, l) => somme + l.jours[jour].s, 0);
    totauxJours[jour].textContent = texteCase(secondes);
  });
}

// "1,5" ou "1.5" -> 1.5   "" -> 0   texte invalide -> null
function analyserHeures(texte) {
  const t = texte.trim().replace(',', '.');
  if (t === '') return 0;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const heures = parseFloat(t);
  return heures <= MAX_HEURES_PAR_CASE ? heures : null;
}

// 5025 s -> "1:23:45"
function formaterChrono(secondes) {
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const s = secondes % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function secondesChrono() {
  return chrono.base + Math.max(0, Math.floor((Date.now() - chrono.debut) / 1000));
}

function cle(idLigne, jour) {
  return `${idLigne}:${jour}`;
}

function genererId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function nouvelleLigne() {
  return {
    id: genererId(),
    objet: '',
    tache: '',
    jours: JOURS.map(() => ({ s: 0, c: '' }))
  };
}

function trouverLigne(id) {
  return lignes.find((l) => l.id === id);
}

function estEnMarche(ligne, jour) {
  return Boolean(chrono && chrono.ligneId === ligne.id && chrono.jour === jour);
}

// Nettoie les données lues dans Firestore (au cas où elles seraient incomplètes)
function normaliserFeuille(brut) {
  const liste = brut && Array.isArray(brut.lignes) ? brut.lignes : [];

  const lignesOk = liste.map((l) => ({
    id: typeof l.id === 'string' && l.id ? l.id : genererId(),
    objet: String(l.objet ?? ''),
    tache: String(l.tache ?? ''),
    jours: JOURS.map((_, i) => {
      const j = (l.jours && l.jours[i]) || {};
      return {
        s: Number.isFinite(j.s) && j.s > 0 ? Math.round(j.s) : 0,
        c: String(j.c ?? '')
      };
    })
  }));
  if (!lignesOk.length) lignesOk.push(nouvelleLigne());

  let chronoOk = null;
  const c = brut && brut.chrono;
  if (
    c &&
    lignesOk.some((l) => l.id === c.ligneId) &&
    Number.isInteger(c.jour) && c.jour >= 0 && c.jour < 7 &&
    Number.isFinite(c.debut) && Number.isFinite(c.base)
  ) {
    chronoOk = { ligneId: c.ligneId, jour: c.jour, debut: c.debut, base: c.base };
  }

  return { lignes: lignesOk, chrono: chronoOk };
}

/* ----------------------------------------------------------
   Sauvegarde dans Firestore
   ---------------------------------------------------------- */
function majStatut(texte) {
  $('#statut-enregistrement').textContent = texte;
}

function planifierSauvegarde(rapide = false) {
  if (!chargementOk) return;
  majStatut('Enregistrement…');
  clearTimeout(delaiSauvegarde);
  delaiSauvegarde = setTimeout(enregistrer, rapide ? 100 : DELAI_SAUVEGARDE_MS);
}

async function enregistrer() {
  clearTimeout(delaiSauvegarde);
  delaiSauvegarde = null;
  if (!uid || !chargementOk) return;

  try {
    await setDoc(
      doc(db, 'utilisateurs', uid),
      { feuille: { lignes, chrono }, misAJourLe: serverTimestamp() },
      { merge: true }
    );
    majStatut('Enregistré');
  } catch (err) {
    majStatut('Non enregistré');
    afficherMessage('app', messageErreur(err));
  }
}

// Enregistre tout de suite quand on quitte ou cache la page
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (delaiSauvegarde) enregistrer();
  } else if (chrono) {
    tictac();
  }
});
window.addEventListener('pagehide', () => {
  if (delaiSauvegarde) enregistrer();
});

async function chargerFeuille(utilisateur) {
  uid = utilisateur.uid;
  chargementOk = false;

  let brut = null;
  try {
    const instantane = await getDoc(doc(db, 'utilisateurs', uid));
    brut = instantane.exists() ? instantane.data().feuille : null;
    chargementOk = true;
  } catch (err) {
    // On n'affiche pas la feuille et on n'enregistre rien : on ne risque pas d'écraser les vraies données.
    afficherMessage('app', messageErreur(err));
    $('#zone-feuille').hidden = true;
    return;
  }

  const etat = normaliserFeuille(brut);
  lignes = etat.lignes;
  chrono = etat.chrono;

  rendreFeuille();
  if (chrono) lancerMinuteur();
  $('#zone-feuille').hidden = false;
  majStatut('');
}

function reinitialiserFeuille() {
  clearTimeout(delaiSauvegarde);
  delaiSauvegarde = null;
  arreterMinuteur();
  uid = null;
  chargementOk = false;
  lignes = [];
  chrono = null;
  cellules.clear();
  corps.replaceChildren();
  majTotaux();
  $('#zone-feuille').hidden = true;
  cacherMenu();
  cacherInfobulle();
  majStatut('');
}

/* ----------------------------------------------------------
   Affichage de la feuille
   ---------------------------------------------------------- */
function rendreFeuille() {
  cellules.clear();
  corps.replaceChildren(...lignes.map((ligne, index) => creerLigne(ligne, index)));
  majTotaux();
}

function creerLigne(ligne, index) {
  const rangee = document.createElement('div');
  rangee.className = 'feuille-ligne';
  rangee.dataset.id = ligne.id;

  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'btn-supprimer-ligne';
  supprimer.textContent = '×';
  supprimer.title = 'Supprimer la ligne';
  supprimer.setAttribute('aria-label', `Supprimer la ligne ${index + 1}`);
  supprimer.addEventListener('click', () => supprimerLigne(ligne.id));

  rangee.append(
    supprimer,
    creerChampTexte(ligne, 'objet', `Objet, ligne ${index + 1}`),
    creerChampTexte(ligne, 'tache', `Tâche, ligne ${index + 1}`)
  );
  JOURS.forEach((_, jour) => rangee.append(creerCellule(ligne, jour, index)));

  return rangee;
}

function creerChampTexte(ligne, propriete, etiquette) {
  const champ = document.createElement('input');
  champ.type = 'text';
  champ.className = 'champ-texte';
  champ.maxLength = 200;
  champ.autocomplete = 'off';
  champ.value = ligne[propriete];
  champ.setAttribute('aria-label', etiquette);
  champ.addEventListener('input', () => {
    ligne[propriete] = champ.value;
    planifierSauvegarde();
  });
  return champ;
}

function creerCellule(ligne, jour, index) {
  const enveloppe = document.createElement('div');
  enveloppe.className = 'cellule';
  enveloppe.dataset.ligne = ligne.id;
  enveloppe.dataset.jour = String(jour);

  const champ = document.createElement('input');
  champ.type = 'text';
  champ.className = 'cellule-temps';
  champ.inputMode = 'decimal';
  champ.autocomplete = 'off';
  champ.setAttribute('aria-label', `${JOURS_COMPLETS[jour]}, ligne ${index + 1} (en heures, par exemple 1,5)`);

  const marque = document.createElement('span');
  marque.className = 'marque-commentaire';
  marque.setAttribute('aria-hidden', 'true');

  const badge = document.createElement('span');
  badge.className = 'badge-chrono';
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', 'Chrono en marche');
  badge.innerHTML = ICONE_CHRONO; // texte fixe défini plus haut, aucune donnée d'utilisateur

  enveloppe.append(champ, marque, badge);
  cellules.set(cle(ligne.id, jour), { enveloppe, champ, marque, badge });

  champ.addEventListener('change', () => validerSaisie(ligne, jour));
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') champ.blur();
  });
  enveloppe.addEventListener('contextmenu', (e) => ouvrirMenu(e, ligne, jour));
  enveloppe.addEventListener('mouseenter', () => afficherInfobulle(ligne, jour, enveloppe));
  enveloppe.addEventListener('mouseleave', cacherInfobulle);
  champ.addEventListener('focus', () => {
    // On enlève le "-" pour pouvoir écrire directement dans la case
    if (!estEnMarche(ligne, jour) && champ.value === '-') champ.value = '';
    afficherInfobulle(ligne, jour, enveloppe);
  });
  champ.addEventListener('blur', () => {
    cacherInfobulle();
    validerSaisie(ligne, jour); // remet le "-" si la case est restée vide
  });

  majCellule(ligne, jour);
  return enveloppe;
}

// Met à jour l'affichage d'une case (temps, symbole du chrono, marque de commentaire)
function majCellule(ligne, jour) {
  const c = cellules.get(cle(ligne.id, jour));
  if (!c) return;

  const donnee = ligne.jours[jour];
  const enMarche = estEnMarche(ligne, jour);

  c.enveloppe.classList.toggle('en-cours', enMarche);
  c.champ.readOnly = enMarche;
  c.badge.hidden = !enMarche;
  c.marque.hidden = !donnee.c;
  c.champ.classList.toggle('vide', !enMarche && !donnee.s);
  c.champ.value = enMarche ? formaterChrono(secondesChrono()) : texteCase(donnee.s);
}

function avertir(texte) {
  afficherMessage('app', texte, 'erreur');
  clearTimeout(delaiAvertissement);
  delaiAvertissement = setTimeout(() => {
    const el = document.querySelector('#app .message:not([data-verif])');
    if (el) {
      el.textContent = '';
      el.className = 'message';
    }
  }, 5000);
}

// Quand la personne a fini d'écrire un temps dans une case
function validerSaisie(ligne, jour) {
  const c = cellules.get(cle(ligne.id, jour));
  const donnee = ligne.jours[jour];
  if (!c) return;

  // Pendant un chrono, la case est en lecture seule : rien à valider
  if (estEnMarche(ligne, jour)) return;

  const texte = c.champ.value.trim();

  // Texte inchangé ("-" laissé tel quel, ou temps venant d'un chrono) : on garde les secondes exactes
  if (texte === texteCase(donnee.s) || (texte === '' && !donnee.s)) {
    majCellule(ligne, jour);
    return;
  }

  const heures = texte === '-' ? 0 : analyserHeures(texte);
  if (heures === null) {
    avertir(`Écris un nombre d'heures entre 0 et ${MAX_HEURES_PAR_CASE}, par exemple 1,5 (1 h 30) ou 0,25 (15 min).`);
    majCellule(ligne, jour); // remet l'ancienne valeur
    return;
  }

  donnee.s = Math.round(heures * 3600);
  majCellule(ligne, jour);
  majTotaux();
  planifierSauvegarde();
}

/* ----------------------------------------------------------
   Ajouter / supprimer des lignes
   ---------------------------------------------------------- */
$('#btn-ajouter-ligne').addEventListener('click', () => {
  lignes.push(nouvelleLigne());
  rendreFeuille();

  const derniere = corps.lastElementChild;
  const champ = derniere && derniere.querySelector('.champ-texte');
  if (champ) champ.focus();

  planifierSauvegarde();
});

function supprimerLigne(id) {
  const ligne = trouverLigne(id);
  if (!ligne) return;

  const contientDesDonnees =
    ligne.objet || ligne.tache || ligne.jours.some((j) => j.s || j.c) || (chrono && chrono.ligneId === id);
  if (contientDesDonnees && !confirm('Supprimer cette ligne et tous ses temps ?')) return;

  if (chrono && chrono.ligneId === id) {
    chrono = null;
    arreterMinuteur();
  }

  lignes = lignes.filter((l) => l.id !== id);
  if (!lignes.length) lignes.push(nouvelleLigne());

  rendreFeuille();
  planifierSauvegarde();
}

$('#btn-tout-effacer').addEventListener('click', () => {
  if (!confirm('Tout effacer ? Toutes les lignes, les temps et les commentaires seront supprimés.')) return;

  chrono = null;
  arreterMinuteur();
  lignes = [nouvelleLigne()];

  rendreFeuille();
  planifierSauvegarde();
});

/* ----------------------------------------------------------
   Chronomètre (un seul à la fois)
   Le temps est calculé avec l'heure de départ : il reste exact même
   si l'onglet est en arrière-plan.
   ---------------------------------------------------------- */
function lancerMinuteur() {
  arreterMinuteur();
  minuteur = setInterval(tictac, 1000);
}

function arreterMinuteur() {
  if (minuteur) clearInterval(minuteur);
  minuteur = null;
}

function tictac() {
  if (!chrono) {
    arreterMinuteur();
    return;
  }
  const ligne = trouverLigne(chrono.ligneId);
  if (ligne) majCellule(ligne, chrono.jour);
}

// Met le chrono en pause : le temps écoulé est ajouté à la case
function arreterChrono() {
  if (!chrono) return;

  const ligne = trouverLigne(chrono.ligneId);
  const jour = chrono.jour;
  if (ligne) ligne.jours[jour].s = secondesChrono();

  chrono = null;
  arreterMinuteur();
  if (ligne) majCellule(ligne, jour);
  majTotaux(); // le total du jour se met à jour quand le chrono s'arrête
}

function demarrerChrono(ligne, jour) {
  arreterChrono(); // arrête automatiquement le chrono d'une autre case

  chrono = { ligneId: ligne.id, jour, debut: Date.now(), base: ligne.jours[jour].s };
  lancerMinuteur();
  majCellule(ligne, jour);
  planifierSauvegarde(true);
}

/* ----------------------------------------------------------
   Menu du clic droit
   ---------------------------------------------------------- */
function ajouterOptionMenu(texte, action) {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.setAttribute('role', 'menuitem');
  bouton.textContent = texte;
  bouton.addEventListener('click', () => {
    cacherMenu();
    action();
  });
  menu.append(bouton);
}

function ouvrirMenu(e, ligne, jour) {
  e.preventDefault();
  cacherInfobulle();
  menu.replaceChildren();

  const donnee = ligne.jours[jour];

  ajouterOptionMenu(
    donnee.c ? 'Modifier le commentaire' : 'Ajouter un commentaire',
    () => ouvrirDialogueCommentaire(ligne, jour)
  );
  if (donnee.c) {
    ajouterOptionMenu('Supprimer le commentaire', () => {
      donnee.c = '';
      majCellule(ligne, jour);
      planifierSauvegarde();
    });
  }

  menu.append(document.createElement('hr'));

  if (estEnMarche(ligne, jour)) {
    ajouterOptionMenu('Mettre le chrono en pause', () => {
      arreterChrono();
      planifierSauvegarde(true);
    });
  } else {
    ajouterOptionMenu('Démarrer le chrono', () => demarrerChrono(ligne, jour));
  }

  menu.hidden = false;

  // Position : à la souris, sans sortir de l'écran
  menu.style.left = '0px';
  menu.style.top = '0px';
  const taille = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(e.clientX, window.innerWidth - taille.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(e.clientY, window.innerHeight - taille.height - 8))}px`;

  const premier = menu.querySelector('button');
  if (premier) premier.focus();
}

function cacherMenu() {
  menu.hidden = true;
}

document.addEventListener('click', (e) => {
  if (!menu.hidden && !menu.contains(e.target)) cacherMenu();
});
document.addEventListener('contextmenu', (e) => {
  if (!menu.hidden && !e.target.closest('.cellule')) cacherMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cacherMenu();
});
window.addEventListener('blur', cacherMenu);
window.addEventListener('resize', cacherMenu);
window.addEventListener('scroll', () => {
  cacherMenu();
  cacherInfobulle();
}, true);

/* ----------------------------------------------------------
   Commentaires : fenêtre de saisie + infobulle au survol
   ---------------------------------------------------------- */
function ouvrirDialogueCommentaire(ligne, jour) {
  cibleCommentaire = { ligne, jour };
  $('#titre-commentaire').textContent = `Commentaire (${JOURS_COMPLETS[jour]})`;
  $('#texte-commentaire').value = ligne.jours[jour].c;
  dialogue.showModal();
  $('#texte-commentaire').focus();
}

$('#form-commentaire').addEventListener('submit', () => {
  if (!cibleCommentaire) return;
  const { ligne, jour } = cibleCommentaire;
  ligne.jours[jour].c = $('#texte-commentaire').value.trim();
  cibleCommentaire = null;
  majCellule(ligne, jour);
  planifierSauvegarde();
});

$('#btn-annuler-commentaire').addEventListener('click', () => {
  cibleCommentaire = null;
  dialogue.close();
});

dialogue.addEventListener('close', () => {
  cibleCommentaire = null;
});

function afficherInfobulle(ligne, jour, enveloppe) {
  const texte = ligne.jours[jour].c;
  if (!texte || !menu.hidden) return;

  infobulle.textContent = texte;
  infobulle.hidden = false;

  const cellule = enveloppe.getBoundingClientRect();
  const bulle = infobulle.getBoundingClientRect();

  let gauche = cellule.left + cellule.width / 2 - bulle.width / 2;
  gauche = Math.max(8, Math.min(gauche, window.innerWidth - bulle.width - 8));

  let haut = cellule.bottom + 6;
  if (haut + bulle.height > window.innerHeight - 8) haut = cellule.top - bulle.height - 6;

  infobulle.style.left = `${gauche}px`;
  infobulle.style.top = `${haut}px`;
}

function cacherInfobulle() {
  infobulle.hidden = true;
}

/* ----------------------------------------------------------
   Plein écran (cache le bandeau du navigateur)
   Échap ou un 2e clic sur le bouton pour en sortir.
   ---------------------------------------------------------- */
const boutonPleinEcran = $('#btn-plein-ecran');
const racine = document.documentElement;

function elementPleinEcran() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function majBoutonPleinEcran() {
  const actif = Boolean(elementPleinEcran());
  const texte = actif ? 'Quitter le plein écran' : 'Passer en plein écran';
  boutonPleinEcran.classList.toggle('actif', actif);
  boutonPleinEcran.title = texte;
  boutonPleinEcran.setAttribute('aria-label', texte);
}

const pleinEcranPossible =
  (document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
  (racine.requestFullscreen || racine.webkitRequestFullscreen);

if (pleinEcranPossible) {
  boutonPleinEcran.hidden = false;

  boutonPleinEcran.addEventListener('click', async () => {
    try {
      if (elementPleinEcran()) {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        await (racine.requestFullscreen || racine.webkitRequestFullscreen).call(racine);
      }
    } catch (err) {
      console.error(err);
      avertir('Le plein écran n\'est pas disponible dans ce navigateur.');
    }
  });

  document.addEventListener('fullscreenchange', majBoutonPleinEcran);
  document.addEventListener('webkitfullscreenchange', majBoutonPleinEcran);
}

/* ----------------------------------------------------------
   Déconnexion
   ---------------------------------------------------------- */
$('#btn-deconnexion').addEventListener('click', async () => {
  if (delaiSauvegarde) await enregistrer(); // ne perd aucune modification
  await signOut(auth);
});

/* ----------------------------------------------------------
   Suit l'état de connexion (au chargement, après connexion, après déconnexion)
   ---------------------------------------------------------- */
onAuthStateChanged(auth, async (utilisateur) => {
  if (!utilisateur) {
    reinitialiserFeuille();
    if (vueActive() === 'app') afficher('accueil');
    return;
  }

  // Rafraîchit l'état (ex. courriel confirmé depuis le dernier passage)
  try {
    await utilisateur.reload();
  } catch (err) {
    console.error(err);
  }

  const courant = auth.currentUser;
  if (!courant) return;

  $('#app-courriel').textContent = courant.email;
  afficher('app');

  const verif = $('#app-verif');
  const boutonRenvoi = $('#btn-renvoyer-verif');
  if (courant.emailVerified) {
    boutonRenvoi.hidden = true;
  } else {
    verif.textContent = 'Confirme ton courriel : un lien de vérification t\'a été envoyé.';
    verif.className = 'message message--info';
    boutonRenvoi.hidden = false;
  }

  await chargerFeuille(courant);
});