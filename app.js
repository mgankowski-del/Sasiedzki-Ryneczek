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

if ('Notification' in window && 'serviceWorker' in navigator) {
    try { messaging = getMessaging(app); } catch (e) { console.log("Messaging nieobsługiwany."); }
}

let currentEditId = null;
let editingResIndex = null;
let cachedListingData = null;
let isEditingOffer = false;

async function requestPermission() {
    if (!messaging) return null;
    try {
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            // Próbujemy pobrać token (pętla 5-sekundowa dla iPhone)
            for (let i = 0; i < 5; i++) {
                const token = await getToken(messaging, { 
                    vapidKey: 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE',
                    serviceWorkerRegistration: registration 
                });
                if (token) {
                    localStorage.setItem('ryneczek_push_token', token);
                    return token;
                }
                console.log("Czekam na token...");
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } catch (error) { console.error("Błąd tokena:", error); }
    return null;
}

const cleanupExpired = async () => {
    const now = new Date();
    const snap = await getDocs(collection(db, "listings"));
    snap.forEach(async (docSnap) => {
        const d = docSnap.data();
        if (d.expiryDate && now > new Date(new Date(d.expiryDate).getTime() + 24*60*60*1000)) {
            await deleteDoc(doc(db, "listings", docSnap.id));
        }
    });
};

const getRem = (name, total, res = [], ignoreIdx = null) => {
    let reserved = 0;
    if (Array.isArray(res)) {
        res.forEach((r, idx) => {
            if (ignoreIdx !== null && idx === ignoreIdx) return;
            const item = r.items?.find(i => i.name === name);
            if (item) reserved += parseFloat(item.qty);
        });
    }
    return Math.max(0, total - reserved);
};

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

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
            <div class="input-group"><label>Łączna ilość</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group"><label>Krok</label>
                <select class="p-step">
                    <option value="1" ${initialStep==1?'selected':''}>1</option>
                    <option value="0.5" ${initialStep==0.5?'selected':''}>0.5</option>
                    <option value="0.25" ${initialStep==0.25?'selected':''}>0.25</option>
                </select>
            </div>
        </div>
        <input type="file" class="p-file" accept="image/*" style="margin-top:10px;">
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
    cleanupExpired();
    document.getElementById('btn-open-add').onclick = () => {
        isEditingOffer = false;
        document.getElementById('modal-title').innerText = "Nowa oferta";
        document.getElementById('listing-form').reset();
        document.getElementById('products-to-add').innerHTML = '';
        document.getElementById('products-to-add').appendChild(createProductFields());
        document.getElementById('add-listing-modal').classList.remove('hidden');
    };
    document.getElementById('add-more-items').onclick = () => document.getElementById('products-to-add').appendChild(createProductFields());
});

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = "Trwa publikacja...";

    // Czekamy na token - kluczowe dla iPhone
    const token = await requestPermission();

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
        sellerToken: token || localStorage.getItem('ryneczek_push_token') || "", 
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

onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    cont.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const card = document.createElement('div'); card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header">
                <h3>Odbiór u: ${d.sellerName}</h3>
                <p>📍 ${d.address} | 📞 ${d.sellerPhone || ''}</p>
                <p>⏰ ${d.pickupTimes}</p>
            </div>
            ${(d.items || []).map(it => {
                const rem = getRem(it.name, it.totalQty, d.reservations);
                return `<div class="product-item-list"><img src="${it.imageUrl || ''}" class="thumb"><div><b>${it.name}</b><br><small>${it.price} zł / ${it.unit}</small><br><small>Dostępne: ${rem}</small></div></div>`;
            }).join('')}
            <div class="card-footer">
                <button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów</button>
                <button class="btn-manage-gear" onclick="window.authSeller('${docSnap.id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });
});

window.openOrderModal = async (id, editIdx = null) => {
    currentEditId = id; editingResIndex = editIdx;
    const snap = await getDoc(doc(db, "listings", id)); const d = snap.data(); cachedListingData = d;
    const container = document.getElementById('modal-order-items'); container.innerHTML = '';
    (d.items || []).forEach((it) => {
        const rem = getRem(it.name, it.totalQty, d.reservations, editingResIndex);
        container.innerHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span>${it.name} (Dostępne: ${rem})</span>
                <div style="display:flex; align-items:center; gap:5px;">
                    <button type="button" onclick="const s = this.nextElementSibling; s.innerText = Math.max(0, parseFloat(s.innerText) - ${it.step});">-</button>
                    <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}">0</span>
                    <button type="button" onclick="const s = this.previousElementSibling; if(parseFloat(s.innerText)+${it.step}<=${rem}){s.innerText=parseFloat(s.innerText)+${it.step};}">+</button>
                </div>
            </div>`;
    });
    document.getElementById('reservation-modal').classList.remove('hidden');
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const items = [];
    document.querySelectorAll('.order-qty-val').forEach(span => {
        const q = parseFloat(span.innerText); if(q > 0) items.push({ name: span.dataset.name, qty: q });
    });
    const refL = doc(db, "listings", currentEditId);
    const snap = await getDoc(refL);
    let res = snap.data().reservations || [];
    res.push({ 
        buyerName: document.getElementById('buyerName').value, 
        buyerPhone: document.getElementById('buyerPhone').value, 
        buyerPin: document.getElementById('buyerPin').value, 
        time: document.getElementById('buyerPickupTime').value, 
        items 
    });
    await updateDoc(refL, { reservations: res }); 
    location.reload();
};

window.authSeller = async (id, pin) => {
    const inputPin = prompt("PIN:");
    if(inputPin !== pin) return;
    currentEditId = id; const snap = await getDoc(doc(db, "listings", id)); cachedListingData = snap.data();
    document.getElementById('seller-modal').classList.remove('hidden');
};