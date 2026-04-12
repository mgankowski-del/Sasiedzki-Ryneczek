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

// DODAWANIE KOLEJNYCH PÓL PRODUKTU W FORMULARZU
document.getElementById('add-more-items').onclick = () => {
    const container = document.getElementById('products-to-add');
    const newItem = container.firstElementChild.cloneNode(true);
    newItem.querySelectorAll('input').forEach(i => i.value = '');
    container.appendChild(newItem);
};

// FORMULARZ PUBLIKACJI
document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.innerText = "Publikowanie...";

    const productDivs = document.querySelectorAll('.product-item-form');
    const items = Array.from(productDivs).map(div => ({
        name: div.querySelector('.p-name').value,
        price: parseFloat(div.querySelector('.p-price').value),
        unit: div.querySelector('.p-unit').value,
        totalQty: parseFloat(div.querySelector('.p-total').value),
        step: parseFloat(div.querySelector('.p-step').value)
    }));

    try {
        const imageFile = document.getElementById('productImage').files[0];
        const imageRef = ref(storage, `listings/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imageRef, imageFile);
        const imageUrl = await getDownloadURL(imageRef);

        await addDoc(collection(db, "listings"), {
            title: document.getElementById('listing-title').value,
            sellerName: document.getElementById('sellerName').value,
            pickupTimes: document.getElementById('pickupTimes').value,
            pin: document.getElementById('pin').value,
            imageUrl,
            items,
            reservations: [],
            createdAt: new Date()
        });
        location.reload();
    } catch (err) { alert("Błąd!"); console.error(err); }
};

// WYŚWIETLANIE OGŁOSZEŃ
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const list = document.getElementById('listings-container');
    list.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        
        let itemsHtml = d.items.map(it => `
            <div class="item-row">
                <span><b>${it.name}</b> (${it.totalQty} ${it.unit})</span>
                <span>${it.price} zł / ${it.unit}</span>
            </div>
        `).join('');

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${d.imageUrl}" class="product-image">
            <div class="product-info">
                <h3>${d.title}</h3>
                <div class="pickup-tag">👤 ${d.sellerName} | ⏰ ${d.pickupTimes}</div>
                <div class="items-list">${itemsHtml}</div>
                <button class="btn-primary" onclick="openOrderModal('${id}')" style="margin-top:15px">Zarezerwuj wybrane</button>
                <button class="btn-secondary" onclick="authSeller('${id}', '${d.pin}')">⚙️ Zarządzaj</button>
            </div>
        `;
        list.appendChild(card);
    });
});

// LOGIKA MODALU ZAMÓWIENIA
let currentListingId = null;
let orderData = {};

window.openOrderModal = (id) => {
    currentListingId = id;
    onSnapshot(doc(db, "listings", id), (snap) => {
        const d = snap.data();
        const container = document.getElementById('modal-order-items');
        container.innerHTML = '';
        orderData = {};

        d.items.forEach((it, index) => {
            orderData[index] = { qty: 0, price: it.price, step: it.step, name: it.name, unit: it.unit };
            const row = document.createElement('div');
            row.className = 'item-row';
            row.innerHTML = `
                <span>${it.name}</span>
                <div class="qty-control">
                    <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                    <span class="qty-val" id="qty-${index}">0 ${it.unit}</span>
                    <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                </div>
            `;
            container.appendChild(row);
        });
        document.getElementById('reservation-modal').classList.remove('hidden');
    });
};

window.updateQty = (index, direction) => {
    const it = orderData[index];
    const newVal = Math.max(0, it.qty + (direction * it.step));
    it.qty = newVal;
    document.getElementById(`qty-${index}`).innerText = `${newVal.toFixed(2)} ${it.unit}`;
    
    let total = 0;
    Object.values(orderData).forEach(o => total += o.qty * o.price);
    document.getElementById('modal-total-price').innerText = total.toFixed(2);
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value;
    const time = document.getElementById('buyerPickupTime').value;
    const itemsOrdered = Object.values(orderData).filter(o => o.qty > 0);
    
    if(!buyerName || itemsOrdered.length === 0) return alert("Wybierz produkty i podaj imię!");

    await updateDoc(doc(db, "listings", currentListingId), {
        reservations: arrayUnion({ buyerName, time, items: itemsOrdered })
    });
    location.reload();
};

// PANEL SPRZEDAWCY
window.authSeller = (id, pin) => {
    if(prompt("Podaj PIN:") !== pin) return alert("Błędny PIN");
    currentListingId = id;
    onSnapshot(doc(db, "listings", id), (snap) => {
        const d = snap.data();
        const resCont = document.getElementById('reservations-container');
        resCont.innerHTML = `<h4>Zamówienia dla: ${d.title}</h4>`;
        d.reservations.forEach(r => {
            const itemsStr = r.items.map(i => `${i.qty}${i.unit} ${i.name}`).join(', ');
            resCont.innerHTML += `<div class="res-item-row" style="color:white; border-bottom:1px solid #555; padding:10px 0">
                <b>${r.buyerName}</b>: ${itemsStr}<br><small>Odbiór: ${r.time}</small>
            </div>`;
        });
        document.getElementById('seller-modal').classList.remove('hidden');
    });
};

document.getElementById('delete-listing-btn').onclick = async () => {
    if(confirm("Usunąć ogłoszenie?")) {
        await deleteDoc(doc(db, "listings", currentListingId));
        location.reload();
    }
};

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));