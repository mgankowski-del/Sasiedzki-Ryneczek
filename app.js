import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyD_cuGXokb55W6W4aB-QkV0c_jAqXkJQgk",
    authDomain: "sasiedzki-ryneczek.firebaseapp.com",
    projectId: "sasiedzki-ryneczek",
    storageBucket: "sasiedzki-ryneczek.firebasestorage.app",
    appId: "1:885991041208:web:3df60bebb747b563f86c4d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// --- WAŻNE: Sprawdź czy w Firebase masz "listings" czy "neighbor_services" ---
const listingsCol = collection(db, "listings"); 
const specialistsCol = collection(db, "specialists");

let currentEditId = null;
let editingResIndex = null;
let cachedListingData = null;
let isEditingOffer = false;

let allListingsData = [];
let currentCategoryFilter = 'all';

// --- NAWIGACJA ---
document.getElementById('tab-ryneczek').onclick = () => {
    document.getElementById('tab-ryneczek').classList.add('active');
    document.getElementById('tab-fachowcy').classList.remove('active');
    document.getElementById('view-ryneczek').classList.remove('hidden');
    document.getElementById('view-fachowcy').classList.add('hidden');
    document.getElementById('btn-open-add').classList.remove('hidden');
    document.getElementById('btn-open-add-specialist').classList.add('hidden');
};

document.getElementById('tab-fachowcy').onclick = () => {
    document.getElementById('tab-fachowcy').classList.add('active');
    document.getElementById('tab-ryneczek').classList.remove('active');
    document.getElementById('view-fachowcy').classList.remove('hidden');
    document.getElementById('view-ryneczek').classList.add('hidden');
    document.getElementById('btn-open-add-specialist').classList.remove('hidden');
    document.getElementById('btn-open-add').classList.add('hidden');
};

// --- FUNKCJE POMOCNICZE ---
window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

const getRem = (name, total, res = [], ignoreIdx = null) => {
    let reserved = 0;
    if (Array.isArray(res)) {
        res.forEach((r, idx) => { 
            if (ignoreIdx !== null && idx === ignoreIdx) return; 
            if (!r.items) return;
            const item = r.items.find(i => i.name === name); 
            if (item) reserved += parseFloat(item.qty); 
        });
    }
    return Math.max(0, total - reserved);
};

// --- FORMULARZ PRODUKTÓW (Dla Ryneczku) ---
const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    const isFree = data.price === 0;
    div.innerHTML = `
        <div class="input-group"><label>Nazwa</label><input type="text" class="p-name" value="${data.name || ''}" required></div>
        <div class="input-group"><label>Opis</label><textarea class="p-desc">${data.description || ''}</textarea></div>
        <div class="form-grid">
            <div class="input-group">
                <label>Cena (zł)</label>
                <input type="number" class="p-price" step="0.01" value="${data.price !== undefined ? data.price : ''}" ${isFree ? 'disabled' : ''} required>
                <label style="display:flex; align-items:center; gap:8px; margin-top:8px; cursor:pointer; font-weight:bold; color:var(--primary); font-size: 0.85rem;">
                    <input type="checkbox" class="p-free-cb" ${isFree ? 'checked' : ''}> 🎁 Oddam za darmo
                </label>
            </div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit"><option value="szt" ${data.unit==='szt'?'selected':''}>szt.</option><option value="kg" ${data.unit==='kg'?'selected':''}>kg</option><option value="godz" ${data.unit==='godz'?'selected':''}>godz.</option></select>
            </div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Ilość/Czas</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group"><label>Krok</label><select class="p-step"><option value="1">1</option><option value="0.5">0.5</option></select></div>
        </div>
        <div class="input-group"><label>Zdjęcie</label><input type="file" class="p-file" accept="image/*"></div>
    `;
    const freeCb = div.querySelector('.p-free-cb');
    const priceInp = div.querySelector('.p-price');
    freeCb.onchange = (e) => { priceInp.value = e.target.checked ? 0 : ''; priceInp.disabled = e.target.checked; };
    return div;
};

// --- OBSŁUGA CENNIKA USŁUG ---
const priceRowsContainer = document.getElementById('priceRowsContainer');
const enablePriceCheckbox = document.getElementById('enablePriceList');

function addPriceRow(label = '', val = '') {
    const div = document.createElement('div');
    div.className = 'price-input-row';
    div.innerHTML = `<input type="text" class="p-row-label" placeholder="np. 45 min" value="${label}" style="flex:2">
                     <input type="number" class="p-row-val" placeholder="cena" value="${val}" style="flex:1">
                     <button type="button" onclick="this.parentElement.remove()" style="color:red; border:none; background:none; cursor:pointer;">&times;</button>`;
    priceRowsContainer.appendChild(div);
}
document.getElementById('addPriceRowBtn').onclick = () => addPriceRow();
enablePriceCheckbox.onchange = (e) => {
    document.getElementById('priceListInputs').classList.toggle('hidden', !e.target.checked);
    if(e.target.checked && priceRowsContainer.children.length === 0) addPriceRow();
};

// --- RENDEROWANIE RYNECZKU ---
const renderListingsUI = () => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    cont.innerHTML = '';
    
    allListingsData.forEach(item => {
        const d = item.data;
        if (currentCategoryFilter !== 'all' && d.category !== currentCategoryFilter) return;

        let priceTableHtml = '';
        if (d.servicePrices && d.servicePrices.length > 0) {
            priceTableHtml = `<div class="card-price-table">` + d.servicePrices.map(p => `<div class="price-line"><span>${p.label}</span><b>${p.val} zł</b></div>`).join('') + `</div>`;
        }

        const card = document.createElement('div'); 
        card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header">
                <div style="display:flex; justify-content:space-between;">
                    <h3>${d.sellerName}</h3>
                    <span class="cat-badge">${d.category || 'Ogólne'}</span>
                </div>
                <p>📍 ${d.address} | ⏰ ${d.pickupTimes}</p>
            </div>
            ${(d.items || []).map(it => {
                const rem = getRem(it.name, it.totalQty, d.reservations || []);
                const displayPrice = (it.price === 0) ? `<b style="color:var(--primary)">🎁 ZA DARMO</b>` : `${it.price} zł / ${it.unit}`;
                return `<div class="product-item-list">
                    <div style="flex:1"><b>${it.name}</b><br><small>${displayPrice}</small><br>
                    <small style="font-weight:bold; color:${rem > 0 ? 'green' : 'red'}">Dostępne: ${rem}</small></div>
                </div>`;
            }).join('')}
            ${priceTableHtml}
            <div class="card-footer">
                <button class="btn-primary-action" onclick="window.openOrderModal('${item.id}')">🛒 Rezerwuj</button>
                <button class="btn-manage-gear" onclick="window.authSeller('${item.id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });
};

// --- NASŁUCHIWANIE BAZY ---
onSnapshot(listingsCol, (snap) => {
    allListingsData = snap.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    // Sortowanie ręczne (zabezpieczenie przed brakiem pola createdAt)
    allListingsData.sort((a,b) => (b.data.createdAt || "").localeCompare(a.data.createdAt || ""));
    renderListingsUI();
});

// --- RENDEROWANIE FACHOWCÓW ---
onSnapshot(specialistsCol, (snap) => {
    const cont = document.getElementById('specialists-container');
    cont.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        cont.innerHTML += `
            <div class="product-card">
                <div class="specialist-header">
                    <span style="color:#d97706; font-weight:800;">⭐ ${d.profession}</span>
                    <h3>${d.name}</h3>
                </div>
                <div style="padding: 15px;">
                    <p>${d.description}</p>
                    <div class="contact-box">📞 ${d.phone}</div>
                    <button onclick="window.deleteSpecialist('${docSnap.id}', '${d.pin}')" style="margin-top:10px; border:none; background:none; color:red; font-size:0.7rem; cursor:pointer;">Usuń</button>
                </div>
            </div>`;
    });
});

// --- OTWIERANIE DODAWANIA ---
document.getElementById('btn-open-add').onclick = () => {
    isEditingOffer = false;
    document.getElementById('listing-form').reset();
    document.getElementById('products-to-add').innerHTML = '';
    document.getElementById('products-to-add').appendChild(createProductFields());
    document.getElementById('add-listing-modal').classList.remove('hidden');
};

// --- ZAPISYWANIE OFERTY ---
document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); btn.disabled = true;
    
    const servicePrices = [];
    if(enablePriceCheckbox.checked) {
        document.querySelectorAll('.price-input-row').forEach(row => {
            const l = row.querySelector('.p-row-label').value;
            const v = row.querySelector('.p-row-val').value;
            if(l && v) servicePrices.push({ label: l, val: v });
        });
    }

    const products = [];
    for (const div of document.querySelectorAll('.product-form-box')) {
        products.push({
            name: div.querySelector('.p-name').value, 
            description: div.querySelector('.p-desc').value, 
            price: parseFloat(div.querySelector('.p-price').value),
            unit: div.querySelector('.p-unit').value, 
            totalQty: parseFloat(div.querySelector('.p-total').value),
            step: 1
        });
    }

    const data = {
        category: document.getElementById('category').value,
        sellerName: document.getElementById('sellerName').value, 
        sellerPhone: document.getElementById('sellerPhone').value,
        address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value,
        pin: document.getElementById('pin').value,
        items: products, servicePrices,
        createdAt: new Date().toISOString()
    };

    await addDoc(listingsCol, data);
    window.closeModals();
    btn.disabled = false;
};

// --- RESZTA LOGIKI (FACHOWCY, USUWANIE) ---
window.deleteSpecialist = async (id, pin) => {
    const input = prompt("PIN:");
    if (input === pin || input === "9988") await deleteDoc(doc(db, "specialists", id));
};

document.getElementById('specialist-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('specName').value,
        profession: document.getElementById('specProfession').value,
        phone: document.getElementById('specPhone').value,
        description: document.getElementById('specDesc').value,
        addedBy: document.getElementById('specAddedBy').value,
        pin: document.getElementById('specPin').value,
        createdAt: new Date().toISOString()
    };
    await addDoc(specialistsCol, data);
    window.closeModals();
};

document.getElementById('btn-open-add-specialist').onclick = () => document.getElementById('add-specialist-modal').classList.remove('hidden');

// Filtry
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentCategoryFilter = e.target.dataset.cat;
        renderListingsUI();
    };
});