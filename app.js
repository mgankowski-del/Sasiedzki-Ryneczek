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

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

// --- RĘCZNE WYMUSZENIE TOKENA ---
window.activatePush = async () => {
    const btn = event.target;
    btn.innerText = "Łączę...";
    try {
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await getToken(messaging, { 
                vapidKey: 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE',
                serviceWorkerRegistration: registration 
            });
            if (token) {
                localStorage.setItem('ryneczek_push_token', token);
                btn.innerText = "✅ Powiadomienia aktywne";
                btn.style.backgroundColor = "#4caf50";
                return;
            }
        }
        alert("Nie udało się uzyskać tokena. Sprawdź ustawienia powiadomień iPhone.");
    } catch (e) { alert("Błąd: " + e.message); }
    btn.innerText = "Spróbuj ponownie włączyć";
};

const createProductFields = () => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.innerHTML = `
        <div class="input-group"><label>Produkt</label><input type="text" class="p-name" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena</label><input type="number" class="p-price" step="0.01" required></div>
            <div class="input-group"><label>Jedn.</label><select class="p-unit"><option value="szt">szt.</option><option value="kg">kg</option></select></div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Pula</label><input type="number" class="p-total" step="0.01" required></div>
            <div class="input-group"><label>Krok</label><select class="p-step"><option value="1">1</option><option value="0.5">0.5</option></select></div>
        </div>
        <input type="file" class="p-file" accept="image/*">
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
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
            // Dodajemy przycisk aktywacji Push do formularza dynamicznie
            const pushControl = document.createElement('div');
            pushControl.innerHTML = `<button type="button" onclick="window.activatePush()" style="width:100%; margin-bottom:15px; padding:10px; background:#ff9800; color:white; border:none; border-radius:8px; font-weight:bold;">🔔 KLIKNIJ ABY WŁĄCZYĆ POWIADOMIENIA</button>`;
            productCont.prepend(pushControl);
            
            document.getElementById('add-listing-modal')?.classList.remove('hidden');
        };
    }

    onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
        const cont = document.getElementById('listings-container');
        if (!cont) return;
        cont.innerHTML = '';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `<div class="listing-header"><h3>${d.sellerName}</h3><p>📍 ${d.address}</p></div>`;
            cont.appendChild(card);
        });
    });
});

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = "Publikuję...";

    const products = [];
    for (const div of document.querySelectorAll('.product-form-box')) {
        const file = div.querySelector('.p-file')?.files[0];
        let imageUrl = "";
        if (file) {
            const sRef = ref(storage, `products/${Date.now()}_${file.name}`);
            await uploadBytes(sRef, file);
            imageUrl = await getDownloadURL(sRef);
        }
        if (div.querySelector('.p-name')) {
            products.push({
                name: div.querySelector('.p-name').value,
                price: parseFloat(div.querySelector('.p-price').value),
                unit: div.querySelector('.p-unit').value,
                totalQty: parseFloat(div.querySelector('.p-total').value),
                step: parseFloat(div.querySelector('.p-step').value),
                imageUrl: imageUrl
            });
        }
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
};