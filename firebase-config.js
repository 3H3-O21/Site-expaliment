// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBuwX_pbhVBh0QCY8vv6tu-U1UKG7pevv4",
  authDomain: "timetrack-27a02.firebaseapp.com",
  projectId: "timetrack-27a02",
  storageBucket: "timetrack-27a02.firebasestorage.app",
  messagingSenderId: "495182118018",
  appId: "1:495182118018:web:db38a3f74ec34b0abe489b",
  measurementId: "G-MWGL0LC6NK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);