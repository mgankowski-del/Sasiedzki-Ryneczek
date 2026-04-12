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

// FUNKCJE POMOCNICZE
const getRem = (name, total, res, ignoreIdx = null) => {
    let reserved = 0;
    res.forEach((r, idx) => { if (ignoreIdx !== null && idx === ignoreIdx) return; const item = r.items.find(i => i.name === name); if (item) reserved += parseFloat(item.qty); });
    return Math.max(0, total - reserved);
};

window.closeModals = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
};

// NAPRAWA PRZYCISKU DODAWANIA
const openAddListing = () => {
    document.getElementById('modal-title').innerText = "Nowa oferta";
    document.getElementById('listing-form').reset();
    document.getElementById('products-to-add').innerHTML = '';
    document.getElementById('products-to-add').appendChild(createProductFields());
    document.getElementById('add-listing-modal').classList.remove('hidden');
};

const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-item-form';
    const initialStep = data.step || (data.unit === 'szt' ? 1 : 0.25);
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" value="${data.name || ''}" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" value="${data.price || ''}" required></div>
            <div class="input-group"><label>Jednostka</label><select class="p-unit"><option value="szt" ${data.unit==='szt'?'selected':''}>szt.</option><option value="kg" ${data.unit==='kg'?'selected':''}>kg</option><option value="g" ${data.unit==='g'?'selected':''}>g</option></select></div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Łączna ilość</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group"><label>Krok zamówienia</label><select class="p-step"><option value="0.25" ${initialStep==0.25?'selected':''}>0.25</option><option value="0.5" ${initialStep==0.5?'selected':''}>0.5</option><option value="0.75" ${initialStep==0.75?'selected':''}>0.75</option><option value="1" ${initialStep==1?'selected':''}>1.0</option></select></div>
        </div>
    `;
    return div;
};

// PODPIĘCIE ZDARZEŃ PO ZAŁADOWANIU DOM
document.addEventListener('DOMContentLoaded', () => {
    const btnAdd = document.getElementById('btn-open-add');
    if (btnAdd) btnAdd.onclick = openAddListing;

    document.getElementById('add-more-items').onclick = () => {
        document.getElementById('products-to-add').appendChild(createProductFields());
    };

    // Zamykanie przyciskami "Anuluj"
    document.getElementById('close-add-modal').onclick = window.closeModals;
    document.getElementById('close-res-modal').onclick = window.closeModals;
    document.getElementById('close-seller-modal').onclick = window.closeModals;
});

// ŁADOWANIE OGŁOSZEŃ
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    cont.innerHTML = snap.empty ? '<p class="status-msg">Brak ofert.</p>' : '';
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
                    <div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">📦</div>
                    <div style="flex:1"><b>${it.name}</b><br><small>${it.price} zł / ${it.unit}</small><br>
                    <small style="font-weight:bold; color:${rem > 0 ? '#10b981' : '#ef4444'}">Dostępne: ${rem} ${it.unit}</small></div>
                </div>`;
            }).join('')}
            <div class="card-footer">
                <button class="btn-primary-action" onclick="openOrderModal('${id}')">🛒 Zamów / Zmień</button>
                <button class="btn-manage-gear" onclick="authSeller('${id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });
});

// LOGIKA ZAMÓWIENIA
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
                    <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}" style="min-width:40px; text-align:center; font-weight:bold;">${parseFloat(startVal).toFixed(2)}</span>
                    <button type="button" class="qty-btn" style="width:40px; height:40px; background:var(--primary); border:none; border-radius:10px; color:white;" onclick="const s = this.previousElementSibling; if(parseFloat(s.innerText)+${it.step}<=${rem}){s.innerText=(parseFloat(s.innerText)+${it.step}).toFixed(2);window.updateSum();} else {alert('Brak!');}">+</button>
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
    if(inputPin !== pin) return alert("Błędny PIN");
    currentEditId = id; const snap = await getDoc(doc(db, "listings", id)); cachedListingData = snap.data();
    renderSellerView('person'); document.getElementById('seller-modal').classList.remove('hidden');
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
                const prod = d.items.find(pi => pi.name === i.name); const st = prod ? i.qty * prod.price : 0; pTotal += st;
                return `<div class="buyer-line"><span>${i.name} (x${i.qty})</span> <b>${st.toFixed(2)} zł</b></div>`;
            }).join('');
            container.innerHTML += `<div class="res-product-row">
                <div class="res-product-header"><span class="res-name">👤 ${r.buyerName}</span><small>⏰ ${r.time}</small></div>
                ${itemsRows}<div class="res-total-line">Suma: ${pTotal.toFixed(2)} zł</div>
                <button onclick="openOrderModal('${currentEditId}', ${idx})" class="btn-warning-action" style="padding:8px; margin-top:10px; font-size:0.85rem">✏️ Edytuj</button>
            </div>`;
        });
    } else {
        d.items.forEach(product => {
            let pGrand = 0; let tSold = 0;
            const bRows = d.reservations.map(r => {
                const f = r.items.find(i => i.name === product.name);
                if (f) { pGrand += f.qty * product.price; tSold += f.qty; return `<div class="buyer-line"><span>👤 ${r.buyerName}</span> <b>${f.qty} ${product.unit}</b></div>`; }
                return '';
            }).join('');
            container.innerHTML += `<div class="res-product-row">
                <div class="res-product-header"><span class="res-name">📦 ${product.name}</span><span class="res-sold">Sprzedano: ${tSold}/${product.totalQty}</span></div>
                ${bRows || '<div style="opacity:0.5; font-size:0.85rem">Brak zamówień</div>'}
                <div class="res-total-line">Razem: ${pGrand.toFixed(2)} zł</div>
            </div>`;
        });
    }
};

document.getElementById('view-by-person').onclick = () => renderSellerView('person');
document.getElementById('view-by-product').onclick = () => renderSellerView('product');

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); btn.disabled = true;
    const products = [];
    document.querySelectorAll('.product-item-form').forEach(div => {
        products.push({
            name: div.querySelector('.p-name').value,
            price: parseFloat(div.querySelector('.p-price').value),
            unit: div.querySelector('.p-unit').value,
            totalQty: parseFloat(div.querySelector('.p-total').value),
            step: parseFloat(div.querySelector('.p-step').value)
        });
    });
    const data = {
        sellerName: document.getElementById('sellerName').value,
        address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value,
        pin: document.getElementById('pin').value,
        items: products, createdAt: new Date(), reservations: []
    };
    await addDoc(collection(db, "listings"), data);
    location.reload();
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const name = document.getElementById('buyerName').value.trim();
    const pin = document.getElementById('buyerPin').value.trim();
    const items = [];
    document.querySelectorAll('.order-qty-val').forEach(span => {
        const q = parseFloat(span.innerText); if(q > 0) items.push({ name: span.dataset.name, qty: q });
    });
    if(!name || pin.length !== 4 || items.length === 0) return alert("Uzupełnij dane!");
    const refL = doc(db, "listings", currentEditId);
    const snap = await getDoc(refL);
    let res = snap.data().reservations || [];
    const newData = { buyerName: name, buyerPin: pin, time: document.getElementById('buyerPickupTime').value, items };
    if (editingResIndex !== null) res[editingResIndex] = newData; else res.push(newData);
    await updateDoc(refL, { reservations: res });
    location.reload();
};

document.getElementById('delete-listing-btn').onclick = async () => { if(confirm("Usunąć?")) { await deleteDoc(doc(db, "listings", currentEditId)); location.reload(); } };