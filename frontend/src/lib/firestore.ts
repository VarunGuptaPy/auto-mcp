import {
  doc, collection, addDoc, updateDoc, getDocs,
  query, orderBy, limit, serverTimestamp, increment,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export interface JobRecord {
  id:        string;
  jobId:     string;
  url:       string;
  status:    string;
  features:  number;
  name:      string;
  createdAt: Date;
}

export async function saveJobStart(uid: string, jobId: string, url: string): Promise<string> {
  const db  = getFirebaseDb();
  const ref = await addDoc(collection(db, "users", uid, "jobs"), {
    jobId,
    url,
    status:    "queued",
    features:  0,
    name:      "",
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "users", uid), {
    jobsThisMonth: increment(1),
  });

  return ref.id;
}

export async function updateJobDone(
  uid: string,
  docId: string,
  data: { status: string; features: number; name: string }
) {
  const db = getFirebaseDb();
  await updateDoc(doc(db, "users", uid, "jobs", docId), data);
}

export async function listJobs(uid: string, n = 20): Promise<JobRecord[]> {
  const db  = getFirebaseDb();
  const q   = query(
    collection(db, "users", uid, "jobs"),
    orderBy("createdAt", "desc"),
    limit(n)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id:        d.id,
      jobId:     data.jobId,
      url:       data.url,
      status:    data.status,
      features:  data.features ?? 0,
      name:      data.name ?? "",
      createdAt: data.createdAt?.toDate() ?? new Date(),
    };
  });
}
