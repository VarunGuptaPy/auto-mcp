"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, googleProvider, githubProvider } from "@/lib/firebase";

interface UserPlan {
  plan:          "free" | "pro";
  jobsThisMonth: number;
  planExpiresAt: Date | null;
}

interface AuthContextValue {
  user:              User | null;
  plan:              UserPlan | null;
  loading:           boolean;
  signInWithGoogle:  () => Promise<void>;
  signInWithGitHub:  () => Promise<void>;
  signOut:           () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const FREE_JOB_LIMIT = 5;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [plan,    setPlan]    = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // getFirebaseAuth() is called here — inside useEffect, so never runs on the server
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await ensureUserDoc(u);
        const p = await fetchPlan(u.uid);
        setPlan(p);
      } else {
        setPlan(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function ensureUserDoc(u: User) {
    const db  = getFirebaseDb();
    const ref = doc(db, "users", u.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        email:         u.email,
        displayName:   u.displayName,
        photoURL:      u.photoURL,
        plan:          "free",
        jobsThisMonth: 0,
        createdAt:     serverTimestamp(),
      });
    }
  }

  async function fetchPlan(uid: string): Promise<UserPlan> {
    try {
      const db   = getFirebaseDb();
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const d = snap.data();
        return {
          plan:           d.plan ?? "free",
          jobsThisMonth:  d.jobsThisMonth ?? 0,
          planExpiresAt:  d.planExpiresAt?.toDate() ?? null,
        };
      }
    } catch {}
    return { plan: "free", jobsThisMonth: 0, planExpiresAt: null };
  }

  async function signInWithGoogle() {
    await signInWithPopup(getFirebaseAuth(), googleProvider);
  }

  async function signInWithGitHub() {
    await signInWithPopup(getFirebaseAuth(), githubProvider);
  }

  async function signOut() {
    await firebaseSignOut(getFirebaseAuth());
    setPlan(null);
  }

  return (
    <AuthContext.Provider value={{ user, plan, loading, signInWithGoogle, signInWithGitHub, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
