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

let isEditing = false;
let currentEditId = null;
let editingResIndex = null;
let cachedListingData = null;

const getRem = (name, total, res) => {
    let reserved = 0;
    res.forEach(r => {
        const item = r.items.find(i => i.name === name);
        if (item) reserved += item.qty;
    });
    return Math.max(0, total - reserved);
};

const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-item-form glass-card-dark';
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
                <label>Krok/Podział</label>
                <select class="p-step">
                    <option value="0.25" ${data.step==0.25?'selected':''}>0.25</option>
                    <option value="0.5" ${data.step==0.5?'selected':''}>0.5</option>
                    <option value="0.75" ${data.step==0.75?'selected':''}>0.75</option>
                    <option value="1" ${(!data.step || data.step==1)?'selected':''}>1.0</option>
                </select>
            </div>
        </div>
        <div class="photo-row">
            <input type="checkbox" class="p-no-img" id="chk-${Math.random()}" ${data.noImg?'checked':''}> 
            <label for="chk-${Math.random()}">Brak zdjęcia</label>
            <input type="file" class="p-file" style="${data.noImg?'display:none':''}">
        </div>
    `;
    div.querySelector('.p-no-img').onchange = (e) => div.querySelector('.p-file').style.display = e.target.checked ? 'none' : 'block';
    return div;
};

document.getElementById('open-add-listing-btn').onclick = () => {
    isEditing = false; document.getElementById('modal-title').innerText = "Nowa oferta";
    document.getElementById('products-to-add').innerHTML = '';
    document.getElementById('products-to-add').appendChild(createProductFields());
    document.getElementById('add-listing-modal').classList.remove('hidden');
};

document.getElementById('add-more-items').onclick = () => document.getElementById('products-to-add').appendChild(createProductFields());

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); btn.disabled = true;
    const products = [];
    for (let div of document.querySelectorAll('.product-item-form')) {
        const noImg = div.querySelector('.p-no-img').checked;
        const file = div.querySelector('.p-file').files[0];
        let url = "";
        if (!noImg && file) {
            const refImg = ref(storage, `products/${Date.now()}_${file.name}`);
            await uploadBytes(refImg, file); url = await getDownloadURL(refImg);
        }
        products.push({
            name: div.querySelector('.p-name').value,
            price: parseFloat(div.querySelector('.p-price').value),
            unit: div.querySelector('.p-unit').value,
            totalQty: parseFloat(div.querySelector('.p-total').value),
            step: parseFloat(div.querySelector('.p-step').value),
            noImg, imageUrl: url
        });
    }
    const data = {
        sellerName: document.getElementById('sellerName').value,
        address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value,
        pin: document.getElementById('pin').value,
        items: products, updatedAt: new Date()
    };
    if (isEditing) await updateDoc(doc(db, "listings", currentEditId), data);
    else { data.reservations = []; data.createdAt = new Date(); await addDoc(collection(db, "listings"), data); }
    location.reload();
};

onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container'); cont.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data(); const id = docSnap.id;
        const card = document.createElement('div'); card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header"><h3>Sprzedawca: ${d.sellerName}</h3><p>📍 ${d.address} | ⏰ ${d.pickupTimes}</p></div>
            ${d.items.map(it => {
                const rem = getRem(it.name, it.totalQty, d.reservations);
                return `
                <div class="product-item-list">
                    ${it.imageUrl ? `<img src="${it.imageUrl}" class="thumb">` : '🖼️'} 
                    <div style="flex:1">
                        <b>${it.name}</b><br>
                        <small style="color:#64748b">Cena: ${it.price} zł / ${it.unit} | Krok: ${it.step}</small><br>
                        <small style="font-weight:bold; color:${rem > 0 ? '#10b981' : '#ef4444'}">Dostępne: ${rem} ${it.unit}</small>
                    </div>
                </div>`;
            }).join('')}
            <div class="card-footer">
                <button class="btn-primary" onclick="openOrderModal('${id}')">🛒 Zamów / Zmień</button>
                <button class="btn-manage" onclick="authSeller('${id}', '${d.pin}')">⚙️ Panel</button>
            </div>
        `;
        cont.appendChild(card);
    });
});

window.openOrderModal = async (id, editIdx = null) => {
    currentEditId = id; editingResIndex = editIdx;
    const snap = await getDoc(doc(db, "listings", id)); const d = snap.data();
    const container = document.getElementById('modal-order-items'); container.innerHTML = '';
    
    d.items.forEach((it) => {
        const row = document.createElement('div'); row.className = 'product-item-list';
        const startVal = (editIdx !== null) ? (d.reservations[editIdx].items.find(i => i.name === it.name)?.qty || 0) : 0;
        row.innerHTML = `
            <span style="flex:1">${it.name}</span>
            <div class="qty-control">
                <button class="qty-btn" onclick="this.nextElementSibling.stepDown(); updateSum()">-</button>
                <input type="number" class="order-qty" data-price="${it.price}" step="${it.step}" value="${startVal}" min="0" onchange="updateSum()" readonly>
                <button class="qty-btn" onclick="this.previousElementSibling.stepUp(); updateSum()">+</button>
            </div>
        `;
        container.appendChild(row);
    });
    document.getElementById('reservation-modal').classList.remove('hidden');
    updateSum();
};

window.updateSum = () => {
    let total = 0; document.querySelectorAll('.order-qty').forEach(i => total += parseFloat(i.value || 0) * parseFloat(i.dataset.price));
    document.getElementById('modal-total-price').innerText = (Math.round(total * 100) / 100).toFixed(2);
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value.trim(); 
    const buyerPin = document.getElementById('buyerPin').value.trim();
    const time = document.getElementById('buyerPickupTime').value;
    const items = []; 
    document.querySelectorAll('.order-qty').forEach((input, idx) => {
        const q = parseFloat(input.value);
        if(q > 0) items.push({ name: document.querySelectorAll('.product-item-list span')[idx].innerText, qty: q });
    });

    if(!buyerName || !buyerPin || items.length === 0) return alert("Wypełnij imię, PIN i wybierz produkty!");

    const refListing = doc(db, "listings", currentEditId); 
    const snap = await getDoc(refListing);
    let res = snap.data().reservations;

    // LOGIKA ODSZUKIWANIA / ZMIANY ZAMÓWIENIA
    const existingIndex = res.findIndex(r => r.buyerName.toLowerCase() === buyerName.toLowerCase());
    
    if (existingIndex !== -1 && editingResIndex === null) {
        if (res[existingIndex].buyerPin !== buyerPin) {
            return alert("To imię jest już zajęte. Jeśli to Twoje zamówienie – podaj poprawny PIN. Jeśli nie – użyj innego imienia (np. dodaj nazwisko).");
        }
        if (!confirm("Odnaleziono Twoje zamówienie. Czy chcesz zapisać nową wersję?")) return;
        res[existingIndex] = { buyerName, buyerPin, time, items };
    } else if (editingResIndex !== null) {
        // Zmiana z poziomu Panelu Sprzedawcy (on ma PIN ogłoszenia, więc może)
        res[editingResIndex] = { buyerName, buyerPin: res[editingResIndex].buyerPin, time, items };
    } else {
        res.push({ buyerName, buyerPin, time, items });
    }

    await updateDoc(refListing, { reservations: res }); location.reload();
};

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
                return `<div class="res-sub-item"><span>${i.name} (${i.qty})</span> <b>${st.toFixed(2)} zł</b></div>`;
            }).join('');
            const group = document.createElement('div'); group.className = 'res-group';
            group.innerHTML = `<div class="res-group-title">👤 ${r.buyerName}</div><div style="font-size:0.8rem; margin-bottom:8px; opacity:0.8">⏰ ${r.time}</div>${itemsRows}<div class="res-total">Do zapłaty: ${pTotal.toFixed(2)} zł</div><button onclick="openOrderModal('${currentEditId}', ${idx})" style="background:#f59e0b; color:white; border:none; border-radius:5px; padding:6px; margin-top:10px; cursor:pointer; font-size:0.8rem">Edytuj zamówienie</button>`;
            container.appendChild(group);
        });
    } else {
        d.items.forEach(product => {
            let pGrand = 0; let tSold = 0;
            const bRows = d.reservations.map(r => {
                const f = r.items.find(i => i.name === product.name);
                if (f) { pGrand += f.qty * product.price; tSold += f.qty; return `<div class="res-sub-item"><span>${r.buyerName}</span> <b>${f.qty} ${product.unit}</b></div>`; }
                return '';
            }).join('');
            const group = document.createElement('div'); group.className = 'res-group';
            group.innerHTML = `<div class="res-group-title">📦 ${product.name}</div><div style="font-size:0.8rem; margin-bottom:8px; opacity:0.8">Sprzedano łącznie: ${tSold} ${product.unit} / ${product.totalQty}</div>${bRows || 'Brak zamówień'}<div class="res-total">Wartość sprzedaży: ${pGrand.toFixed(2)} zł</div>`;
            container.appendChild(group);
        });
    }
};

document.getElementById('view-by-person').onclick = () => renderSellerView('person');
document.getElementById('view-by-product').onclick = () => renderSellerView('product');

document.getElementById('edit-listing-btn').onclick = async () => {
    isEditing = true; const d = cachedListingData;
    document.getElementById('sellerName').value = d.sellerName;
    document.getElementById('pickupAddress').value = d.address;
    document.getElementById('pickupTimes').value = d.pickupTimes;
    document.getElementById('pin').value = d.pin;
    const productsCont = document.getElementById('products-to-add'); productsCont.innerHTML = '';
    d.items.forEach(it => productsCont.appendChild(createProductFields(it)));
    document.getElementById('seller-modal').classList.add('hidden');
    document.getElementById('add-listing-modal').classList.remove('hidden');
    document.getElementById('modal-title').innerText = "Modyfikuj ofertę";
};

document.getElementById('delete-listing-btn').onclick = async () => {
    if(confirm("Usunąć?")) { await deleteDoc(doc(db, "listings", currentEditId)); location.reload(); }
};

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));