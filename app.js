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

try {
    messaging = getMessaging(app);
} catch (e) {
    console.log("FCM nieobsługiwane");
}

// Funkcja pomocnicza dla iOS
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function requestPermission() {
    if (!messaging) return null;
    try {
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            // KLUCZ VAPID - czysty, bez żadnych dodatków
            const vapidKey = 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE';
            
            // Próbujemy standardowo przez SDK Firebase
            return await getToken(messaging, { 
                vapidKey: vapidKey, 
                serviceWorkerRegistration: registration 
            });
        }
    } catch (error) { 
        console.error("Błąd pobierania tokena:", error);
    }
    return null;
}

let currentEditId = null;
let editingResIndex = null;
let cachedListingData = null;
let isEditingOffer = false;

document.addEventListener('DOMContentLoaded', () => {
    const btnOpenAdd = document.getElementById('btn-open-add');
    if (btnOpenAdd) {
        btnOpenAdd.onclick = () => {
            isEditingOffer = false;
            document.getElementById('modal-title').innerText = "Nowa oferta";
            document.getElementById('listing-form').reset();
            document.getElementById('products-to-add').innerHTML = '';
            document.getElementById('products-to-add').appendChild(createProductFields());
            document.getElementById('add-listing-modal').classList.remove('hidden');
        };
    }
    document.getElementById('add-more-items').onclick = () => {
        document.getElementById('products-to-add').appendChild(createProductFields());
    };
});

const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    const initialStep = data.step || (data.unit === 'szt' ? 1 : 0.5);
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" value="${data.name || ''}" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" value="${data.price || ''}" required></div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit"><option value="szt" ${data.unit==='szt'?'selected':''}>szt.</option><option value="kg" ${data.unit==='kg'?'selected':''}>kg</option></select>
            </div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Ilość całkowita</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
            <div class="input-group"><label>Krok</label>
                <select class="p-step">
                    <option value="1" ${initialStep==1?'selected':''}>1</option>
                    <option value="0.5" ${initialStep==0.5?'selected':''}>0.5</option>
                </select>
            </div>
        </div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); 
    btn.disabled = true;
    btn.innerText = "Trwa publikacja...";

    // Próba pobrania tokena
    const token = await requestPermission();

    const products = [];
    for (const div of document.querySelectorAll('.product-form-box')) {
        const file = div.querySelector('.p-file').files[0];
        let imageUrl = div.dataset.oldUrl || "";
        if (file) {
            const sRef = ref(storage, `products/${Date.now()}_${file.name}`);
            await uploadBytes(sRef, file); 
            imageUrl = await getDownloadURL(sRef);
        }
        products.push({
            name: div.querySelector('.p-name').value, 
            price: parseFloat(div.querySelector('.p-price').value),
            unit: div.querySelector('.p-unit').value, 
            totalQty: parseFloat(div.querySelector('.p-total').value),
            step: parseFloat(div.querySelector('.p-step').value), 
            imageUrl
        });
    }

    const data = {
        sellerName: document.getElementById('sellerName').value, 
        sellerPhone: document.getElementById('sellerPhone').value,
        sellerToken: token || "", 
        address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value, 
        expiryDate: document.getElementById('expiryDate').value,
        pin: document.getElementById('pin').value, 
        items: products, 
        updatedAt: new Date(), 
        reservations: cachedListingData?.reservations || []
    };

    if(isEditingOffer) await updateDoc(doc(db, "listings", currentEditId), data);
    else { 
        data.createdAt = new Date(); 
        await addDoc(collection(db, "listings"), data); 
    }
    location.reload();
};

onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    cont.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const card = document.createElement('div'); 
        card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header">
                <h3>Odbiór u: ${d.sellerName}</h3>
                <p>📍 ${d.address} | 📞 ${d.sellerPhone || ''}</p>
                <p>⏰ ${d.pickupTimes}</p>
            </div>
            <div class="card-footer">
                <button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów</button>
                <button class="btn-manage-gear" onclick="window.authSeller('${docSnap.id}', '${d.pin}')">⚙️</button>
            </div>
        `;
        cont.appendChild(card);
    });
});