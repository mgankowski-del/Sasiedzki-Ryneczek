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

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

// --- FORMULARZ DODAWANIA PRODUKTÓW ---
const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    const initialStep = data.step || (data.unit === 'szt' ? 1 : 0.25);
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" value="${data.name || ''}" placeholder="Np. Chleb domowy" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" value="${data.price || ''}" required></div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit">
                    <option value="szt" ${data.unit==='szt'?'selected':''}>szt.</option>
                    <option value="kg" ${data.unit==='kg'?'selected':''}>kg</option>
                    <option value="g" ${data.unit==='g'?'selected':''}>g</option>
                </select>
            </div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Łączna ilość</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group"><label>Minimum zamówienia</label>
                <select class="p-step">
                    <option value="0.25" ${initialStep==0.25?'selected':''}>0.25</option>
                    <option value="0.5" ${initialStep==0.5?'selected':''}>0.5</option>
                    <option value="0.75" ${initialStep==0.75?'selected':''}>0.75</option>
                    <option value="1" ${initialStep==1?'selected':''}>1.0</option>
                </select>
            </div>
        </div>
        <div class="photo-input-container">
            <label class="photo-label">📸 Zdjęcie produktu (opcjonalnie)</label>
            <input type="file" class="p-file" accept="image/*">
        </div>
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
    const btnOpenAdd = document.getElementById('btn-open-add');
    if(btnOpenAdd) {
        btnOpenAdd.addEventListener('click', () => {
            document.getElementById('modal-title').innerText = "Nowa oferta";
            document.getElementById('listing-form').reset();
            document.getElementById('products-to-add').innerHTML = '';
            document.getElementById('products-to-add').appendChild(createProductFields());
            document.getElementById('add-listing-modal').classList.remove('hidden');
        });
    }
    document.getElementById('add-more-items').onclick = () => document.getElementById('products-to-add').appendChild(createProductFields());
});

// --- ZAPIS OFERTY ZE ZDJĘCIAMI ---
document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = "Przesyłanie danych...";

    const products = [];
    const productDivs = document.querySelectorAll('.product-form-box');

    for (const div of productDivs) {
        const file = div.querySelector('.p-file').files[0];
        let imageUrl = "";

        if (file) {
            const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(snapshot.ref);
        }

        products.push({
            name: div.querySelector('.p-name').value,
            price: parseFloat(div.querySelector('.p-price').value),
            unit: div.querySelector('.p-unit').value,
            totalQty: parseFloat(div.querySelector('.p-total').value),
            step: parseFloat(div.querySelector('.p-step').value),
            imageUrl: imageUrl
        });
    }

    const data = {
        sellerName: document.getElementById('sellerName').value,
        address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value,
        pin: document.getElementById('pin').value,
        items: products,
        createdAt: new Date(),
        reservations: []
    };

    await addDoc(collection(db, "listings"), data);
    location.reload();
};

// --- ŁADOWANIE OGŁOSZEŃ ---
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    cont.innerHTML = snap.empty ? '<p class="status-msg">Brak aktywnych ofert.</p>' : '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header"><h3>Sprzedawca: ${d.sellerName}</h3><p>📍 ${d.address} | ⏰ ${d.pickupTimes}</p></div>
            ${d.items.map(it => {
                const rem = getRem(it.name, it.totalQty, d.reservations);
                return `<div class="product-item-list">
                    <img src="${it.imageUrl || 'https://via.placeholder.com/60?text=Brak'}" class="thumb">
                    <div style="flex:1"><b>${it.name}</b><br><small>${it.price} zł / ${it.unit}</small><br>
                    <small style="font-weight:bold; color:${rem > 0 ? '#10b981' : '#ef4444'}">Pozostało: ${rem} ${it.unit}</small></div>
                </div>`;
            }).join('')}
            <div class="card-footer" style="padding:15px; display:flex; gap:10px; background:#f8fafc">
                <button class="btn-primary-action" onclick="openOrderModal('${id}')">🛒 Zamów / Zmień</button>
                <button class="btn-manage-gear" onclick="authSeller('${id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });
});

// LOGIKA ZAMÓWIENIA (Skrócona dla czytelności, reszta jak poprzednio)
window.openOrderModal = async (id, editIdx = null) => {
    currentEditId = id; editingResIndex = editIdx;
    const snap = await getDoc(doc(db, "listings", id)); const d = snap.data(); cachedListingData = d;
    const container = document.getElementById('modal-order-items'); container.innerHTML = '';
    d.items.forEach((it) => {
        const rem = getRem(it.name, it.totalQty, d.reservations, editingResIndex);
        const startVal = (editingResIndex !== null) ? (d.reservations[editingResIndex].items.find(i => i.name === it.name)?.qty || 0) : 0;
        container.innerHTML += `
            <div class="order-row-mobile" style="background:rgba(255,255,255,0.03); padding:15px; border-radius:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1"><b style="display:block; color:white;">${it.name}</b><small style="color:var(--accent)">Dostępne: ${rem}</small></div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button type="button" class="qty-btn" style="width:40px; height:40px; background:var(--primary); border:none; border-radius:10px; color:white;" onclick="const s = this.nextElementSibling; s.innerText = Math.max(0, parseFloat(s.innerText) - ${it.step}).toFixed(2); window.updateSum();">-</button>
                    <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}" style="min-width:45px; text-align:center; font-weight:bold;">${parseFloat(startVal).toFixed(2)}</span>
                    <button type="button" class="qty-btn" style="width:40px; height:40px; background:var(--primary); border:none; border-radius:10px; color:white;" onclick="const s = this.previousElementSibling; if(parseFloat(s.innerText)+${it.step}<=${rem}){s.innerText=(parseFloat(s.innerText)+${it.step}).toFixed(2);window.updateSum();} else {alert('Brak towaru!');}">+</button>
                </div>
            </div>`;
    });
    document.getElementById('reservation-modal').classList.remove('hidden'); window.updateSum();
};

window.updateSum = () => {
    let total = 0; document.querySelectorAll('.order-qty-val').forEach(span => { total += parseFloat(span.innerText) * parseFloat(span.dataset.price); });
    document.getElementById('modal-total-price').innerText = (Math.round(total * 100) / 100).toFixed(2);
};

window.authSeller = async (id, pin) => {
    const inputPin = prompt("Podaj PIN ogłoszenia:");
    if(inputPin !== pin) return alert("Błędny PIN!");
    currentEditId = id; const snap = await getDoc(doc(db, "listings", id)); cachedListingData = snap.data();
    document.getElementById('seller-modal').classList.remove('hidden');
};