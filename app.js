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

// Funkcja pomocnicza do pól produktów
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

// --- START APLIKACJI ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplikacja startuje...");

    // 1. Obsługa otwierania modala
    const btnOpenAdd = document.getElementById('btn-open-add');
    const modalAdd = document.getElementById('add-listing-modal');
    
    if (btnOpenAdd && modalAdd) {
        btnOpenAdd.onclick = () => {
            console.log("Kliknięto dodawanie");
            const form = document.getElementById('listing-form');
            if (form) form.reset();
            const productCont = document.getElementById('products-to-add');
            if (productCont) {
                productCont.innerHTML = '';
                productCont.appendChild(createProductFields());
            }
            modalAdd.classList.remove('hidden');
        };
    }

    // 2. Dodawanie kolejnych pól produktu
    const btnMore = document.getElementById('add-more-items');
    if (btnMore) {
        btnMore.onclick = () => {
            const productCont = document.getElementById('products-to-add');
            if (productCont) productCont.appendChild(createProductFields());
        };
    }

    // 3. Ładowanie ofert z bazy (Snapshot)
    const listingsCont = document.getElementById('listings-container');
    if (listingsCont) {
        onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
            listingsCont.innerHTML = '';
            snap.forEach(docSnap => {
                const d = docSnap.data();
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <div class="listing-header">
                        <h3>Odbiór u: ${d.sellerName || 'Anonim'}</h3>
                        <p>📍 ${d.address || 'Brak adresu'}</p>
                    </div>
                    <div class="card-footer">
                        <button class="btn-primary-action" onclick="alert('Funkcja zamówień wkrótce')">🛒 Zamów</button>
                    </div>
                `;
                listingsCont.appendChild(card);
            });
        });
    }
});

// 4. Wysyłanie formularza
const mainForm = document.getElementById('listing-form');
if (mainForm) {
    mainForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submitBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Publikuję...";
        }

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
                    imageUrl
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

            location.reload();
        } catch (err) {
            alert("Błąd podczas publikacji: " + err.message);
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Opublikuj ogłoszenie";
            }
        }
    };
}