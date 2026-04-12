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

const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-item-form glass-card-dark';
    const defaultStep = data.unit === 'g' ? 100 : (data.step || 1);

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
            <div class="input-group"><label>Dostępna ilość</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group"><label>Krok/Podział (np. 0.5)</label><input type="number" class="p-step" step="0.01" value="${defaultStep}" required></div>
        </div>
        <div class="input-group" style="flex-direction:row; align-items:center; gap:10px">
            <input type="checkbox" class="p-no-img" ${data.noImg?'checked':''}> <label style="margin:0">Brak zdjęcia</label>
            <input type="file" class="p-file" style="${data.noImg?'display:none':''}">
        </div>
    `;

    const unitSelect = div.querySelector('.p-unit');
    const stepInput = div.querySelector('.p-step');
    unitSelect.onchange = (e) => {
        if (e.target.value === 'g') stepInput.value = 100;
        else if (e.target.value === 'szt') stepInput.value = 1;
    };
    div.querySelector('.p-no-img').onchange = (e) => div.querySelector('.p-file').style.display = e.target.checked ? 'none' : 'block';
    return div;
};

document.getElementById('open-add-listing-btn').onclick = () => {
    isEditing = false; document.getElementById('modal-title').innerText = "Nowa oferta";
    document.getElementById('listing-form').reset();
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
            <div class="listing-header"><h3>Odbiór u: ${d.sellerName}</h3><p>📍 ${d.address} | ⏰ ${d.pickupTimes}</p></div>
            ${d.items.map(it => `<div class="product-item-list">${it.imageUrl ? `<img src="${it.imageUrl}" class="thumb">` : '🖼️'} <div><b>${it.name}</b><br><small>${it.price} zł / ${it.unit} (skok: ${it.step})</small></div></div>`).join('')}
            <div style="padding:20px; display:flex; gap:10px">
                <button class="btn-primary" onclick="openOrderModal('${id}')">🛒 Zamów</button>
                <button class="btn-secondary" onclick="authSeller('${id}', '${d.pin}')">⚙️ Panel</button>
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
    let total = 0; 
    document.querySelectorAll('.order-qty').forEach(input => {
        const qty = parseFloat(input.value || 0);
        const price = parseFloat(input.dataset.price);
        total += qty * price;
    });
    // Zaokrąglenie do 2 miejsc, by uniknąć błędów JS (np. 0.0000000004)
    document.getElementById('modal-total-price').innerText = (Math.round(total * 100) / 100).toFixed(2);
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value; const time = document.getElementById('buyerPickupTime').value;
    const items = []; document.querySelectorAll('.order-qty').forEach((input, idx) => {
        const q = parseFloat(input.value);
        if(q > 0) items.push({ name: document.querySelectorAll('.product-item-list span')[idx].innerText, qty: q });
    });
    if(!buyerName || items.length === 0) return alert("Podaj imię i wybierz produkty!");
    const refListing = doc(db, "listings", currentEditId); const snap = await getDoc(refListing);
    let res = snap.data().reservations;
    if(editingResIndex !== null) res[editingResIndex] = { buyerName, time, items };
    else res.push({ buyerName, time, items });
    await updateDoc(refListing, { reservations: res }); location.reload();
};

window.authSeller = async (id, pin) => {
    if(prompt("Podaj PIN:") !== pin) return alert("Błędny PIN");
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
            group.innerHTML = `<div class="res-group-title">📦 ${product.name}</div><div style="font-size:0.8rem; margin-bottom:8px; opacity:0.8">Sprzedano łącznie: ${tSold} ${product.unit}</div>${bRows || 'Brak zamówień'}<div class="res-total">Suma sprzedaży: ${pGrand.toFixed(2)} zł</div>`;
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