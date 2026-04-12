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

// --- ŁADOWANIE OGŁOSZEŃ ---
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    if (snap.empty) { cont.innerHTML = '<p class="status-msg">Brak ofert. Dodaj coś!</p>'; return; }

    cont.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header">
                <h3>Sprzedawca: ${d.sellerName}</h3>
                <p>📍 ${d.address} | ⏰ ${d.pickupTimes}</p>
            </div>
            ${d.items.map(it => {
                const rem = getRem(it.name, it.totalQty, d.reservations);
                return `
                <div class="product-item-list">
                    ${it.imageUrl ? `<img src="${it.imageUrl}" class="thumb">` : '<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">📦</div>'}
                    <div style="flex:1">
                        <b style="font-size:1.1rem">${it.name}</b><br>
                        <small style="color:#64748b">${it.price} zł / ${it.unit}</small><br>
                        <small style="font-weight:bold; color:${rem > 0 ? '#10b981' : '#ef4444'}">Dostępne: ${rem} ${it.unit}</small>
                    </div>
                </div>`;
            }).join('')}
            <div class="card-footer">
                <button class="btn-primary-action" onclick="openOrderModal('${id}')">🛒 Zamów / Zmień</button>
                <button class="btn-manage-small" onclick="authSeller('${id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });
});

// RESZTA LOGIKI (Modal zamówienia, PIN, updateSum itp.) pozostaje taka sama jak w poprzednim kompletnym kodzie.
// Najważniejsza zmiana to powyższy generator HTML kart, aby pasował do nowych stylów.

window.openOrderModal = async (id, editIdx = null) => {
    currentEditId = id; editingResIndex = editIdx;
    const snap = await getDoc(doc(db, "listings", id)); const d = snap.data(); cachedListingData = d;
    const container = document.getElementById('modal-order-items'); container.innerHTML = '';
    d.items.forEach((it) => {
        const rem = getRem(it.name, it.totalQty, d.reservations, editingResIndex);
        const startVal = (editingResIndex !== null) ? (d.reservations[editingResIndex].items.find(i => i.name === it.name)?.qty || 0) : 0;
        container.innerHTML += `
            <div class="order-row-mobile" style="background:rgba(255,255,255,0.03); padding:15px; border-radius:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1">
                    <b style="display:block; color:white;">${it.name}</b>
                    <small style="color:var(--accent)">Pozostało: ${rem}</small>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button type="button" class="qty-btn" style="width:40px; height:40px; background:var(--primary); border:none; border-radius:10px; color:white;" onclick="const s = this.nextElementSibling; s.innerText = Math.max(0, parseFloat(s.innerText) - ${it.step}).toFixed(2); updateSum();">-</button>
                    <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}" style="min-width:40px; text-align:center; font-weight:bold;">${parseFloat(startVal).toFixed(2)}</span>
                    <button type="button" class="qty-btn" style="width:40px; height:40px; background:var(--primary); border:none; border-radius:10px; color:white;" onclick="const s = this.previousElementSibling; if(parseFloat(s.innerText)+${it.step}<=${rem}){s.innerText=(parseFloat(s.innerText)+${it.step}).toFixed(2);updateSum();} else {alert('Brak!');}">+</button>
                </div>
            </div>`;
    });
    if (editingResIndex === null) {
        document.getElementById('buyerName').value = localStorage.getItem('ryneczek_name') || '';
        document.getElementById('buyerPin').value = localStorage.getItem('ryneczek_pin') || '';
    }
    document.getElementById('reservation-modal').classList.remove('hidden'); updateSum();
};

window.updateSum = () => {
    let total = 0; document.querySelectorAll('.order-qty-val').forEach(span => { total += parseFloat(span.innerText) * parseFloat(span.dataset.price); });
    document.getElementById('modal-total-price').innerText = (Math.round(total * 100) / 100).toFixed(2);
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const name = document.getElementById('buyerName').value.trim(); const pin = document.getElementById('buyerPin').value.trim();
    const items = []; document.querySelectorAll('.order-qty-val').forEach(span => { const q = parseFloat(span.innerText); if(q > 0) items.push({ name: span.dataset.name, qty: q }); });
    if(!name || pin.length !== 4 || items.length === 0) return alert("Błąd!");
    localStorage.setItem('ryneczek_name', name); localStorage.setItem('ryneczek_pin', pin);
    const refL = doc(db, "listings", currentEditId); const snap = await getDoc(refL); let res = snap.data().reservations || [];
    const newData = { buyerName: name, buyerPin: pin, time: document.getElementById('buyerPickupTime').value, items };
    if (editingResIndex !== null) res[editingResIndex] = newData; else res.push(newData);
    await updateDoc(refL, { reservations: res }); location.reload();
};

window.authSeller = async (id, pin) => {
    if(prompt("Podaj PIN ogłoszenia:") !== pin) return alert("Błędny PIN");
    currentEditId = id; const snap = await getDoc(doc(db, "listings", id)); cachedListingData = snap.data();
    document.getElementById('seller-modal').classList.remove('hidden');
};

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));