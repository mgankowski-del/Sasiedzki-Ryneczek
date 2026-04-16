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

// Bezpieczna inicjalizacja messaging
try { 
    messaging = getMessaging(app); 
} catch (e) { 
    console.log("Powiadomienia push nie są wspierane w tej przeglądarce."); 
}

let currentEditId = null;
let cachedListingData = null;

window.closeModals = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
};

// --- Uproszczona, standardowa funkcja powiadomień ---
window.setupNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return alert("Twoja przeglądarka nie obsługuje powiadomień Push.");
    }
    
    try {
        // 1. Rejestracja SW (jeśli jeszcze nie ma)
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        console.log('SW zarejestrowany');

        // 2. Prośba o uprawnienia (standardowe okno iOS)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            return alert("Musisz zezwolić na powiadomienia w ustawieniach.");
        }

        // 3. Pobranie tokena Firebase - wersja "Pure String"
        // iOS 17.4+ często lepiej radzi sobie z czystym tekstem niż z Uint8Array
        const token = await getToken(messaging, { 
            vapidKey: 'BEprJIVRpVwnk2BLUO1NOhZhsCU0a3t1pTxs1k2F4UATnpXVY7kWWON3TQDZ-r5iQBfnm_XkBUHPCWGBTBuV4HE'
            // Usunąłem jawne podawanie registration, Firebase sam je znajdzie
        });

        if (token) {
            localStorage.setItem('ryneczek_push_token', token);
            alert("✅ Sukces! Powiadomienia aktywne.");
            console.log("Token:", token);
        } else {
            alert("Nie udało się wygenerować tokena. Spróbuj odświeżyć stronę.");
        }
    } catch (error) {
        console.error("Błąd szczegółowy:", error);
        alert("Błąd: " + error.message);
    }
};

const createProductFields = () => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" placeholder="Np. Jajka wiejskie" required></div>
        <div class="form-grid">
            <div class="input-group"><label>Cena (zł)</label><input type="number" class="p-price" step="0.01" required></div>
            <div class="input-group"><label>Jednostka</label>
                <select class="p-unit"><option value="szt">szt.</option><option value="kg">kg</option><option value="g">g</option></select>
            </div>
        </div>
        <div class="form-grid">
            <div class="input-group"><label>Łączna ilość (pula)</label><input type="number" class="p-total" step="0.01" required></div>
            <div class="input-group"><label>Krok zamawiania</label>
                <select class="p-step"><option value="1">1</option><option value="0.5">0.5</option><option value="0.25">0.25</option><option value="100">100 (g)</option></select>
            </div>
        </div>
        <input type="file" class="p-file" accept="image/*" style="margin-top:10px;">
    `;
    return div;
};

document.addEventListener('DOMContentLoaded', () => {
    const listingsCont = document.getElementById('listings-container');
    
    onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
        listingsCont.innerHTML = '';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const card = document.createElement('div');
            card.className = 'product-card';
            let productsHtml = (d.items || []).map(it => `
                <div class="product-item-list">
                    <img src="${it.imageUrl || 'https://via.placeholder.com/50'}" class="thumb">
                    <div><b>${it.name}</b><br><small>${it.price} zł / ${it.unit}</small></div>
                </div>
            `).join('');

            card.innerHTML = `
                <div class="listing-header">
                    <h3>Odbiór u: ${d.sellerName}</h3>
                    <p>📍 ${d.address} | 📞 ${d.sellerPhone}</p>
                    <p>⏰ ${d.pickupTimes}</p>
                </div>
                ${productsHtml}
                <div class="card-footer">
                    <button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów</button>
                    <button class="btn-manage-gear" onclick="window.authSeller('${docSnap.id}', '${d.pin}')">⚙️</button>
                </div>
            `;
            listingsCont.appendChild(card);
        });
    });

    document.getElementById('btn-open-add').onclick = () => {
        document.getElementById('listing-form').reset();
        document.getElementById('products-to-add').innerHTML = '';
        document.getElementById('products-to-add').appendChild(createProductFields());
        document.getElementById('add-listing-modal').classList.remove('hidden');
    };

    document.getElementById('add-more-items').onclick = () => {
        document.getElementById('products-to-add').appendChild(createProductFields());
    };
});

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
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
    } catch (err) {
        alert("Błąd: " + err.message);
        btn.disabled = false;
    }
};

window.openOrderModal = async (id) => {
    currentEditId = id;
    const snap = await getDoc(doc(db, "listings", id));
    const d = snap.data();
    cachedListingData = d;
    const container = document.getElementById('modal-order-items');
    container.innerHTML = '';
    d.items.forEach(it => {
        container.innerHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
                <span>${it.name} (${it.price} zł)</span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button type="button" onclick="const s=this.nextElementSibling; s.innerText=Math.max(0, parseFloat(s.innerText)-${it.step})">-</button>
                    <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}">0</span>
                    <button type="button" onclick="const s=this.previousElementSibling; s.innerText=parseFloat(s.innerText)+${it.step}">+</button>
                </div>
            </div>`;
    });
    document.getElementById('reservation-modal').classList.remove('hidden');
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const items = [];
    document.querySelectorAll('.order-qty-val').forEach(span => {
        const q = parseFloat(span.innerText);
        if (q > 0) items.push({ name: span.dataset.name, qty: q });
    });
    const refL = doc(db, "listings", currentEditId);
    let res = cachedListingData.reservations || [];
    res.push({
        buyerName: document.getElementById('buyerName').value,
        buyerPhone: document.getElementById('buyerPhone').value,
        items,
        time: document.getElementById('buyerPickupTime').value
    });
    await updateDoc(refL, { reservations: res });
    location.reload();
};

window.authSeller = async (id, pin) => {
    const input = prompt("Podaj PIN:");
    if (input === pin) alert("PIN OK!"); else alert("Zły PIN!");
};