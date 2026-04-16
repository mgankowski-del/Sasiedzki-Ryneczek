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

async function getPushToken() {
    try {
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            // RĘCZNIE PRZYGOTOWANY KLUCZ P-256 (Twój klucz w formie bajtów)
            const rawVapidKey = new Uint8Array([
                4, 66, 110, 34, 73, 82, 112, 86, 119, 110, 107, 50, 66, 76, 85, 79, 49, 78, 79, 104, 90, 104, 115, 67, 85, 48, 97, 51, 116, 49, 112, 84, 120, 115, 49, 107, 50, 70, 52, 85, 65, 84, 110, 112, 88, 86, 89, 55, 107, 87, 87, 79, 78, 51, 84, 81, 68, 90, 45, 114, 53, 105, 81, 66, 102, 110, 109, 95, 88, 107, 66, 85, 72, 80, 67, 87, 71, 66, 84, 66, 117, 86, 52, 72, 69
            ]);

            const token = await getToken(messaging, { 
                vapidKey: rawVapidKey, // Podajemy surowe bajty
                serviceWorkerRegistration: registration 
            });
            return token;
        }
    } catch (error) {
        alert("Błąd VAPID P-256: " + error.message);
    }
    return null;
}

// Reszta Twojej logiki UI (skrócona dla jasności, zostaw swoje funkcje otwierania okien)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-open-add').onclick = () => {
        document.getElementById('add-listing-modal').classList.remove('hidden');
        document.getElementById('listing-form').reset();
        document.getElementById('products-to-add').innerHTML = '';
        document.getElementById('products-to-add').appendChild(createProductFields());
    };
});

const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.innerHTML = `
        <div class="input-group"><label>Produkt</label><input type="text" class="p-name" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena</label><input type="number" class="p-price" step="0.01" required></div>
            <div class="input-group"><label>Szt/Kg</label><select class="p-unit"><option value="szt">szt.</option><option value="kg">kg</option></select></div>
        </div>
        <div class="input-group"><label>Ilość całkowita</label><input type="number" class="p-total" step="0.01" required></div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = "Pobieram token...";

    const token = await getPushToken();

    btn.innerText = "Wysyłam ogłoszenie...";
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