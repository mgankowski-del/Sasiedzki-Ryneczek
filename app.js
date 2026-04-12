import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, arrayUnion, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

let isEditing = false;
let currentEditId = null;
let editingResIndex = null;

// FUNKCJA GENERUJĄCA POLA PRODUKTU
const createProductFields = (data = {}) => {
    const div = document.createElement('div');
    div.className = 'product-item-form glass-card-dark';
    div.innerHTML = `
        <div class="input-group">
            <label>Nazwa produktu</label>
            <input type="text" class="p-name" value="${data.name || ''}" required>
        </div>
        <div class="row">
            <div class="input-group">
                <label>Cena (zł)</label>
                <input type="number" class="p-price" step="0.01" value="${data.price || ''}" required>
            </div>
            <div class="input-group">
                <label>Jednostka</label>
                <select class="p-unit">
                    <option value="szt" ${data.unit==='szt'?'selected':''}>szt.</option>
                    <option value="kg" ${data.unit==='kg'?'selected':''}>kg</option>
                    <option value="g" ${data.unit==='g'?'selected':''}>g (co 100g)</option>
                </select>
            </div>
        </div>
        <div class="row">
            <div class="input-group">
                <label>Dostępna ilość</label>
                <input type="number" class="p-total" step="0.01" value="${data.totalQty || ''}" required>
            </div>
            <div class="input-group" style="flex-direction:row; align-items:center; gap:10px; margin-top:20px">
                <input type="checkbox" class="p-no-img" ${data.noImg?'checked':''}> 
                <label style="margin:0">Nie dodawaj zdjęcia</label>
            </div>
        </div>
        <input type="file" class="p-file" style="${data.noImg?'display:none':''}">
        ${data.imageUrl ? `<img src="${data.imageUrl}" class="thumb">` : ''}
    `;
    
    div.querySelector('.p-no-img').onchange = (e) => {
        div.querySelector('.p-file').style.display = e.target.checked ? 'none' : 'block';
    };
    return div;
};

document.getElementById('open-add-listing-btn').onclick = () => {
    isEditing = false;
    document.getElementById('modal-title').innerText = "Nowa oferta";
    document.getElementById('listing-form').reset();
    document.getElementById('products-to-add').innerHTML = '';
    document.getElementById('products-to-add').appendChild(createProductFields());
    document.getElementById('add-listing-modal').classList.remove('hidden');
};

document.getElementById('add-more-items').onclick = () => {
    document.getElementById('products-to-add').appendChild(createProductFields());
};

// ZAPIS/EDYCJA OGŁOSZENIA
document.getElementById('listing-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;

    const products = [];
    const productDivs = document.querySelectorAll('.product-item-form');
    
    for (let div of productDivs) {
        const noImg = div.querySelector('.p-no-img').checked;
        const file = div.querySelector('.p-file').files[0];
        let url = "";

        if (!noImg && file) {
            const refImg = ref(storage, `products/${Date.now()}_${file.name}`);
            await uploadBytes(refImg, file);
            url = await getDownloadURL(refImg);
        }

        products.push({
            name: div.querySelector('.p-name').value,
            price: parseFloat(div.querySelector('.p-price').value),
            unit: div.querySelector('.p-unit').value,
            totalQty: parseFloat(div.querySelector('.p-total').value),
            noImg,
            imageUrl: url || (isEditing ? "" : ""), // Zachowanie starych zdjęć wymagałoby dodatkowej logiki
            step: div.querySelector('.p-unit').value === 'g' ? 100 : 1
        });
    }

    const listingData = {
        sellerName: document.getElementById('sellerName').value,
        address: document.getElementById('pickupAddress').value,
        pickupTimes: document.getElementById('pickupTimes').value,
        pin: document.getElementById('pin').value,
        items: products,
        updatedAt: new Date()
    };

    if (isEditing) {
        await updateDoc(doc(db, "listings", currentEditId), listingData);
    } else {
        listingData.reservations = [];
        listingData.createdAt = new Date();
        await addDoc(collection(db, "listings"), listingData);
    }
    location.reload();
};

// POBIERANIE DANYCH
onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (snap) => {
    const cont = document.getElementById('listings-container');
    cont.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="listing-header">
                <h3>Odbiór u: ${d.sellerName}</h3>
                <p>📍 ${d.address} | ⏰ ${d.pickupTimes}</p>
            </div>
            ${d.items.map((it, idx) => `
                <div class="product-item-list">
                    ${it.imageUrl ? `<img src="${it.imageUrl}" class="thumb">` : '🖼️'}
                    <div style="flex:1">
                        <b>${it.name}</b><br>
                        <small>${it.price} zł / ${it.unit}</small>
                    </div>
                </div>
            `).join('')}
            <div style="padding:20px; display:flex; gap:10px">
                <button class="btn-primary" onclick="openOrderModal('${id}')">🛒 Zamów</button>
                <button class="btn-secondary" onclick="authSeller('${id}', '${d.pin}')">⚙️ Panel</button>
            </div>
        `;
        cont.appendChild(card);
    });
});

// LOGIKA ZAMÓWIENIA
window.openOrderModal = async (id, editIdx = null) => {
    currentEditId = id;
    editingResIndex = editIdx;
    const snap = await getDoc(doc(db, "listings", id));
    const d = snap.data();
    const container = document.getElementById('modal-order-items');
    container.innerHTML = '';
    
    document.getElementById('res-modal-title').innerText = editIdx !== null ? "Zmień zamówienie" : "Złóż zamówienie";
    if(editIdx !== null) {
        document.getElementById('buyerName').value = d.reservations[editIdx].buyerName;
        document.getElementById('buyerPickupTime').value = d.reservations[editIdx].time;
    }

    d.items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'product-item-list';
        row.innerHTML = `
            <span>${it.name}</span>
            <div class="qty-control">
                <button class="qty-btn" onclick="this.nextElementSibling.stepDown(); updateSum()">-</button>
                <input type="number" class="order-qty" data-price="${it.price}" step="${it.step}" value="0" min="0" onchange="updateSum()">
                <button class="qty-btn" onclick="this.previousElementSibling.stepUp(); updateSum()">+</button>
            </div>
        `;
        container.appendChild(row);
    });
    document.getElementById('reservation-modal').classList.remove('hidden');
};

window.updateSum = () => {
    let total = 0;
    document.querySelectorAll('.order-qty').forEach(i => total += i.value * i.dataset.price);
    document.getElementById('modal-total-price').innerText = total.toFixed(2);
};

document.getElementById('confirm-booking-btn').onclick = async () => {
    const buyerName = document.getElementById('buyerName').value;
    const time = document.getElementById('buyerPickupTime').value;
    const items = [];
    document.querySelectorAll('.order-qty').forEach((input, idx) => {
        if(input.value > 0) items.push({ name: document.querySelectorAll('.product-item-list span')[idx].innerText, qty: input.value });
    });

    const ref = doc(db, "listings", currentEditId);
    const snap = await getDoc(ref);
    let res = snap.data().reservations;

    if(editingResIndex !== null) {
        res[editingResIndex] = { buyerName, time, items };
        await updateDoc(ref, { reservations: res });
    } else {
        await updateDoc(ref, { reservations: arrayUnion({ buyerName, time, items }) });
    }
    location.reload();
};

// PANEL SPRZEDAWCY
window.authSeller = async (id, pin) => {
    if(prompt("Podaj PIN:") !== pin) return alert("Błędny PIN");
    currentEditId = id;
    const snap = await getDoc(doc(db, "listings", id));
    const d = snap.data();
    
    const resCont = document.getElementById('reservations-container');
    resCont.innerHTML = '<h4>Rezerwacje:</h4>';
    d.reservations.forEach((r, idx) => {
        resCont.innerHTML += `
            <div class="glass-card-dark">
                <b>${r.buyerName}</b> (${r.time})<br>
                ${r.items.map(i => `${i.qty} x ${i.name}`).join(', ')}
                <button onclick="openOrderModal('${id}', ${idx})" style="font-size:0.7rem; background:orange; color:white; border:none; border-radius:5px; margin-left:10px">Edytuj zamówienie sąsiada</button>
            </div>
        `;
    });
    document.getElementById('seller-modal').classList.remove('hidden');
};

// POBIERANIE CSV
document.getElementById('download-report-btn').onclick = async () => {
    const snap = await getDoc(doc(db, "listings", currentEditId));
    const d = snap.data();
    let csv = "Sąsiad;Kiedy;Zamówienie\n";
    d.reservations.forEach(r => {
        csv += `${r.buyerName};${r.time};${r.items.map(i => `${i.qty} ${i.name}`).join(' | ')}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `zamowienia_${d.sellerName}.csv`;
    link.click();
};

document.getElementById('edit-listing-btn').onclick = async () => {
    isEditing = true;
    const snap = await getDoc(doc(db, "listings", currentEditId));
    const d = snap.data();
    
    document.getElementById('sellerName').value = d.sellerName;
    document.getElementById('pickupAddress').value = d.address;
    document.getElementById('pickupTimes').value = d.pickupTimes;
    document.getElementById('pin').value = d.pin;
    
    const productsCont = document.getElementById('products-to-add');
    productsCont.innerHTML = '';
    d.items.forEach(it => productsCont.appendChild(createProductFields(it)));
    
    document.getElementById('seller-modal').classList.add('hidden');
    document.getElementById('add-listing-modal').classList.remove('hidden');
    document.getElementById('modal-title').innerText = "Modyfikuj ofertę";
};

document.getElementById('delete-listing-btn').onclick = async () => {
    if(confirm("Usunąć ogłoszenie?")) {
        await deleteDoc(doc(db, "listings", currentEditId));
        location.reload();
    }
};

window.closeModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));