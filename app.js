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

async function getPushToken() {
    if (!messaging) return null;
    try {
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        // Czekamy aż SW będzie aktywny
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await getToken(messaging, { 
                vapidKey: 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE',
                serviceWorkerRegistration: registration 
            });
            if (token) return token;
        } else {
            alert("Brak zgody na powiadomienia w ustawieniach iPhone!");
        }
    } catch (error) {
        alert("Błąd krytyczny tokena: " + error.message);
    }
    return null;
}

// Reszta logiki UI
document.addEventListener('DOMContentLoaded', () => {
    const btnOpenAdd = document.getElementById('btn-open-add');
    if (btnOpenAdd) {
        btnOpenAdd.onclick = () => {
            document.getElementById('modal-title').innerText = "Nowa oferta";
            document.getElementById('listing-form').reset();
            document.getElementById('products-to-add').innerHTML = '';
            document.getElementById('products-to-add').appendChild(createProductFields());
            document.getElementById('add-listing-modal').classList.remove('hidden');
        };
    }
});

const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" value="${data.name || ''}" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" value="${data.price || ''}" required></div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit"><option value="szt">szt.</option><option value="kg">kg</option></select>
            </div>
        </div>
        <div class="input-group"><label>Ilość</label><input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required></div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = "Autoryzacja powiadomień...";

    // WYMUSZAMY POBRANIE TOKENA - jeśli nie wyjdzie, przerywamy z informacją
    const token = await getPushToken();
    
    if (!token) {
        const cont = confirm("Nie udało się pobrać tokena powiadomień. Czy mimo to opublikować ogłoszenie? (Nie będziesz dostawać powiadomień push)");
        if (!cont) {
            btn.disabled = false;
            btn.innerText = "Opublikuj ogłoszenie";
            return;
        }
    }

    btn.innerText = "Wysyłanie danych...";
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
            step: 1,
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
};

onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    if (!cont) return;
    cont.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `<h3>${d.sellerName}</h3><p>${d.address}</p>`;
        cont.appendChild(card);
    });
});