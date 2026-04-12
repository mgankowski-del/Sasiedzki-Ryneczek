import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

const form = document.getElementById('listing-form');
const container = document.getElementById('listings-container');
let currentProductId = null;
let currentProductData = null;
let lastPickupText = "";

// DODAWANIE OGŁOSZENIA
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const imageInput = document.getElementById('productImage');
    if (!imageInput.files[0]) return alert("Wybierz zdjęcie!");
    btn.disabled = true; btn.innerText = "Publikowanie...";

    try {
        const file = imageInput.files[0];
        const imageRef = ref(storage, `products/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(imageRef, file);
        const imageUrl = await getDownloadURL(snapshot.ref);

        await addDoc(collection(db, "listings"), {
            title: document.getElementById('title').value,
            price: document.getElementById('price').value,
            unit: document.getElementById('unit').value,
            pickupTimes: document.getElementById('pickupTimes').value,
            description: document.getElementById('description').value,
            sellerName: document.getElementById('sellerName').value,
            pin: document.getElementById('pin').value,
            imageUrl: imageUrl,
            reservations: [],
            createdAt: new Date()
        });
        form.reset();
        alert("Dodano ogłoszenie!");
    } catch (err) { console.error(err); alert("Błąd!"); }
    finally { btn.disabled = false; btn.innerText = "Opublikuj ogłoszenie"; }
});

// WYŚWIETLANIE LISTY
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    container.innerHTML = '';
    snap.forEach(documentSnapshot => {
        const item = documentSnapshot.data();
        const id = documentSnapshot.id;
        const card = document.createElement('div');
        card.className = 'product-card';

        card.innerHTML = `
            <img src="${item.imageUrl}" class="product-image">
            <div class="product-info">
                <div class="product-price">${item.price} zł / ${item.unit}</div>
                <h3>${item.title}</h3>
                <p>${item.description}</p>
                <div class="pickup-tag">🏠 Sprzedawca: ${item.sellerName}<br>⏰ Można odbierać: ${item.pickupTimes}</div>
                <button class="btn-reserve" onclick="openBooking('${id}', '${item.title}', '${item.sellerName}')">Zarezerwuj</button>
                <button class="btn-seller-preview" onclick="authSeller('${id}', '${item.pin}', '${item.title}', ${JSON.stringify(item.reservations).replace(/"/g, '&quot;')})">⚙️ Panel sprzedawcy</button>
            </div>
        `;
        container.appendChild(card);
    });
});

// MODAL REZERWACJI (KUPUJĄCY)
window.openBooking = (id, title, seller) => {
    currentProductId = id;
    currentProductData = { title, seller };
    document.getElementById('modal-product-info').innerText = `${title} od ${seller}`;
    document.getElementById('reservation-modal').classList.remove('hidden');
};

// PANEL SPRZEDAWCY (PO PINIE)
window.authSeller = (id, correctPin, title, reservations) => {
    const userPin = prompt("Podaj PIN Twojego ogłoszenia:");
    if (userPin === correctPin) {
        currentProductId = id;
        document.getElementById('seller-modal-product-title').innerText = title;
        const resContainer = document.getElementById('reservations-container');
        
        if (!reservations || reservations.length === 0) {
            resContainer.innerHTML = "<p style='font-size:0.8rem; opacity:0.7;'>Brak rezerwacji.</p>";
        } else {
            resContainer.innerHTML = "<h4>Zamówienia od sąsiadów:</h4>";
            reservations.forEach(r => {
                resContainer.innerHTML += `<div class="res-item-row">👤 <b>${r.name}</b><br>🕒 Zadeklarowany czas: ${r.time}</div>`;
            });
        }
        document.getElementById('seller-modal').classList.remove('hidden');
    } else {
        alert("Błędny PIN!");
    }
};

window.closeModals = () => {
    document.getElementById('reservation-modal').classList.add('hidden');
    document.getElementById('seller-modal').classList.add('hidden');
};

// POTWIERDZENIE REZERWACJI
document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value;
    const buyerTime = document.getElementById('buyerPickupTime').value;
    if (!buyerName || !buyerTime) return alert("Wpisz swoje imię i kiedy wpadniesz!");
    
    lastPickupText = buyerTime; // Zapamiętujemy tekst dla kalendarza

    try {
        await updateDoc(doc(db, "listings", currentProductId), {
            reservations: arrayUnion({ name: buyerName, time: buyerTime })
        });
        document.getElementById('reservation-modal').classList.add('hidden');
        document.getElementById('success-modal').classList.remove('hidden');
    } catch (err) { alert("Błąd rezerwacji!"); }
};

// USUWANIE
document.getElementById('delete-listing-btn').onclick = async () => {
    if (confirm("Czy na pewno chcesz usunąć to ogłoszenie?")) {
        await deleteDoc(doc(db, "listings", currentProductId));
        closeModals();
    }
};

// KALENDARZ GOOGLE (Z TEKSTEM OPISOWYM)
document.getElementById('add-to-calendar-btn').onclick = () => {
    const now = new Date();
    const start = now.toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(now.getTime() + 3600000).toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    // Dodajemy opisowy czas do szczegółów wydarzenia
    const details = `Odbiór od: ${currentProductData.seller}. Twój zadeklarowany czas: ${lastPickupText}`;
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Odbiór: ' + currentProductData.title)}&dates=${start}/${end}&details=${encodeURIComponent(details)}&sf=true&output=xml`;
    window.open(url, '_blank');
};