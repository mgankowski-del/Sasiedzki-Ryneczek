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
const messaging = getMessaging(app);

async function requestPermission() {
    try {
        // Rejestracja i czekanie na gotowość (kluczowe na iOS)
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const vapidKey = 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE';
            
            // Próba pobrania tokena z ponawianiem (retry)
            let token = null;
            for (let i = 0; i < 3; i++) {
                token = await getToken(messaging, { 
                    vapidKey: vapidKey, 
                    serviceWorkerRegistration: registration 
                });
                if (token) break;
                await new Promise(r => setTimeout(r, 1000)); // czekaj sekundę przed kolejną próbą
            }
            
            if (token) {
                console.log("Sukces! Token:", token);
                return token;
            } else {
                alert("Powiadomienia: Przeglądarka nie wydała tokena. Spróbuj odświeżyć stronę.");
            }
        } else {
            alert("Brak zgody na powiadomienia w systemie iOS.");
        }
    } catch (error) { 
        alert("Błąd techniczny tokena: " + error.message);
    }
    return null;
}

// UI LOGIC (bez zmian w funkcjonalności, ale dodany komunikat)
let currentEditId = null;
let cachedListingData = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-open-add').onclick = () => {
        document.getElementById('modal-title').innerText = "Nowa oferta";
        document.getElementById('listing-form').reset();
        document.getElementById('products-to-add').innerHTML = '';
        document.getElementById('products-to-add').appendChild(createProductFields());
        document.getElementById('add-listing-modal').classList.remove('hidden');
    };
    document.getElementById('add-more-items').onclick = () => {
        document.getElementById('products-to-add').appendChild(createProductFields());
    };
});

const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" required></div>
            <div class="input-group"><label>Jednostka</label><select class="p-unit"><option value="szt">szt.</option><option value="kg">kg</option></select></div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Ilość całkowita</label><input type="number" class="p-total" step="0.01" required></div>
            <div class="input-group"><label>Krok</label><select class="p-step"><option value="1">1</option><option value="0.5">0.5</option></select></div>
        </div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn'); 
    btn.disabled = true;
    btn.innerText = "Trwa autoryzacja...";

    const token = await requestPermission();

    btn.innerText = "Wysyłanie...";
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
        updatedAt: new Date(),
        reservations: []
    });

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
        card.innerHTML = `<h3>Odbiór u: ${d.sellerName}</h3><p>📍 ${d.address}</p>`;
        cont.appendChild(card);
    });
});