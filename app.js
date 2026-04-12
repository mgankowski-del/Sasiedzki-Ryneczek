import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// --- TUTAJ WKLEJ SWOJE DANE FIREBASE ---
const firebaseConfig = {
      apiKey: "AIzaSyD_cuGXokb55W6W4aB-QkV0c_jAqXkJQgk",
  authDomain: "sasiedzki-ryneczek.firebaseapp.com",
  projectId: "sasiedzki-ryneczek",
  storageBucket: "sasiedzki-ryneczek.firebasestorage.app",
  messagingSenderId: "885991041208",
  appId: "1:885991041208:web:3df60bebb747b563f86c4d"
};
// ---------------------------------------

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const form = document.getElementById('listing-form');
const container = document.getElementById('listings-container');
let currentProduct = null;

// DODAWANIE OGŁOSZENIA
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.innerText = "Publikowanie...";

    const imageFile = document.getElementById('productImage').files[0];
    const data = {
        title: document.getElementById('title').value,
        price: document.getElementById('price').value,
        unit: document.getElementById('unit').value,
        pickupTimes: document.getElementById('pickupTimes').value,
        description: document.getElementById('description').value,
        sellerName: document.getElementById('sellerName').value,
        pin: document.getElementById('pin').value,
        createdAt: new Date()
    };

    try {
        const imageRef = ref(storage, `products/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imageRef, imageFile);
        data.imageUrl = await getDownloadURL(imageRef);

        await addDoc(collection(db, "listings"), data);
        form.reset();
        alert("Ogłoszenie widoczne na Ryneczku!");
    } catch (err) {
        console.error(err);
        alert("Błąd. Sprawdź konsolę.");
    } finally {
        btn.disabled = false; btn.innerText = "Opublikuj ogłoszenie";
    }
});

// LISTA OGŁOSZEŃ
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    container.innerHTML = '';
    snap.forEach(doc => {
        const item = doc.data();
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${item.imageUrl}" class="product-image">
            <div class="product-info">
                <div class="product-price">${item.price} zł / ${item.unit}</div>
                <h3>${item.title}</h3>
                <p>${item.description}</p>
                <div class="pickup-tag">🏠 U kogo: ${item.sellerName}<br>⏰ Odbiór: ${item.pickupTimes}</div>
                <button class="btn-reserve" onclick="openBooking('${item.title}', '${item.sellerName}')">Zarezerwuj</button>
            </div>
        `;
        container.appendChild(card);
    });
});

// LOGIKA REZERWACJI
window.openBooking = (title, seller) => {
    currentProduct = { title, seller };
    document.getElementById('modal-product-info').innerText = `${title} od ${seller}`;
    document.getElementById('reservation-modal').classList.remove('hidden');
};

document.getElementById('close-modal-btn').onclick = () => document.getElementById('reservation-modal').classList.add('hidden');

document.getElementById('confirm-booking-btn').onclick = () => {
    const time = document.getElementById('buyerPickupTime').value;
    if(!time) return alert("Wybierz godzinę!");
    document.getElementById('reservation-modal').classList.add('hidden');
    document.getElementById('success-modal').classList.remove('hidden');
};

// KALENDARZ
document.getElementById('add-to-calendar-btn').onclick = () => {
    const time = document.getElementById('buyerPickupTime').value;
    const date = new Date(time).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(new Date(time).getTime() + 1800000).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Odbiór: ' + currentProduct.title)}&dates=${date}/${end}&details=${encodeURIComponent('U: ' + currentProduct.seller)}&sf=true&output=xml`;
    window.open(url, '_blank');
};