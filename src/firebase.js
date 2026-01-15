// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAWJLzA4Zg-itau3I_Sc76YIgFNbj-uxCI",
  authDomain: "pinealon.firebaseapp.com",
  projectId: "pinealon",
  storageBucket: "pinealon.appspot.com",
  messagingSenderId: "494066441237",
  appId: "1:494066441237:web:d3d4ccb4858ebdc72e821c",
  measurementId: "G-R1QXMTEWJ8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, provider, db, storage };