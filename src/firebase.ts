import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyBsCObknTIv9-3PGEr_9Ad5kB1nFU83h8g",
  authDomain:        "jerrysalestracker.firebaseapp.com",
  projectId:         "jerrysalestracker",
  storageBucket:     "jerrysalestracker.firebasestorage.app",
  messagingSenderId: "799094689058",
  appId:             "1:799094689058:web:177fe6bf867510e20fa97b",
  measurementId:     "G-RDC28YN5VV",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);