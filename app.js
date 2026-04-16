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
try { messaging = getMessaging(app); } catch (e) {}

// POPRAWIONA FUNKCJA KONWERSJI KLUCZA VAPID
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')    // Zamień minusy na plusy
        .replace(/_/g, '/');    // Zamień podkreślenia na ukośniki

    try {
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    } catch (err) {
        console.error("Błąd dekodowania Base64:", err);
        return null;
    }
}

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

window.setupNotifications = async () => {
    if (!('serviceWorker' in navigator)) return alert("Brak obsługi Service Worker.");
    
    try {
        const swPath = './firebase-messaging-sw.js?v=' + Date.now();
        const registration = await navigator.serviceWorker.register(swPath, { scope: './' });
        
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return alert("Zezwól na powiadomienia w ustawieniach.");

        const vapidKey = 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE';
        const convertedVapidKey = urlBase64ToUint8Array(vapidKey);

        if (!convertedVapidKey) throw new Error("Nie udało się przygotować klucza bezpieczeństwa.");

        const token = await getToken(messaging, { 
            vapidKey: convertedVapidKey, 
            serviceWorkerRegistration: registration 
        });

        if (token) {
            localStorage.setItem('ryneczek_push_token', token);
            alert("✅ Sukces! Powiadomienia aktywne.");
        }
    } catch (error) {
        console.error(error);
        alert("Błąd: " + error.message);
    }
};

// --- STABILNY KOD RESZTY APLIKACJI ---
const createProductFields = () => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" required></div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit"><option value="szt">szt.</option><option value="kg">kg</option></select>
            </div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Pula</label><input type="number" class="p-total" step="0.01" required></div>
            <div class="input-group"><label>Krok</label>
                <select class="p-step"><option value="1">1</option><option value="0.5">0.5</option><option value="100">100g</option></select>
            </div>
        </div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
    onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
        const cont = document.getElementById('listings-container');
        if (cont) {
            cont.innerHTML = '';
            snap.forEach(docSnap => {
                const d = docSnap.data();
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `<div class="listing-header"><h3>U: ${d.sellerName}</h3><p>📍 ${d.address} | 📞 ${d.sellerPhone}</p></div>
                <div class="card-footer">
                    <button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów</button>
                    <button class="btn-manage-gear" onclick="window.authSeller('${docSnap.id}', '${d.pin}')">⚙️</button>
                </div>`;
                cont.appendChild(card);
            });
        }
    });

    const btnOpen = document.getElementById('btn-open-add');
    if (btnOpen) {
        btnOpen.onclick = () => {
            document.getElementById('products-to-add').innerHTML = '';
            document.getElementById('products-to-add').appendChild(createProductFields());
            document.getElementById('add-listing-modal').classList.remove('hidden');
        };
    }
});

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.innerText = "Publikuję...";
    try {
        const products = [];
        for (const div of document.querySelectorAll('.product-form-box')) {
            const file = div.querySelector('.p-file').files[0];
            let imageUrl = "";
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
        await addDoc(collection(db, "listings"), {
            sellerName: document.getElementById('sellerName').value,
            sellerPhone: document.getElementById('sellerPhone').value,
            sellerToken: localStorage.getItem('ryneczek_push_token') || "",
            address: document.getElementById('pickupAddress').value,
            pickupTimes: document.getElementById('pickupTimes').value,
            expiryDate: document.getElementById('expiryDate').value,
            pin: document.getElementById('pin').value,
            items: products,
            createdAt: new Date(),
            reservations: []
        });
        location.reload();
    } catch (err) { alert(err.message); btn.innerText = "Publikuj"; }
};