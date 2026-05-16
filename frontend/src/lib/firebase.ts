/**
 * Firebase client — lazy init so it never runs during Next.js SSR/prerender.
 * Call getAuth() / getDb() only from inside useEffect or event handlers.
 */
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth as _getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
} from "firebase/auth";
import { getFirestore as _getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

// Call these inside components / hooks only — not at module scope
export const getFirebaseAuth = () => _getAuth(getApp());
export const getFirebaseDb   = () => _getFirestore(getApp());

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });
githubProvider.addScope("repo");
