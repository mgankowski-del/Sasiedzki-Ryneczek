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

    if (snap.empty) {
        cont.innerHTML = '<p class="status-msg">Brak aktywnych ofert. Bądź pierwszy!</p>';
        return;
    }

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
            <div class="card-items">
                ${d.items.map(it => {
                    const rem = getRem(it.name, it.totalQty, d.reservations);
                    return `
                    <div class="product-item-list">
                        ${it.imageUrl ? `<img src="${it.imageUrl}" class="thumb">` : '<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">📦</div>'}
                        <div style="flex:1">
                            <b>${it.name}</b>
                            <small style="color:#64748b">${it.price} zł / ${it.unit}</small><br>
                            <small style="font-weight:bold; color:${rem > 0 ? '#10b981' : '#ef4444'}">Dostępne: ${rem} ${it.unit}</small>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div class="card-footer" style="padding:15px; display:flex; gap:10px; background:#f8fafc">
                <button class="btn-primary-action" style="flex:4; padding:12px;" onclick="openOrderModal('${id}')">🛒 Zamów / Zmień</button>
                <button class="btn-close-panel" style="flex:1; padding:12px; margin:0" onclick="authSeller('${id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });
}, (err) => {
    document.getElementById('listings-container').innerHTML = '<p class="status-msg">Błąd bazy danych.</p>';
});

// --- LOGIKA ZAMÓWIENIA ---
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
                <small style="color:var(--accent)">Dostępne: ${rem}</small>
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

window.updateSum = () => {
    let total = 0;
    document.querySelectorAll('.order-qty-val').forEach(span => { total += parseFloat(span.innerText) * parseFloat(span.dataset.price); });
    document.getElementById('modal-total-price').innerText = (Math.round(total * 100) / 100).toFixed(2);
};

const lookUpOrder = () => {
    const name = document.getElementById('buyerName').value.trim().toLowerCase();
    const pin = document.getElementById('buyerPin').value.trim();
    if (name.length > 2 && pin.length === 4) {
        const idx = cachedListingData.reservations.findIndex(r => r.buyerName.toLowerCase() === name && r.buyerPin === pin);
        if (idx !== -1 && editingResIndex === null) { editingResIndex = idx; openOrderModal(currentEditId, idx); }
    }
};
document.getElementById('buyerName').oninput = lookUpOrder;
document.getElementById('buyerPin').oninput = lookUpOrder;

document.getElementById('confirm-booking-btn').onclick = async () => {
    const name = document.getElementById('buyerName').value.trim();
    const pin = document.getElementById('buyerPin').value.trim();
    const items = [];
    document.querySelectorAll('.order-qty-val').forEach(span => {
        const q = parseFloat(span.innerText); if(q > 0) items.push({ name: span.dataset.name, qty: q });
    });
    if(!name || pin.length !== 4 || items.length === 0) return alert("Uzupełnij dane!");

    localStorage.setItem('ryneczek_name', name);
    localStorage.setItem('ryneczek_pin', pin);

    const refL = doc(db, "listings", currentEditId);
    const snap = await getDoc(refL);
    let res = snap.data().reservations || [];
    const newData = { buyerName: name, buyerPin: pin, time: document.getElementById('buyerPickupTime').value, items };

    if (editingResIndex !== null) res[editingResIndex] = newData;
    else res.push(newData);

    await updateDoc(refL, { reservations: res });
    location.reload();
};

// --- PANEL SPRZEDAWCY ---
window.authSeller = async (id, pin) => {
    if(prompt("Podaj PIN ogłoszenia:") !== pin) return alert("Błędny PIN");
    currentEditId = id; const snap = await getDoc(doc(db, "listings", id));
    cachedListingData = snap.data(); renderSellerView('person');
    document.getElementById('seller-modal').classList.remove('hidden');
};

const renderSellerView = (type) => {
    const container = document.getElementById('reservations-container');
    container.innerHTML = ''; const d = cachedListingData;
    document.getElementById('view-by-person').classList.toggle('active', type === 'person');
    document.getElementById('view-by-product').classList.toggle('active', type === 'product');

    if (type === 'person') {
        d.reservations.forEach((r, idx) => {
            let pTotal = 0;
            const itemsRows = r.items.map(i => {
                const prod = d.items.find(pi => pi.name === i.name);
                const st = prod ? i.qty * prod.price : 0; pTotal += st;
                return `<div style="display:flex;justify-content:space-between;font-size:0.95rem;margin-bottom:4px"><span>${i.name} (x${i.qty})</span> <b>${st.toFixed(2)} zł</b></div>`;
            }).join('');
            container.innerHTML += `<div class="order-row-mobile" style="background:rgba(255,255,255,0.05); margin-bottom:10px; border-radius:15px; padding:15px">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px"><b style="color:var(--accent)">👤 ${r.buyerName}</b><small>⏰ ${r.time}</small></div>
                ${itemsRows}
                <div style="text-align:right; border-top:1px dashed #475569; padding-top:10px; margin-top:10px; font-weight:bold; color:#f59e0b">Suma: ${pTotal.toFixed(2)} zł</div>
                <button onclick="openOrderModal('${currentEditId}', ${idx})" class="btn-warning-action" style="padding:8px; width:100%; margin-top:10px; font-size:0.8rem">✏️ Edytuj</button>
            </div>`;
        });
    } else {
        d.items.forEach(product => {
            let pGrand = 0; let tSold = 0;
            const bRows = d.reservations.map(r => {
                const f = r.items.find(i => i.name === product.name);
                if (f) { pGrand += f.qty * product.price; tSold += f.qty; return `<div style="display:flex;justify-content:space-between"><span>${r.buyerName}</span> <b>${f.qty} ${product.unit}</b></div>`; }
                return '';
            }).join('');
            container.innerHTML += `<div class="order-row-mobile" style="background:rgba(255,255,255,0.05); margin-bottom:10px; border-radius:15px; padding:15px">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px"><b style="color:var(--primary)">📦 ${product.name}</b><small>${tSold}/${product.totalQty}</small></div>
                ${bRows || 'Brak zamówień'}
                <div style="text-align:right; border-top:1px dashed #475569; padding-top:10px; margin-top:10px; font-weight:bold; color:var(--accent)">Razem: ${pGrand.toFixed(2)} zł</div>
            </div>`;
        });
    }
};

document.getElementById('view-by-person').onclick = () => renderSellerView('person');
document.getElementById('view-by-product').onclick = () => renderSellerView('product');

// --- DODAWANIE KOLEJNYCH PÓL ---
const createProductFieldsWrapper = (data = {}) => {
    document.getElementById('products-to-add').appendChild(createProductFields(data));
};

// ... reszta logiki zamykania, usuwania itp ...
window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

document.getElementById('delete-listing-btn').onclick = async () => { if(confirm("Usunąć?")) { await deleteDoc(doc(db, "listings", currentEditId)); location.reload(); } };