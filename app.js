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
            reservations: [], // Tutaj będą wpadać zamówienia
            createdAt: new Date()
        });

        form.reset();
        alert("Ogłoszenie dodane!");
    } catch (err) { console.error(err); alert("Błąd!"); }
    finally { btn.disabled = false; btn.innerText = "Opublikuj ogłoszenie"; }
});

// POBIERANIE OGŁOSZEŃ I WYŚWIETLANIE
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    container.innerHTML = '';
    snap.forEach(documentSnapshot => {
        const item = documentSnapshot.data();
        const id = documentSnapshot.id;
        const card = document.createElement('div');
        card.className = 'product-card';

        // Budujemy listę rezerwacji (kto zamówił)
        let resHtml = '';
        if(item.reservations && item.reservations.length > 0) {
            resHtml = `<div class="reservations-list"><h4>Sąsiedzi, którzy zamówili:</h4>`;
            item.reservations.forEach(r => {
                resHtml += `<div class="res-item">👤 ${r.name} - ⏰ ${r.time.replace('T', ' ')}</div>`;
            });
            resHtml += `</div>`;
        }

        card.innerHTML = `
            <img src="${item.imageUrl}" class="product-image">
            <div class="product-info">
                <div class="product-price">${item.price} zł / ${item.unit}</div>
                <h3>${item.title}</h3>
                <p>${item.description}</p>
                <div class="pickup-tag">🏠 Sprzedawca: ${item.sellerName}<br>⏰ Odbiór: ${item.pickupTimes}</div>
                <button class="btn-reserve" onclick="openBooking('${id}', '${item.title}', '${item.sellerName}')">Zarezerwuj</button>
                ${resHtml}
                <button class="btn-delete" onclick="deleteListing('${id}', '${item.pin}')">Usuń ogłoszenie</button>
            </div>
        `;
        container.appendChild(card);
    });
});

// FUNKCJA USUWANIA
window.deleteListing = async (id, correctPin) => {
    const userPin = prompt("Podaj 4-cyfrowy PIN, aby usunąć ogłoszenie:");
    if (userPin === correctPin) {
        if (confirm("Na pewno usunąć?")) {
            await deleteDoc(doc(db, "listings", id));
            alert("Usunięto!");
        }
    } else {
        alert("Błędny PIN!");
    }
};

// REZERWACJA
window.openBooking = (id, title, seller) => {
    currentProductId = id;
    currentProductData = { title, seller };
    document.getElementById('modal-product-info').innerText = `${title} od ${seller}`;
    document.getElementById('reservation-modal').classList.remove('hidden');
};

document.getElementById('close-modal-btn').onclick = () => document.getElementById('reservation-modal').classList.add('hidden');

// POTWIERDZENIE REZERWACJI - ZAPIS DO FIREBASE
document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value;
    const buyerTime = document.getElementById('buyerPickupTime').value;
    
    if (!buyerName || !buyerTime) return alert("Wypełnij dane!");

    const productRef = doc(db, "listings", currentProductId);
    
    try {
        await updateDoc(productRef, {
            reservations: arrayUnion({
                name: buyerName,
                time: buyerTime
            })
        });
        document.getElementById('reservation-modal').classList.add('hidden');
        document.getElementById('success-modal').classList.remove('hidden');
    } catch (err) {
        console.error(err);
        alert("Błąd rezerwacji!");
    }
};

// KALENDARZ
document.getElementById('add-to-calendar-btn').onclick = () => {
    const time = document.getElementById('buyerPickupTime').value;
    const start = new Date(time).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(new Date(time).getTime() + 1800000).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Odbiór: ' + currentProductData.title)}&dates=${start}/${end}&details=${encodeURIComponent('U: ' + currentProductData.seller)}&sf=true&output=xml`;
    window.open(url, '_blank');
};