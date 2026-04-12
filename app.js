import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, arrayUnion, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

// Renderowanie listy ogłoszeń
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
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
                    ${it.imageUrl ? `<img src="${it.imageUrl}" class="thumb">` : '<div class="thumb" style="background:#eee;display:flex;align-items:center;justify-content:center">📦</div>'}
                    <div class="product-info-text">
                        <b>${it.name}</b>
                        <small>${it.price} zł / ${it.unit}</small><br>
                        <span class="stock-badge ${rem > 0 ? 'stock-ok' : 'stock-low'}">${rem > 0 ? `Dostępne: ${rem} ${it.unit}` : 'Wyprzedane'}</span>
                    </div>
                </div>`;
            }).join('')}
            <div class="card-footer">
                <button class="btn-primary-action" onclick="openOrderModal('${id}')">🛒 Zamów / Zmień</button>
                <button class="btn-manage" onclick="authSeller('${id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });
});

// OTWIERANIE OKNA ZAMÓWIENIA (NAPRAWIONY UKŁAD)
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
            <div class="order-row-info">
                <b>${it.name}</b>
                <small>Pozostało: ${rem} ${it.unit}</small>
            </div>
            <div class="qty-control">
                <button class="qty-btn" onclick="this.nextElementSibling.innerText = Math.max(0, parseFloat(this.nextElementSibling.innerText) - ${it.step}).toFixed(2); updateSum();">-</button>
                <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}">${startVal}</span>
                <button class="qty-btn" onclick="if(parseFloat(this.previousElementSibling.innerText) + ${it.step} <= ${rem}) { this.previousElementSibling.innerText = (parseFloat(this.previousElementSibling.innerText) + ${it.step}).toFixed(2); updateSum(); } else { alert('Brak towaru!'); }">+</button>
            </div>
        `;
        container.appendChild(row);
    });

    // Pamięć Imienia i PINu
    if (editingResIndex === null) {
        document.getElementById('buyerName').value = localStorage.getItem('ryneczek_name') || '';
        document.getElementById('buyerPin').value = localStorage.getItem('ryneczek_pin') || '';
        if(document.getElementById('buyerName').value) lookUpOrder();
    }

    document.getElementById('reservation-modal').classList.remove('hidden');
    updateSum();
};

window.updateSum = () => {
    let total = 0;
    document.querySelectorAll('.order-qty-val').forEach(span => {
        total += parseFloat(span.innerText) * parseFloat(span.dataset.price);
    });
    document.getElementById('modal-total-price').innerText = (Math.round(total * 100) / 100).toFixed(2);
};

// ... (reszta logiki zapisu/usuwania pozostaje bez zmian jak w poprzedniej wersji) ...

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

// Funkcja wyszukiwania po Imieniu/PINie w oknie zamówienia
const lookUpOrder = () => {
    const name = document.getElementById('buyerName').value.trim().toLowerCase();
    const pin = document.getElementById('buyerPin').value.trim();
    if (name.length > 2 && pin.length === 4) {
        const idx = cachedListingData.reservations.findIndex(r => r.buyerName.toLowerCase() === name && r.buyerPin === pin);
        if (idx !== -1 && editingResIndex === null) {
            editingResIndex = idx;
            openOrderModal(currentEditId, idx);
        }
    }
};
document.getElementById('buyerName').oninput = lookUpOrder;
document.getElementById('buyerPin').oninput = lookUpOrder;

// Potwierdzenie zamówienia
document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value.trim();
    const buyerPin = document.getElementById('buyerPin').value.trim();
    const time = document.getElementById('buyerPickupTime').value;
    const items = [];
    
    document.querySelectorAll('.order-qty-val').forEach(span => {
        const q = parseFloat(span.innerText);
        if(q > 0) items.push({ name: span.dataset.name, qty: q });
    });

    if(!buyerName || buyerPin.length !== 4 || items.length === 0) return alert("Uzupełnij dane i wybierz produkty!");

    localStorage.setItem('ryneczek_name', buyerName);
    localStorage.setItem('ryneczek_pin', buyerPin);

    const refListing = doc(db, "listings", currentEditId);
    const snap = await getDoc(refListing);
    let res = snap.data().reservations || [];

    if (editingResIndex !== null) res[editingResIndex] = { buyerName, buyerPin, time, items };
    else res.push({ buyerName, buyerPin, time, items });

    await updateDoc(refListing, { reservations: res });
    location.reload();
};