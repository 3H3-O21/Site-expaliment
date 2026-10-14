import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/script.js';
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
  'permission-denied': 'Accès refusé : vérifie les règles Firestore.'
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
    try {
      await setDoc(doc(db, 'utilisateurs', credentiel.user.uid), {
        courriel: credentiel.user.email,
        creeLe: serverTimestamp()
      });
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

/* ----------------------------------------------------------
   Écran connecté
   ---------------------------------------------------------- */
$('#btn-renvoyer-verif').addEventListener('click', async () => {
  try {
    await sendEmailVerification(auth.currentUser);
    afficherMessage('app', 'Courriel de vérification renvoyé.', 'ok');
  } catch (err) {
    afficherMessage('app', messageErreur(err));
  }
});

$('#btn-deconnexion').addEventListener('click', () => signOut(auth));

/* ----------------------------------------------------------
   Suit l'état de connexion (au chargement, après connexion, après déconnexion)
   ---------------------------------------------------------- */
onAuthStateChanged(auth, async (utilisateur) => {
  if (!utilisateur) {
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
    verif.textContent = 'Confirme ton courriel : un lien de vérification vient de t\'être envoyé.';
    verif.className = 'message message--info';
    boutonRenvoi.hidden = false;
  }
});
