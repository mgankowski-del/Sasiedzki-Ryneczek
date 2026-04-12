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

// OTWIERANIE MODALA DODAWANIA
document.getElementById('open-add-listing-btn').onclick = () => {
    document.getElementById('add-listing-modal').classList.remove('hidden');
};

const getRem = (name, total, res) => {
    let reserved = 0;
    res.forEach(r => {
        const item = r.items.find(i => i.name === name);
        if (item) reserved += item.qty;
    });
    return Math.max(0, total - reserved);
};

document.getElementById('add-more-items').onclick = () => {
    const container = document.getElementById('products-to-add');
    const newItem = container.firstElementChild.cloneNode(true);
    newItem.querySelectorAll('input').forEach(i => i.value = '');
    container.appendChild(newItem);
};

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
        const file = document.getElementById('productImage').files[0];
        const imgRef = ref(storage, `listings/${Date.now()}_${file.name}`);
        await uploadBytes(imgRef, file);
        const imageUrl = await getDownloadURL(imgRef);

        await addDoc(collection(db, "listings"), {
            title: document.getElementById('listing-title').value,
            sellerName: document.getElementById('sellerName').value,
            pickupTimes: document.getElementById('pickupTimes').value,
            pin: document.getElementById('pin').value,
            imageUrl, items, reservations: [], createdAt: new Date()
        });
        location.reload();
    } catch (err) { alert("Błąd!"); console.error(err); }
};

onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const list = document.getElementById('listings-container');
    list.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const itemsHtml = d.items.map(it => {
            const rem = getRem(it.name, it.totalQty, d.reservations);
            return `
                <div class="item-status-row">
                    <div><b>${it.name}</b><br><small style="color:#64748b">${rem > 0 ? `Zostało: ${rem} ${it.unit}` : 'Wyprzedane'}</small></div>
                    <span>${it.price} zł/${it.unit}</span>
                </div>
            `;
        }).join('');

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${d.imageUrl}" class="product-image">
            <div class="product-info">
                <h3>${d.title}</h3>
                <div style="font-size:0.85rem; color:#64748b; margin-bottom:15px">🏠 ${d.sellerName} | ⏰ ${d.pickupTimes}</div>
                <div>${itemsHtml}</div>
                <button class="btn-primary" onclick="openOrderModal('${id}')" style="margin-top:15px">Zarezerwuj</button>
                <button class="btn-cancel" onclick="authSeller('${id}', '${d.pin}')">Zarządzaj</button>
            </div>
        `;
        list.appendChild(card);
    });
});

let currentListingId = null;
let orderState = {};

window.openOrderModal = (id) => {
    currentListingId = id;
    onSnapshot(doc(db, "listings", id), (snap) => {
        const d = snap.data();
        const container = document.getElementById('modal-order-items');
        container.innerHTML = '';
        orderState = {};
        d.items.forEach((it, index) => {
            const rem = getRem(it.name, it.totalQty, d.reservations);
            orderState[index] = { qty: 0, price: it.price, step: it.step, name: it.name, unit: it.unit, max: rem };
            const row = document.createElement('div');
            row.className = 'qty-row';
            row.innerHTML = `<div><b>${it.name}</b><br><small>Dostępne: ${rem}</small></div>
                <div class="qty-control">
                    <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                    <span id="mqty-${index}">0 ${it.unit}</span>
                    <button class="qty-btn" id="pbtn-${index}" onclick="updateQty(${index}, 1)">+</button>
                </div>`;
            container.appendChild(row);
        });
        document.getElementById('reservation-modal').classList.remove('hidden');
    });
};

window.updateQty = (index, dir) => {
    const s = orderState[index];
    const newVal = Math.max(0, s.qty + (dir * s.step));
    if (newVal > s.max) return alert("Brak towaru!");
    s.qty = newVal;
    document.getElementById(`mqty-${index}`).innerText = `${newVal.toFixed(2)} ${s.unit}`;
    let total = 0;
    Object.values(orderState).forEach(o => total += o.qty * o.price);
    document.getElementById('modal-total-price').innerText = total.toFixed(2);
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value;
    const time = document.getElementById('buyerPickupTime').value;
    const ordered = Object.values(orderState).filter(o => o.qty > 0);
    if(!buyerName || ordered.length === 0) return alert("Wybierz produkty!");
    await updateDoc(doc(db, "listings", currentListingId), {
        reservations: arrayUnion({ buyerName, time, items: ordered.map(o => ({ name: o.name, qty: o.qty })) })
    });
    location.reload();
};

window.authSeller = (id, pin) => {
    if(prompt("Podaj PIN:") !== pin) return alert("Błędny PIN");
    currentListingId = id;
    onSnapshot(doc(db, "listings", id), (snap) => {
        const d = snap.data();
        const resCont = document.getElementById('reservations-container');
        resCont.innerHTML = '<h4>Zamówienia:</h4>';
        d.reservations.forEach(r => {
            const listStr = r.items.map(i => `${i.qty}x ${i.name}`).join(', ');
            resCont.innerHTML += `<div style="background:#0f172a; padding:10px; border-radius:10px; margin-bottom:10px">
                <b>${r.buyerName}</b>: ${listStr}<br><small>⏰ ${r.time}</small></div>`;
        });
        document.getElementById('seller-modal').classList.remove('hidden');
    });
};

document.getElementById('delete-listing-btn').onclick = async () => {
    if(confirm("Usunąć ogłoszenie?")) { await deleteDoc(doc(db, "listings", currentListingId)); location.reload(); }
};

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));