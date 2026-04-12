import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyD_cuGXokb55W6W4aB-QkV0c_jAqXkJQgk",
    authDomain: "sasiedzki-ryneczek.firebaseapp.com",
    projectId: "sasiedzki-ryneczek",
    storageBucket: "sasiedzki-ryneczek.firebasestorage.app",
    messagingSenderId: "885991041208",
    appId: "1:885991041208:web:3df60bebb747b563f86c4d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let currentEditId = null;
let editingResIndex = null;
let cachedListingData = null;

const getRem = (name, total, res, ignoreIdx = null) => {
    let reserved = 0;
    res.forEach((r, idx) => { if (ignoreIdx !== null && idx === ignoreIdx) return; const item = r.items.find(i => i.name === name); if (item) reserved += parseFloat(item.qty); });
    return Math.max(0, total - reserved);
};

// OTWIERANIE MODALA ZAMÓWIENIA
window.openOrderModal = async (id, editIdx = null) => {
    currentEditId = id;
    editingResIndex = editIdx;
    const snap = await getDoc(doc(db, "listings", id));
    const d = snap.data();
    cachedListingData = d;
    
    const container = document.getElementById('modal-order-items');
    container.innerHTML = '';
    
    d.items.forEach((it) => {
        const rem = getRem(it.name, it.totalQty, d.reservations, editingResIndex);
        const startVal = (editingResIndex !== null) ? (d.reservations[editingResIndex].items.find(i => i.name === it.name)?.qty || 0) : 0;
        
        const row = document.createElement('div');
        row.className = 'order-row-mobile';
        row.innerHTML = `
            <div style="flex:1">
                <b style="font-size:1.1rem; display:block; color:white;">${it.name}</b>
                <small style="color:var(--accent)">Pozostało: ${rem} ${it.unit}</small>
            </div>
            <div class="qty-control">
                <button type="button" class="qty-btn" onclick="const s = this.nextElementSibling; s.innerText = Math.max(0, parseFloat(s.innerText) - ${it.step}).toFixed(2); updateSum();">-</button>
                <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}">${parseFloat(startVal).toFixed(2)}</span>
                <button type="button" class="qty-btn" onclick="const s = this.previousElementSibling; if(parseFloat(s.innerText) + ${it.step} <= ${rem}) { s.innerText = (parseFloat(s.innerText) + ${it.step}).toFixed(2); updateSum(); } else { alert('Brak towaru!'); }">+</button>
            </div>
        `;
        container.appendChild(row);
    });

    if (editingResIndex === null) {
        document.getElementById('buyerName').value = localStorage.getItem('ryneczek_name') || '';
        document.getElementById('buyerPin').value = localStorage.getItem('ryneczek_pin') || '';
        if(document.getElementById('buyerName').value) lookUpOrder();
    }
    document.getElementById('reservation-modal').classList.remove('hidden');
    updateSum();
};

// RESZTA KODU (Firebase, Panel Sprzedawcy itp.) pozostaje taka sama jak poprzednio, 
// ale upewnij się, że używasz tego app.js, aby style pasowały do nazw klas.
// Ze względu na oszczędność miejsca wklejam tylko kluczowe zmiany.

// ... (Zawsze pamiętaj o updateSum i Firebase Save) ...

window.updateSum = () => {
    let total = 0;
    document.querySelectorAll('.order-qty-val').forEach(span => {
        total += parseFloat(span.innerText) * parseFloat(span.dataset.price);
    });
    document.getElementById('modal-total-price').innerText = (Math.round(total * 100) / 100).toFixed(2);
};

// ... (Dodawanie produktów, obsługa PINu itp. jak w poprzednim komplecie) ...

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

// --- (Na końcu upewnij się, że Firebase config i OnSnapshot są obecne) ---