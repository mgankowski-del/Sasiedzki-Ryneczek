import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

// Funkcje globalne przypisane do window dla poprawnego działania w Safari
window.closeModals = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
};

window.openOrderModal = async (id) => {
    const modal = document.getElementById('order-modal');
    const details = document.getElementById('order-details');
    details.innerHTML = '<p>Ładowanie produktów...</p>';
    modal.classList.remove('hidden');

    try {
        const snap = await getDoc(doc(db, "listings", id));
        if (snap.exists()) {
            const data = snap.data();
            let html = `<h2>Zamówienie: ${data.sellerName}</h2>`;
            data.items.forEach(item => {
                html += `
                <div style="border-bottom: 1px solid #eee; padding: 12px 0;">
                    <p style="margin:0;"><strong>${item.name}</strong></p>
                    <p style="margin:0; color:#27ae60;">${item.price} zł / ${item.unit}</p>
                </div>`;
            });
            html += `<p style="margin-top:20px; color: #7f8c8d; font-size: 0.9rem;">Zadzwoń do sprzedawcy, aby potwierdzić:<br><strong style="font-size:1.2rem; color:#2c3e50;">${data.sellerPhone}</strong></p>`;
            details.innerHTML = html;
        }
    } catch (e) { 
        details.innerHTML = 'Błąd pobierania danych.'; 
    }
};

window.authSeller = (id, pin) => {
    const userPin = prompt("Podaj PIN (4 cyfry), aby zarządzać:");
    if (userPin === pin) alert("PIN poprawny. (Funkcja edycji w przygotowaniu)");
    else alert("Niepoprawny PIN.");
};

const createProductFields = () => {
    const div = document.createElement('div');
    div.className = 'product-form-box';
    div.style.padding = "15px";
    div.style.background = "#f8f9fa";
    div.style.borderRadius = "12px";
    div.style.marginBottom = "15px";
    div.style.border = "1px solid #e9ecef";
    div.innerHTML = `
        <div class="input-group"><label>Nazwa produktu</label><input type="text" class="p-name" required placeholder="np. Mleko prosto od krowy"></div>
        <div class="input-group"><label>Cena i Jednostka</label>
            <div style="display:flex; gap:10px;">
                <input type="number" class="p-price" step="0.01" style="flex:2" placeholder="Cena">
                <select class="p-unit" style="flex:1"><option value="szt">szt.</option><option value="kg">kg</option><option value="litr">litr</option></select>
            </div>
        </div>
        <div class="input-group"><label>Zdjęcie produktu</label><input type="file" class="p-file" accept="image/*"></div>
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
                    <h3>${d.sellerName}</h3>
                    <p>📍 ${d.address}</p>
                </div>
                <div class="card-footer">
                    <button class="btn-primary-action" onclick="window.openOrderModal('${docSnap.id}')">🛒 Zamów</button>
                    <button class="btn-manage-gear" onclick="window.authSeller('${docSnap.id}', '${d.pin}')">⚙️</button>
                </div>`;
            cont.appendChild(card);
        });
    });

    document.getElementById('btn-open-add').onclick = () => {
        const prodCont = document.getElementById('products-to-add');
        prodCont.innerHTML = '';
        prodCont.appendChild(createProductFields());
        document.getElementById('add-listing-modal').classList.remove('hidden');
    };
});

document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.innerText = "Publikowanie...";
    btn.disabled = true;

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
                imageUrl: imageUrl
            });
        }

        await addDoc(collection(db, "listings"), {
            sellerName: document.getElementById('sellerName').value,
            sellerPhone: document.getElementById('sellerPhone').value,
            address: document.getElementById('pickupAddress').value,
            pin: document.getElementById('pin').value,
            items: products,
            createdAt: new Date()
        });

        location.reload();
    } catch (err) {
        alert("Błąd: " + err.message);
        btn.disabled = false;
        btn.innerText = "Opublikuj ofertę";
    }
};