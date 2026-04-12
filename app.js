import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Dane z Twojego screena
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
let currentProduct = null;

// DODAWANIE OGŁOSZENIA
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const imageInput = document.getElementById('productImage');
    
    if (!imageInput.files[0]) {
        alert("Proszę wybrać zdjęcie!");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Publikowanie...";

    const imageFile = imageInput.files[0];
    const title = document.getElementById('title').value;
    const price = document.getElementById('price').value;
    const unit = document.getElementById('unit').value;
    const pickupTimes = document.getElementById('pickupTimes').value;
    const description = document.getElementById('description').value;
    const sellerName = document.getElementById('sellerName').value;
    const pin = document.getElementById('pin').value;

    try {
        // Wgrywanie zdjęcia
        const imageRef = ref(storage, `products/${Date.now()}_${imageFile.name}`);
        const uploadResult = await uploadBytes(imageRef, imageFile);
        const imageUrl = await getDownloadURL(uploadResult.ref);

        // Zapis do bazy
        await addDoc(collection(db, "listings"), {
            title, price, unit, pickupTimes, description, sellerName, pin, imageUrl,
            createdAt: new Date()
        });

        form.reset();
        alert("Ogłoszenie dodane pomyślnie!");
    } catch (err) {
        console.error("Błąd Firebase:", err);
        alert("Wystąpił błąd. Sprawdź czy Storage i Firestore mają aktywne reguły 'allow write: if true'");
    } finally {
        btn.disabled = false;
        btn.innerText = "Opublikuj ogłoszenie";
    }
});

// POBIERANIE LISTY
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    container.innerHTML = '';
    snap.forEach(doc => {
        const item = doc.data();
        const card = document.createElement('div');
        card.className = 'product-card glass-card-dark'; // Upewnij się, że masz style dla kart
        card.style.background = "white"; card.style.color = "#333"; card.style.borderRadius = "15px"; card.style.padding = "10px"; card.style.marginBottom = "15px";

        card.innerHTML = `
            <img src="${item.imageUrl}" style="width:100%; height:180px; object-fit:cover; border-radius:10px;">
            <div style="padding:10px;">
                <h3 style="margin:5px 0;">${item.title}</h3>
                <strong style="color:#4f46e5;">${item.price} zł / ${item.unit}</strong>
                <p style="font-size:0.9rem;">${item.description}</p>
                <div style="background:#f3f4f6; padding:8px; border-radius:8px; font-size:0.8rem;">
                    🏠 ${item.sellerName} | ⏰ ${item.pickupTimes}
                </div>
                <button class="btn-reserve" onclick="openBooking('${item.title}', '${item.sellerName}')" style="width:100%; background:#10b981; color:white; margin-top:10px;">Zarezerwuj</button>
            </div>
        `;
        container.appendChild(card);
    });
});

// MODALE
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

document.getElementById('add-to-calendar-btn').onclick = () => {
    const time = document.getElementById('buyerPickupTime').value;
    const date = new Date(time).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(new Date(time).getTime() + 1800000).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Odbiór: ' + currentProduct.title)}&dates=${date}/${end}&details=${encodeURIComponent('U: ' + currentProduct.seller)}&sf=true&output=xml`;
    window.open(url, '_blank');
};