import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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

// --- FUNKCJE GLOBALNE (DLA PRZYCISKÓW) ---

window.closeModals = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.body.classList.remove('modal-open');
};

window.openOrderModal = async (listingId) => {
    const orderModal = document.getElementById('order-modal');
    const orderDetails = document.getElementById('order-details');
    orderDetails.innerHTML = 'Ładowanie...';
    orderModal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    try {
        const docRef = doc(db, "listings", listingId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            let html = `<h2>Zamów u: ${data.sellerName}</h2>`;
            data.items.forEach((item, index) => {
                html += `
                    <div class="order-item">
                        <p><strong>${item.name}</strong> - ${item.price} zł/${item.unit}</p>
                        <input type="number" step="${item.step}" min="0" placeholder="Ilość" id="qty-${index}">
                    </div>`;
            });
            html += `<button class="btn-save" style="margin-top:15px">Wyślij zamówienie (Symulacja)</button>`;
            orderDetails.innerHTML = html;
        }
    } catch (e) {
        orderDetails.innerHTML = 'Błąd ładowania danych.';
    }
};

window.authSeller = (listingId, correctPin) => {
    const pin = prompt("Podaj 4-cyfrowy PIN, aby zarządzać ofertą:");
    if (pin === correctPin) {
        alert("Zalogowano! (Tu wkrótce pojawi się panel edycji)");
    } else {
        alert("Błędny PIN.");
    }
};

// --- LOGIKA FORMULARZA DODAWANIA ---

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
        <div class="input-group"><label>Zdjęcie</label><input type="file" class="p-file" accept="image/*"></div>
    `;
    return div;
};

// --- OBSŁUGA STARTOWA ---

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
                <div class="listing-header"><h3>${d.sellerName}</h3><p>📍 ${d.address}</p></div>
                <div class="card-footer">
                    <button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów</button>
                    <button class="btn-manage-gear" onclick="window.authSeller('${docSnap.id}', '${d.pin}')">⚙️</button>
                </div>`;
            cont.appendChild(card);
        });
    });

    const btnOpenAdd = document.getElementById('btn-open-add');
    if (btnOpenAdd) {
        btnOpenAdd.addEventListener('click', () => {
            const container = document.getElementById('products-to-add');
            container.innerHTML = '';
            container.appendChild(createProductFields());
            document.getElementById('add-listing-modal').classList.remove('hidden');
            document.body.classList.add('modal-open');
        });
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
            address: document.getElementById('pickupAddress').value,
            pickupTimes: document.getElementById('pickupTimes').value,
            expiryDate: document.getElementById('expiryDate').value,
            pin: document.getElementById('pin').value,
            items: products,
            createdAt: new Date(),
            reservations: []
        });

        window.closeModals();
        location.reload();
    } catch (err) {
        alert("Błąd: " + err.message);
        btn.disabled = false;
        btn.innerText = "Opublikuj ofertę";
    }
};