// ============================================================
// Firebase Config — Reginaldo Imóveis
// ============================================================
// ⚠️  Este arquivo contém chaves públicas do Firebase.
//     Para proteger seus dados, configure as Security Rules
//     no console Firebase (Firestore + Storage) antes de publicar.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

const firebaseConfig = {
    apiKey:            "AIzaSyAw-w_vtp8NeFKdYKxxqHDut_mZ-yc-DTo",
    authDomain:        "reginaldo-imoveis.firebaseapp.com",
    projectId:         "reginaldo-imoveis",
    storageBucket:     "reginaldo-imoveis.firebasestorage.app",
    messagingSenderId: "12188588994",
    appId:             "1:12188588994:web:2dc4238d29f7903bded45b",
    measurementId:     "G-1B0TCPE79B"
};

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);
