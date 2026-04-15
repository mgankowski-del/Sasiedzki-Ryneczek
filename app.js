import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

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
const messaging = getMessaging(app);

let currentEditId = null;
let editingResIndex = null;
let cachedListingData = null;

// --- POWIADOMIENIA ---
async function requestPermission() {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        const token = await getToken(messaging, { vapidKey: 'nP5epfMI7IJkkq-8zvos2dLjYoVXJjYF9YwLsQ7knLk' });
        if (token) localStorage.setItem('ryneczek_push_token', token);
    }
}

// --- AUTOSPRZĄTANIE (24h po wygaśnięciu) ---
const cleanupExpired = async () => {
    const now = new Date();
    const snap = await getDocs(collection(db, "listings"));
    snap.forEach(async (docSnap) => {
        const d = docSnap.data();
        if (d.expiryDate) {
            const exp = new Date(d.expiryDate);
            if (now > new Date(exp.getTime() + 24 * 60 * 60 * 1000)) await deleteDoc(doc(db, "listings", docSnap.id));
        }
    });
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
            <div class="input-group"><label>Łączna ilość</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group"><label>Minimum zamówienia</label>
                <select class="p-step"><option value="0.25" ${initialStep==0.25?'selected':''}>0.25</option><option value="0.5" ${initialStep==0.5?'selected':''}>0.5</option><option value="0.75" ${initialStep==0.75?'selected':''}>0.75</option><option value="1" ${initialStep==1?'selected':''}>1.0</option></select>
            </div>
        </div>
        <input type="file" class="p-file" accept="image/*" style="margin-top:10px; border:none; background:transparent">
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
    cleanupExpired();
    requestPermission();
    document.getElementById('btn-open-add').onclick = () => {
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
        let imageUrl = "";
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
        sellerName: document.getElementById('sellerName').value, address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value, expiryDate: document.getElementById('expiryDate').value,
        pin: document.getElementById('pin').value, items: products, createdAt: new Date(), reservations: []
    };
    await addDoc(collection(db, "listings"), data);
    location.reload();
};

// --- ŁADOWANIE ---
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    cont.innerHTML = '';
    const now = new Date();
    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.expiryDate && now > new Date(d.expiryDate)) return;
        const card = document.createElement('div'); card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header"><h3>Odbiór u: ${d.sellerName}</h3><p>📍 ${d.address}</p></div>
            ${d.items.map(it => `<div class="product-item-list"><img src="${it.imageUrl || 'https://via.placeholder.com/60'}" class="thumb"><div style="flex:1"><b>${it.name}</b><br><small>${it.price} zł / ${it.unit}</small></div></div>`).join('')}
            <div style="padding:15px"><button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów</button></div>
        `;
        cont.appendChild(card);
    });
});