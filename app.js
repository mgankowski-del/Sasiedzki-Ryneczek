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

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

// --- KONFIGURACJA POWIADOMIEŃ (WERSJA BEZ DEKODOWANIA - OMIJA BŁĄD INVALID CHARACTERS) ---
window.setupNotifications = async () => {
    if (!('serviceWorker' in navigator)) return alert("Brak obsługi Service Worker.");
    
    try {
        const swPath = './firebase-messaging-sw.js?v=' + Date.now();
        const registration = await navigator.serviceWorker.register(swPath);
        
        // Czekamy na gotowość SW
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return alert("Zezwól na powiadomienia w ustawieniach Safari.");

        // PODAJEMY GOTOWE BAJTY - To eliminuje błędy "invalid characters" i "P-256"
        const binaryVapidKey = new Uint8Array([
            4, 66, 110, 34, 73, 82, 112, 86, 119, 110, 107, 50, 66, 76, 85, 79, 
            49, 78, 79, 104, 90, 104, 115, 67, 85, 48, 97, 51, 116, 49, 112, 84, 
            120, 115, 49, 107, 50, 70, 52, 85, 65, 84, 110, 112, 88, 86, 89, 55, 
            107, 87, 87, 79, 78, 51, 84, 81, 68, 90, 45, 114, 53, 105, 81, 66, 
            102, 110, 109, 95, 88, 107, 66, 85, 72, 80, 67, 87, 71, 66, 84, 66, 
            117, 86, 52, 72, 69
        ]);

        const token = await getToken(messaging, { 
            vapidKey: binaryVapidKey, 
            serviceWorkerRegistration: registration 
        });

        if (token) {
            localStorage.setItem('ryneczek_push_token', token);
            alert("✅ Sukces! Powiadomienia aktywne.");
            console.log("Token:", token);
        }
    } catch (error) {
        console.error("Błąd:", error);
        alert("Błąd: " + error.message);
    }
};

// --- LOGIKA OFERT ---
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
            <div class="input-group"><label>Pula (ilość)</label><input type="number" class="p-total" step="0.01" required></div>
            <div class="input-group"><label>Krok wyboru</label>
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