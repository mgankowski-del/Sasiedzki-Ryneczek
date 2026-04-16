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

// FUNKCJA KONWERTUJĄCA - Rozwiązuje błąd P-256 na iPhone
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

async function requestPermission() {
    try {
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const vapidKey = 'BPc7WCUCSkorQqaUH01pL0GzvAIb2d4weIn_ToK1Wg8Sgt6WMH1VCQGigIMllEuVPM-KKzWMAO-5MkJrs6aT2L8';
            
            // Konwertujemy klucz na format binarny przed wysłaniem
            const convertedVapidKey = urlBase64ToUint8Array(vapidKey);

            return await getToken(messaging, { 
                vapidKey: convertedVapidKey, 
                serviceWorkerRegistration: registration 
            });
        }
    } catch (error) { 
        alert("Błąd VAPID (P-256): " + error.message);
    }
    return null;
}

// Reszta logiki UI
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-open-add').onclick = () => {
        document.getElementById('add-listing-modal').classList.remove('hidden');
        document.getElementById('listing-form').reset();
        document.getElementById('products-to-add').innerHTML = '';
        document.getElementById('products-to-add').appendChild(createProductFields());
    };
});

const createProductFields = () => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.innerHTML = `
        <div class="input-group"><label>Produkt</label><input type="text" class="p-name" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena</label><input type="number" class="p-price" step="0.01" required></div>
            <div class="input-group"><label>Jednostka</label><select class="p-unit"><option value="szt">szt.</option><option value="kg">kg</option></select></div>
        </div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = "Pobieram token...";

    const token = await requestPermission();

    btn.innerText = "Publikuję...";
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
            totalQty: 100, // uproszczone dla testu
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