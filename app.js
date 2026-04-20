import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

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
let messaging = null;

// Zabezpieczenie przed brakiem wsparcia powiadomień w przeglądarce
if ('Notification' in window && 'serviceWorker' in navigator) {
    try { messaging = getMessaging(app); } catch (e) { console.log("Messaging wyłączone"); }
}

let currentEditId = null;
let editingResIndex = null;
let cachedListingData = null;
let isEditingOffer = false;

// --- POWIADOMIENIA (BEZPIECZNE) ---
async function requestPermission() {
    if (!messaging || !('Notification' in window)) return; // Jeśli przeglądarka nie wspiera, pomiń
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await getToken(messaging, { vapidKey: 'nP5epfMI7IJkkq-8zvos2dLjYoVXJjYF9YwLsQ7knLk' });
            if (token) localStorage.setItem('ryneczek_push_token', token);
        }
    } catch (error) {
        console.error("Błąd powiadomień (zignorowany):", error);
    }
}

// --- AUTOSPRZĄTANIE (BEZPIECZNE) ---
const cleanupExpired = async () => {
    try {
        const now = new Date();
        const snap = await getDocs(collection(db, "listings"));
        snap.forEach(async (docSnap) => {
            const d = docSnap.data();
            if (d.expiryDate) {
                const exp = new Date(d.expiryDate);
                if (now > new Date(exp.getTime() + 24 * 60 * 60 * 1000)) await deleteDoc(doc(db, "listings", docSnap.id));
            }
        });
    } catch (error) {
        console.error("Błąd czyszczenia bazy:", error);
    }
};

// --- LOGIKA UŁAMKÓW I STANÓW (Zabezpieczona przed starymi danymi) ---
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

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

// --- FORMULARZ PRODUKTÓW ---
const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    const initialStep = data.step || (data.unit === 'szt' ? 1 : 0.25);
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" value="${data.name || ''}" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" value="${data.price || ''}" required></div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit"><option value="szt" ${data.unit==='szt'?'selected':''}>szt.</option><option value="kg" ${data.unit==='kg'?'selected':''}>kg</option><option value="g" ${data.unit==='g'?'selected':''}>g</option></select>
            </div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Łączna ilość (pula)</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group"><label>Czy można dzielić?</label>
                <select class="p-step">
                    <option value="1" ${initialStep==1?'selected':''}>Tylko w całości (1, 2, 3...)</option>
                    <option value="0.5" ${initialStep==0.5?'selected':''}>Na połówki (0.5, 1, 1.5...)</option>
                    <option value="0.25" ${initialStep==0.25?'selected':''}>Na ćwiartki (0.25, 0.5...)</option>
                </select>
            </div>
        </div>
        <input type="file" class="p-file" accept="image/*" style="margin-top:10px; border:none; background:transparent">
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
    cleanupExpired();
    document.getElementById('btn-open-add').onclick = () => {
        requestPermission();
        isEditingOffer = false;
        document.getElementById('modal-title').innerText = "Nowa oferta";
        document.getElementById('listing-form').reset();
        document.getElementById('products-to-add').innerHTML = '';
        document.getElementById('products-to-add').appendChild(createProductFields());
        document.getElementById('add-listing-modal').classList.remove('hidden');
    };
    document.getElementById('add-more-items').onclick = () => document.getElementById('products-to-add').appendChild(createProductFields());
});

// --- ZAPIS OFERTY ---
document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); btn.disabled = true;
    const products = [];
    for (const div of document.querySelectorAll('.product-form-box')) {
        const file = div.querySelector('.p-file').files[0];
        let imageUrl = div.dataset.oldUrl || "";
        if (file) {
            const sRef = ref(storage, `products/${Date.now()}_${file.name}`);
            await uploadBytes(sRef, file); imageUrl = await getDownloadURL(sRef);
        }
        products.push({
            name: div.querySelector('.p-name').value, price: parseFloat(div.querySelector('.p-price').value),
            unit: div.querySelector('.p-unit').value, totalQty: parseFloat(div.querySelector('.p-total').value),
            step: parseFloat(div.querySelector('.p-step').value), imageUrl
        });
    }
    const data = {
        sellerName: document.getElementById('sellerName').value, 
        sellerPhone: document.getElementById('sellerPhone').value,
        address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value, 
        expiryDate: document.getElementById('expiryDate').value,
        pin: document.getElementById('pin').value, items: products, 
        updatedAt: new Date(), reservations: cachedListingData?.reservations || []
    };
    if(isEditingOffer) await updateDoc(doc(db, "listings", currentEditId), data);
    else { data.createdAt = new Date(); await addDoc(collection(db, "listings"), data); }
    location.reload();
};

// --- ŁADOWANIE OGŁOSZEŃ Z ZABEZPIECZENIEM ---
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    cont.innerHTML = '';
    const now = new Date();
    
    let hasValidOffers = false;

    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.expiryDate && now > new Date(d.expiryDate)) return;
        
        hasValidOffers = true;
        const card = document.createElement('div'); card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header">
                <h3>Odbiór u: ${d.sellerName}</h3>
                <p>📍 ${d.address} | 📞 ${d.sellerPhone || 'Brak telefonu'}</p>
                <p style="margin-top: 8px; color: var(--accent); font-weight: bold; font-size: 0.95rem;">⏰ Odbiór: ${d.pickupTimes}</p>
            </div>
            ${(d.items || []).map(it => {
                const rem = getRem(it.name, it.totalQty, d.reservations || []);
                return `<div class="product-item-list"><img src="${it.imageUrl || 'https://via.placeholder.com/60?text=📦'}" class="thumb"><div style="flex:1"><b>${it.name}</b><br><small>${it.price} zł / ${it.unit}</small><br><small style="font-weight:bold; color:${rem > 0 ? '#10b981' : '#ef4444'}">Dostępne: ${Number(rem.toFixed(2))} ${it.unit}</small></div></div>`;
            }).join('')}
            <div class="card-footer">
                <button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów / Zmień</button>
                <button class="btn-manage-gear" onclick="window.authSeller('${docSnap.id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });

    if (!hasValidOffers) {
        cont.innerHTML = '<p class="status-msg">Brak ofert na Ryneczku. Dodaj pierwszą!</p>';
    }
});

// --- OKNO ZAMÓWIENIA ---
window.openOrderModal = async (id, editIdx = null) => {
    requestPermission();
    
    currentEditId = id; editingResIndex = editIdx;
    const snap = await getDoc(doc(db, "listings", id)); const d = snap.data(); cachedListingData = d;
    const container = document.getElementById('modal-order-items'); container.innerHTML = '';
    
    document.getElementById('modal-pickup-info').innerText = `(⏰ Możliwe godziny: ${d.pickupTimes})`;
    
    (d.items || []).forEach((it) => {
        const reservations = d.reservations || [];
        const rem = getRem(it.name, it.totalQty, reservations, editingResIndex);
        const startVal = (editingResIndex !== null && reservations[editIdx] && reservations[editIdx].items) 
            ? (reservations[editIdx].items.find(i => i.name === it.name)?.qty || 0) : 0;
            
        container.innerHTML += `
            <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1"><b style="display:block">${it.name}</b><small style="color:var(--accent)">Dostępne: ${Number(rem.toFixed(2))}</small></div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button type="button" class="qty-btn" style="width:36px; height:36px; background:var(--primary); border:none; border-radius:8px; color:white; font-weight:bold" onclick="const s = this.nextElementSibling; s.innerText = Number(Math.max(0, parseFloat(s.innerText) - ${it.step}).toFixed(2)); window.updateSum();">-</button>
                    <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}" style="font-weight:bold; min-width:40px; text-align:center">${Number(startVal).toString()}</span>
                    <button type="button" class="qty-btn" style="width:36px; height:36px; background:var(--primary); border:none; border-radius:8px; color:white; font-weight:bold" onclick="const s = this.previousElementSibling; if(parseFloat(s.innerText)+${it.step}<=${rem}){s.innerText=Number((parseFloat(s.innerText)+${it.step}).toFixed(2));window.updateSum();}else{alert('Brak wystarczającej ilości w puli!');}">+</button>
                </div>
            </div>`;
    });

    if (editingResIndex === null) {
        document.getElementById('buyerName').value = localStorage.getItem('ryneczek_name') || '';
        document.getElementById('buyerPhone').value = localStorage.getItem('ryneczek_phone') || '';
        document.getElementById('buyerPin').value = localStorage.getItem('ryneczek_pin') || '';
        if(document.getElementById('buyerName').value) lookUpOrder();
    } else {
        const resData = d.reservations[editIdx];
        document.getElementById('buyerName').value = resData.buyerName;
        document.getElementById('buyerPhone').value = resData.buyerPhone || '';
        document.getElementById('buyerPin').value = resData.buyerPin;
        document.getElementById('buyerPickupTime').value = resData.time || '';
    }
    document.getElementById('reservation-modal').classList.remove('hidden'); window.updateSum();
};

window.updateSum = () => {
    let total = 0; document.querySelectorAll('.order-qty-val').forEach(span => { total += parseFloat(span.innerText) * parseFloat(span.dataset.price); });
    document.getElementById('modal-total-price').innerText = total.toFixed(2);
};

const lookUpOrder = () => {
    if (!cachedListingData || !cachedListingData.reservations) return;
    const name = document.getElementById('buyerName').value.trim().toLowerCase();
    const pin = document.getElementById('buyerPin').value.trim();
    if (name.length > 2 && pin.length === 4) {
        const idx = cachedListingData.reservations.findIndex(r => r.buyerName.toLowerCase() === name && r.buyerPin === pin);
        if (idx !== -1 && editingResIndex === null) window.openOrderModal(currentEditId, idx);
    }
};
document.getElementById('buyerName').oninput = lookUpOrder;
document.getElementById('buyerPin').oninput = lookUpOrder;

// --- ZAPIS ZAMÓWIENIA ---
document.getElementById('confirm-booking-btn').onclick = async () => {
    const name = document.getElementById('buyerName').value.trim();
    const phone = document.getElementById('buyerPhone').value.trim();
    const pin = document.getElementById('buyerPin').value.trim();
    const time = document.getElementById('buyerPickupTime').value;
    const items = [];
    document.querySelectorAll('.order-qty-val').forEach(span => {
        const q = parseFloat(span.innerText); if(q > 0) items.push({ name: span.dataset.name, qty: q });
    });

    if(!name || !phone || pin.length !== 4 || items.length === 0) return alert("Uzupełnij dane kontaktowe i wybierz produkty!");
    
    localStorage.setItem('ryneczek_name', name); 
    localStorage.setItem('ryneczek_phone', phone);
    localStorage.setItem('ryneczek_pin', pin);

    const refL = doc(db, "listings", currentEditId);
    const snap = await getDoc(refL);
    let res = snap.data().reservations || [];
    const newData = { buyerName: name, buyerPhone: phone, buyerPin: pin, time, items };

    if (editingResIndex !== null) res[editingResIndex] = newData;
    else {
        const existIdx = res.findIndex(r => r.buyerName.toLowerCase() === name.toLowerCase() && r.buyerPin === pin);
        if(existIdx !== -1) res[existIdx] = newData; else res.push(newData);
    }
    await updateDoc(refL, { reservations: res }); location.reload();
};

// --- PANEL SPRZEDAWCY ---
window.authSeller = async (id, pin) => {
    const inputPin = prompt("Podaj PIN ogłoszenia:");
    if(inputPin !== pin) return alert("Błędny PIN!");
    currentEditId = id; const snap = await getDoc(doc(db, "listings", id)); cachedListingData = snap.data();
    renderSellerView('person'); document.getElementById('seller-modal').classList.remove('hidden');
};

const renderSellerView = (type) => {
    const container = document.getElementById('reservations-container');
    container.innerHTML = ''; const d = cachedListingData;
    document.getElementById('view-by-person').classList.toggle('active', type === 'person');
    document.getElementById('view-by-product').classList.toggle('active', type === 'product');

    if (type === 'person') {
        (d.reservations || []).forEach((r, idx) => {
            let pTotal = 0;
            const itemsRows = (r.items || []).map(i => {
                const prod = (d.items || []).find(pi => pi.name === i.name); const st = prod ? i.qty * prod.price : 0; pTotal += st;
                return `<div class="res-item-line"><span>${i.name} (x${i.qty})</span> <b>${st.toFixed(2)} zł</b></div>`;
            }).join('');
            container.innerHTML += `<div class="res-card-ui">
                <div class="res-card-header">
                    <div>
                        <b style="color:var(--accent); display:block;">👤 ${r.buyerName}</b>
                        <small style="color:#94a3b8">📞 ${r.buyerPhone || 'Brak numeru'}</small>
                    </div>
                    <small>⏰ ${r.time || 'Brak'}</small>
                </div>
                ${itemsRows}<div class="res-total-highlight">Do zapłaty: ${pTotal.toFixed(2)} zł</div>
                <button onclick="window.openOrderModal('${currentEditId}', ${idx})" class="btn-warning-action" style="padding:8px; font-size:0.8rem; margin-top:10px">✏️ Edytuj zamówienie sąsiada</button>
            </div>`;
        });
    } else {
        (d.items || []).forEach(product => {
            let pGrand = 0; let tSold = 0;
            const bRows = (d.reservations || []).map(r => {
                const f = (r.items || []).find(i => i.name === product.name);
                if (f) { pGrand += f.qty * product.price; tSold += f.qty; return `<div class="res-item-line"><span>👤 ${r.buyerName}</span> <b>${f.qty} ${product.unit}</b></div>`; }
                return '';
            }).join('');
            container.innerHTML += `<div class="res-card-ui">
                <div class="res-card-header"><b style="color:#a5b4fc">📦 ${product.name}</b><small>Sprzedano: ${tSold}/${product.totalQty}</small></div>
                ${bRows || '<small style="opacity:0.5">Brak zamówień</small>'}
                <div class="res-total-highlight">Suma: ${pGrand.toFixed(2)} zł</div>
            </div>`;
        });
    }
};

document.getElementById('view-by-person').onclick = () => renderSellerView('person');
document.getElementById('view-by-product').onclick = () => renderSellerView('product');

document.getElementById('btn-edit-offer').onclick = () => {
    isEditingOffer = true; const d = cachedListingData;
    document.getElementById('modal-title').innerText = "Modyfikuj ofertę";
    document.getElementById('sellerName').value = d.sellerName;
    document.getElementById('sellerPhone').value = d.sellerPhone || '';
    document.getElementById('pickupAddress').value = d.address;
    document.getElementById('pickupTimes').value = d.pickupTimes;
    document.getElementById('expiryDate').value = d.expiryDate || '';
    document.getElementById('pin').value = d.pin;
    document.getElementById('products-to-add').innerHTML = '';
    (d.items || []).forEach(it => {
        const row = createProductFields(it);
        row.dataset.oldUrl = it.imageUrl;
        document.getElementById('products-to-add').appendChild(row);
    });
    document.getElementById('seller-modal').classList.add('hidden');
    document.getElementById('add-listing-modal').classList.remove('hidden');
};

document.getElementById('btn-delete-offer').onclick = async () => {
    if(confirm("Usunąć całe ogłoszenie?")) { await deleteDoc(doc(db, "listings", currentEditId)); location.reload(); }
};