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
    console.warn("Messaging nieobsługiwany.");
}

// --- FUNKCJA KONWERTUJĄCA ZGODNA Z ARTYKUŁEM I STANDARDEM W3C ---
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

// --- KONFIGURACJA POWIADOMIEŃ ---
window.setupNotifications = async () => {
    console.log("Uruchamiam procedurę powiadomień...");
    
    if (!('serviceWorker' in navigator)) return alert("Brak obsługi Service Worker.");
    
    try {
        // 1. Rejestracja SW z wymuszonym brakiem cache
        const swPath = './firebase-messaging-sw.js?v=' + Date.now();
        const registration = await navigator.serviceWorker.register(swPath);
        
        console.log("Czekam na gotowość SW...");
        await navigator.serviceWorker.ready;

        // 2. Prośba o uprawnienia
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            return alert("Musisz zezwolić na powiadomienia w ustawieniach Safari (ikona AA lub Ustawienia -> Safari).");
        }

        // 3. Przygotowanie klucza VAPID (zgodnie z artykułem)
        const vapidPublicKey = 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE';
        const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

        // 4. Pobranie tokena
        const token = await getToken(messaging, { 
            vapidKey: convertedKey, 
            serviceWorkerRegistration: registration 
        });

        if (token) {
            localStorage.setItem('ryneczek_push_token', token);
            alert("✅ SUKCES! Powiadomienia zostały aktywowane.");
            console.log("Uzyskany token:", token);
        }
    } catch (error) {
        console.error("Szczegółowy błąd:", error);
        // Specjalna obsługa błędu znaków, żebyśmy wiedzieli gdzie dokładnie występuje
        if (error.message.includes("invalid characters")) {
            alert("Safari zgłasza błąd znaków. Spróbuj wyczyścić dane witryn w ustawieniach Safari.");
        } else {
            alert("Błąd: " + error.message);
        }
    }
};

// --- LOGIKA OFERT (STABILNA) ---
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
                <select class="p-step"><option value="1">1</option><option value="0.5">0.5</option><option value="0.1">0.1</option></select>
            </div>
        </div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
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
                    <h3>Sprzedawca: ${d.sellerName}</h3>
                    <p>📍 ${d.address} | 📞 ${d.sellerPhone}</p>
                </div>
                <div class="card-footer">
                    <button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów</button>
                    <button class="btn-manage-gear" onclick="window.authSeller('${docSnap.id}', '${d.pin}')">⚙️</button>
                </div>`;
            cont.appendChild(card);
        });
    });

    const btnOpenAdd = document.getElementById('btn-open-add');
    if (btnOpenAdd) {
        btnOpenAdd.onclick = () => {
            const container = document.getElementById('products-to-add');
            container.innerHTML = '';
            container.appendChild(createProductFields());
            document.getElementById('add-listing-modal').classList.remove('hidden');
        };
    }
});

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = "Publikowanie...";

    try {
        const products = [];
        const productBoxes = document.querySelectorAll('.product-form-box');
        
        for (const div of productBoxes) {
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
                imageUrl: imageUrl
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

        alert("Oferta opublikowana!");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("Błąd: " + err.message);
        btn.disabled = false;
        btn.innerText = "Opublikuj ofertę";
    }
};