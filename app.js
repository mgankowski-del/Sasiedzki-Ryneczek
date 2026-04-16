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
    console.log("Messaging nieobsługiwany");
}

// --- NAPRAWA BŁĘDU Z LOGÓW ---
// Wystawiamy funkcję do window, żeby HTML mógł ją wywołać przez onclick
window.closeModals = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
};

// Funkcja konwertująca VAPID (bezpieczna wersja)
function urlBase64ToUint8Array(base64String) {
    try {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    } catch (e) { return null; }
}

async function requestPushToken() {
    if (!messaging) return null;
    try {
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const vapidKey = 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE';
            return await getToken(messaging, { 
                vapidKey: urlBase64ToUint8Array(vapidKey) || vapidKey, 
                serviceWorkerRegistration: registration 
            });
        }
    } catch (e) { console.error("Błąd Push:", e); }
    return null;
}

// Funkcja tworząca pola produktu (zgodna z Twoim UI)
const createProductFields = () => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.innerHTML = `
        <div class="input-group"><label>Produkt</label><input type="text" class="p-name" placeholder="Np. Truskawki" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" required></div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit"><option value="szt">szt.</option><option value="kg">kg</option></select>
            </div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Ilość (pula)</label><input type="number" class="p-total" step="0.1" required></div>
            <div class="input-group"><label>Krok zamawiania</label>
                <select class="p-step"><option value="1">1</option><option value="0.5">0.5</option></select>
            </div>
        </div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplikacja wystartowała poprawnie.");

    const btnOpenAdd = document.getElementById('btn-open-add');
    if (btnOpenAdd) {
        btnOpenAdd.onclick = () => {
            const form = document.getElementById('listing-form');
            if (form) form.reset();
            const productCont = document.getElementById('products-to-add');
            if (productCont) {
                productCont.innerHTML = '';
                productCont.appendChild(createProductFields());
            }
            document.getElementById('add-listing-modal')?.classList.remove('hidden');
        };
    }

    const btnMore = document.getElementById('add-more-items');
    if (btnMore) {
        btnMore.onclick = () => {
            document.getElementById('products-to-add')?.appendChild(createProductFields());
        };
    }

    // Ładowanie listy ofert
    const cont = document.getElementById('listings-container');
    if (cont) {
        onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
            cont.innerHTML = '';
            snap.forEach(docSnap => {
                const d = docSnap.data();
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <div class="listing-header">
                        <h3>Odbiór u: ${d.sellerName}</h3>
                        <p>📍 ${d.address}</p>
                    </div>
                    <div class="card-footer">
                        <button class="btn-primary-action" onclick="alert('Zamówienia wkrótce!')">🛒 Zamów</button>
                    </div>
                `;
                cont.appendChild(card);
            });
        });
    }
});

// Obsługa zapisu ogłoszenia
const mainForm = document.getElementById('listing-form');
if (mainForm) {
    mainForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.innerText = "Publikuję...";

        try {
            const token = await requestPushToken();
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
                sellerToken: token || "",
                address: document.getElementById('pickupAddress').value,
                pickupTimes: document.getElementById('pickupTimes').value,
                expiryDate: document.getElementById('expiryDate').value,
                pin: document.getElementById('pin').value,
                items: products,
                createdAt: new Date(),
                reservations: []
            });

            location.reload();
        } catch (err) {
            alert("Błąd: " + err.message);
            btn.disabled = false;
        }
    };
}