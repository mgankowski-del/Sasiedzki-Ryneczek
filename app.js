import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// KONFIGURACJA FIREBASE
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

// ZMIENNE STANU
let isEditingListing = false;
let currentEditId = null;
let editingResIndex = null;
let cachedListingData = null;

// --- FUNKCJE POMOCNICZE ---

// Obliczanie dostępności towaru (uwzględnia rezerwacje)
const getRem = (productName, total, res, ignoreIdx = null) => {
    let reserved = 0;
    res.forEach((r, idx) => {
        if (ignoreIdx !== null && idx === ignoreIdx) return;
        const item = r.items.find(i => i.name === productName);
        if (item) reserved += parseFloat(item.qty);
    });
    return Math.max(0, total - reserved);
};

// Zamykanie wszystkich modali
window.closeModals = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    isEditingListing = false;
};

// --- LOGIKA TWORZENIA OGŁOSZENIA ---

const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-item-form glass-card-dark';
    const initialStep = data.step || (data.unit === 'szt' ? 1 : 0.25);
    
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" value="${data.name || ''}" required></div>
        <div class="row">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" value="${data.price || ''}" required></div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit">
                    <option value="szt" ${data.unit==='szt'?'selected':''}>szt.</option>
                    <option value="kg" ${data.unit==='kg'?'selected':''}>kg</option>
                    <option value="g" ${data.unit==='g'?'selected':''}>g</option>
                </select>
            </div>
        </div>
        <div class="row">
            <div class="input-group"><label>Łączna ilość</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group">
                <label>Krok zamówienia</label>
                <select class="p-step">
                    <option value="0.25" ${initialStep==0.25?'selected':''}>0.25</option>
                    <option value="0.5" ${initialStep==0.5?'selected':''}>0.5</option>
                    <option value="0.75" ${initialStep==0.75?'selected':''}>0.75</option>
                    <option value="1" ${initialStep==1?'selected':''}>1.0</option>
                </select>
            </div>
        </div>
        <div class="photo-row">
            <input type="checkbox" class="p-no-img" id="chk-${Math.random()}" ${data.noImg?'checked':''}> 
            <label>Brak zdjęcia</label>
            <input type="file" class="p-file" style="${data.noImg?'display:none':''}">
        </div>
    `;

    const noImgCheck = div.querySelector('.p-no-img');
    const fileInput = div.querySelector('.p-file');
    noImgCheck.onchange = (e) => fileInput.style.display = e.target.checked ? 'none' : 'block';

    return div;
};

document.getElementById('open-add-listing-btn').onclick = () => {
    isEditingListing = false;
    document.getElementById('modal-title').innerText = "Nowa oferta";
    document.getElementById('listing-form').reset();
    document.getElementById('products-to-add').innerHTML = '';
    document.getElementById('products-to-add').appendChild(createProductFields());
    document.getElementById('add-listing-modal').classList.remove('hidden');
};

document.getElementById('add-more-items').onclick = () => {
    document.getElementById('products-to-add').appendChild(createProductFields());
};

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = "Zapisywanie...";

    const products = [];
    const productDivs = document.querySelectorAll('.product-item-form');
    
    for (let div of productDivs) {
        const noImg = div.querySelector('.p-no-img').checked;
        const file = div.querySelector('.p-file').files[0];
        let url = "";

        if (!noImg && file) {
            const refImg = ref(storage, `products/${Date.now()}_${file.name}`);
            await uploadBytes(refImg, file);
            url = await getDownloadURL(refImg);
        }

        products.push({
            name: div.querySelector('.p-name').value,
            price: parseFloat(div.querySelector('.p-price').value),
            unit: div.querySelector('.p-unit').value,
            totalQty: parseFloat(div.querySelector('.p-total').value),
            step: parseFloat(div.querySelector('.p-step').value),
            noImg,
            imageUrl: url
        });
    }

    const data = {
        sellerName: document.getElementById('sellerName').value,
        address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value,
        pin: document.getElementById('pin').value,
        items: products,
        updatedAt: new Date()
    };

    try {
        if (isEditingListing) {
            await updateDoc(doc(db, "listings", currentEditId), data);
        } else {
            data.reservations = [];
            data.createdAt = new Date();
            await addDoc(collection(db, "listings"), data);
        }
        location.reload();
    } catch (err) {
        alert("Błąd zapisu!");
        btn.disabled = false;
    }
};

// --- RENDEROWANIE LISTY OGŁOSZEŃ ---

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
                    ${it.imageUrl ? `<img src="${it.imageUrl}" class="thumb">` : '<div class="thumb" style="background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:1.5rem">📦</div>'}
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

// --- LOGIKA ZAMÓWIENIA SĄSIADA ---

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
                <button type="button" class="qty-btn" onclick="const val = Math.max(0, parseFloat(this.nextElementSibling.innerText) - ${it.step}); this.nextElementSibling.innerText = val.toFixed(2); updateSum();">-</button>
                <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}">${startVal}</span>
                <button type="button" class="qty-btn" onclick="const cur = parseFloat(this.previousElementSibling.innerText); if(cur + ${it.step} <= ${rem}) { this.previousElementSibling.innerText = (cur + ${it.step}).toFixed(2); updateSum(); } else { alert('Brak towaru!'); }">+</button>
            </div>
        `;
        container.appendChild(row);
    });

    // Autouzupełnianie z pamięci urządzenia
    if (editingResIndex === null) {
        document.getElementById('buyerName').value = localStorage.getItem('ryneczek_name') || '';
        document.getElementById('buyerPin').value = localStorage.getItem('ryneczek_pin') || '';
        if(document.getElementById('buyerName').value) lookUpOrder();
    } else {
        document.getElementById('buyerName').value = d.reservations[editingResIndex].buyerName;
        document.getElementById('buyerPin').value = d.reservations[editingResIndex].buyerPin;
        document.getElementById('buyerPickupTime').value = d.reservations[editingResIndex].time;
    }

    document.getElementById('reservation-modal').classList.remove('hidden');
    updateSum();
};

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

window.updateSum = () => {
    let total = 0;
    document.querySelectorAll('.order-qty-val').forEach(span => {
        total += parseFloat(span.innerText) * parseFloat(span.dataset.price);
    });
    document.getElementById('modal-total-price').innerText = (Math.round(total * 100) / 100).toFixed(2);
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value.trim();
    const buyerPin = document.getElementById('buyerPin').value.trim();
    const time = document.getElementById('buyerPickupTime').value;
    const items = [];
    
    document.querySelectorAll('.order-qty-val').forEach(span => {
        const q = parseFloat(span.innerText);
        if(q > 0) items.push({ name: span.dataset.name, qty: q });
    });

    if(!buyerName || buyerPin.length !== 4 || items.length === 0) return alert("Wypełnij dane i wybierz produkty!");

    localStorage.setItem('ryneczek_name', buyerName);
    localStorage.setItem('ryneczek_pin', buyerPin);

    const refListing = doc(db, "listings", currentEditId);
    const snap = await getDoc(refListing);
    let res = snap.data().reservations || [];

    if (editingResIndex !== null) {
        res[editingResIndex] = { buyerName, buyerPin, time, items };
    } else {
        res.push({ buyerName, buyerPin, time, items });
    }

    await updateDoc(refListing, { reservations: res });
    location.reload();
};

// --- PANEL ZARZĄDZANIA SPRZEDAWCY ---

window.authSeller = async (id, pin) => {
    if(prompt("Podaj PIN ogłoszenia:") !== pin) return alert("Błędny PIN!");
    currentEditId = id;
    const snap = await getDoc(doc(db, "listings", id));
    cachedListingData = snap.data();
    renderSellerView('person');
    document.getElementById('seller-modal').classList.remove('hidden');
};

const renderSellerView = (type) => {
    const container = document.getElementById('reservations-container');
    container.innerHTML = '';
    const d = cachedListingData;

    document.getElementById('view-by-person').classList.toggle('active', type === 'person');
    document.getElementById('view-by-product').classList.toggle('active', type === 'product');

    if (type === 'person') {
        d.reservations.forEach((r, idx) => {
            let pTotal = 0;
            const itemsRows = r.items.map(i => {
                const prod = d.items.find(pi => pi.name === i.name);
                const st = prod ? i.qty * prod.price : 0; pTotal += st;
                return `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>${i.name} (x${i.qty})</span> <b>${st.toFixed(2)} zł</b></div>`;
            }).join('');
            const card = document.createElement('div');
            card.className = 'res-card-ui';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                    <b style="color:var(--accent);font-size:1.1rem">👤 ${r.buyerName}</b>
                    <small style="color:#94a3b8">⏰ ${r.time}</small>
                </div>
                ${itemsRows}
                <div style="text-align:right;margin-top:10px;padding-top:10px;border-top:1px dashed #475569;font-weight:800;color:#f59e0b">Do zapłaty: ${pTotal.toFixed(2)} zł</div>
                <button onclick="openOrderModal('${currentEditId}', ${idx})" class="btn-warning-action" style="padding:8px;font-size:0.85rem;margin-top:10px;width:100%">✏️ Edytuj zamówienie sąsiada</button>
            `;
            container.appendChild(card);
        });
    } else {
        d.items.forEach(product => {
            let pGrand = 0; let tSold = 0;
            const bRows = d.reservations.map(r => {
                const f = r.items.find(i => i.name === product.name);
                if (f) { pGrand += f.qty * product.price; tSold += f.qty; return `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>${r.buyerName}</span> <b>${f.qty} ${product.unit}</b></div>`; }
                return '';
            }).join('');
            const card = document.createElement('div');
            card.className = 'res-card-ui';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                    <b style="color:var(--primary);font-size:1.1rem">📦 ${product.name}</b>
                    <small style="color:#94a3b8">Sprzedano: ${tSold.toFixed(2)}/${product.totalQty}</small>
                </div>
                ${bRows || '<div style="opacity:0.5">Brak zamówień</div>'}
                <div style="text-align:right;margin-top:10px;padding-top:10px;border-top:1px dashed #475569;font-weight:800;color:var(--accent)">Łącznie: ${pGrand.toFixed(2)} zł</div>
            `;
            container.appendChild(card);
        });
    }
};

document.getElementById('view-by-person').onclick = () => renderSellerView('person');
document.getElementById('view-by-product').onclick = () => renderSellerView('product');

document.getElementById('edit-listing-btn').onclick = async () => {
    isEditingListing = true;
    const d = cachedListingData;
    document.getElementById('sellerName').value = d.sellerName;
    document.getElementById('pickupAddress').value = d.address;
    document.getElementById('pickupTimes').value = d.pickupTimes;
    document.getElementById('pin').value = d.pin;
    
    const productsCont = document.getElementById('products-to-add');
    productsCont.innerHTML = '';
    d.items.forEach(it => productsCont.appendChild(createProductFields(it)));
    
    document.getElementById('seller-modal').classList.add('hidden');
    document.getElementById('add-listing-modal').classList.remove('hidden');
    document.getElementById('modal-title').innerText = "Modyfikuj ofertę";
};

document.getElementById('delete-listing-btn').onclick = async () => {
    if(confirm("Czy na pewno chcesz trwale usunąć to ogłoszenie i wszystkie zamówienia?")) {
        await deleteDoc(doc(db, "listings", currentEditId));
        location.reload();
    }
};

// Komenda Bash:
// git add . && git commit -m "Pelny i zoptymalizowany kod app.js z naprawami mobilnymi" && git push