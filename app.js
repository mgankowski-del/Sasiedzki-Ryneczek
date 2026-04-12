import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, addDoc, runTransaction, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

const announcementsCol = collection(db, "announcements");
const ordersCol = collection(db, "orders");

let currentAnnouncements = [];

// 1. POBIERANIE OGŁOSZEŃ
const q = query(announcementsCol, orderBy("createdAt", "desc"));
onSnapshot(q, (snap) => {
    currentAnnouncements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBoard();
});

// 2. WYŚWIETLANIE TABLICY
function renderBoard() {
    const board = document.getElementById("announcementsBoard");
    if (!board) return;
    board.innerHTML = "";

    currentAnnouncements.forEach(ann => {
        const card = document.createElement("div");
        card.className = "post-card";
        
        const isCompletelySoldOut = ann.products.every(p => p.available <= 0);

        let productsHtml = ann.products.map(p => `
            <div class="product-preview-row">
                ${p.photoUrl ? `<img src="${p.photoUrl}" class="mini-img" alt="${p.name}">` : `<div class="mini-img-placeholder">🍽️</div>`}
                <div class="prod-info">
                    <strong style="color:#1e3a8a;">${p.name}</strong>
                    <div style="font-size: 0.85rem; color:#64748b;">${p.ingredients}</div>
                    <div style="font-size: 0.9rem; margin-top:4px;">
                        <span style="color:#059669; font-weight:bold;">${parseFloat(p.price).toFixed(2)} zł / ${p.unit}</span> 
                        | Dostępne: ${p.available}
                    </div>
                </div>
            </div>
        `).join("");

        card.innerHTML = `
            <div class="card-content">
                <h3 style="margin-top: 0; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">
                    👨‍🍳 Oferta od: <span style="color: #2563eb;">${ann.sellerName}</span>
                </h3>
                
                <div class="products-list-preview">
                    ${productsHtml}
                </div>

                ${isCompletelySoldOut 
                    ? '<div class="sold-out" style="margin-top:15px;">Wszystko wyprzedane!</div>' 
                    : `<button class="primary-btn" style="width: 100%; margin-top: 15px;" onclick="openOrderModal('${ann.id}')">Chcę kupić od tej osoby</button>`}
            </div>
        `;
        board.appendChild(card);
    });
}

// 3. DODAWANIE OGŁOSZEŃ (Stoiska z wieloma produktami)
window.generateProductForms = () => {
    const count = parseInt(document.getElementById('productsCount').value) || 1;
    const container = document.getElementById('dynamicProductsContainer');
    container.innerHTML = '';

    for (let i = 0; i < count; i++) {
        container.innerHTML += `
            <div class="product-subform">
                <h4 style="color: #1e3a8a; margin-bottom: 15px; margin-top: 0;">📦 Produkt #${i + 1}</h4>
                <div class="form-group">
                    <label>Zdjęcie potrawy</label>
                    <input type="file" id="productPhoto_${i}" accept="image/*" style="padding: 10px; border: 1px dashed #cbd5e1;">
                </div>
                <div class="form-group">
                    <label>Nazwa (Co to jest?)</label>
                    <input type="text" id="postName_${i}" placeholder="np. Domowe pierogi">
                </div>
                <div class="form-group">
                    <label>Składniki / Alergeny</label>
                    <textarea id="postIngredients_${i}" placeholder="np. mąka, ser..."></textarea>
                </div>
                <div style="display: flex; gap: 10px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Cena (zł)</label>
                        <input type="number" id="postPrice_${i}" step="0.01">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Jednostka</label>
                        <input type="text" id="postUnit_${i}" placeholder="np. słoik">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label>Ile masz łącznie?</label>
                    <input type="number" id="postQty_${i}" step="1">
                </div>
            </div>
        `;
    }
};

window.openAddModal = () => {
    document.getElementById('productsCount').value = 1;
    generateProductForms();
    document.getElementById('addModal').classList.add('active');
};

const saveBtn = document.getElementById("saveAnnouncementBtn");
if (saveBtn) {
    saveBtn.onclick = async () => {
        const count = parseInt(document.getElementById('productsCount').value) || 1;
        const seller = document.getElementById("sellerName").value.trim();
        const pin = document.getElementById("postPin").value;

        if (!seller || !pin) return alert("Podaj swoje imię i PIN na samym dole!");

        let productsDataArray = [];
        
        for (let i = 0; i < count; i++) {
            const fileInput = document.getElementById(`productPhoto_${i}`);
            const file = fileInput.files[0];
            const name = document.getElementById(`postName_${i}`).value.trim();
            const ingredients = document.getElementById(`postIngredients_${i}`).value.trim();
            const price = parseFloat(document.getElementById(`postPrice_${i}`).value);
            const unit = document.getElementById(`postUnit_${i}`).value.trim();
            const available = parseFloat(document.getElementById(`postQty_${i}`).value);

            if (!name || isNaN(price) || !file || !unit || isNaN(available)) {
                return alert(`Uzupełnij wszystkie dane i dodaj zdjęcie dla Produktu #${i + 1}!`);
            }
            productsDataArray.push({ file, name, ingredients, price, unit, available });
        }

        const btn = document.getElementById("saveAnnouncementBtn");
        btn.disabled = true;
        btn.innerText = "Wysyłanie danych...";

        try {
            let finalProductsList = [];

            for (let prod of productsDataArray) {
                const storageRef = ref(storage, 'products/' + Date.now() + "_" + prod.file.name);
                await uploadBytes(storageRef, prod.file);
                const photoUrl = await getDownloadURL(storageRef);

                finalProductsList.push({
                    name: prod.name,
                    ingredients: prod.ingredients,
                    price: prod.price,
                    unit: prod.unit,
                    available: prod.available,
                    photoUrl: photoUrl
                });
            }

            await addDoc(announcementsCol, {
                sellerName: seller,
                pin: pin,
                products: finalProductsList,
                createdAt: new Date().toISOString()
            });

            document.getElementById("addModal").classList.remove("active");
            alert("Twoje stoisko opublikowane!");
            document.getElementById("sellerName").value = "";
            document.getElementById("postPin").value = "";

        } catch (e) {
            alert("Błąd: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Opublikuj wszystko";
        }
    };
}

// 4. ZAMAWIANIE (Koszyk na wiele produktów)
let currentOrderState = {}; 
let selectedAnnouncement = null;

window.openOrderModal = (announcementId) => {
    selectedAnnouncement = currentAnnouncements.find(a => a.id === announcementId);
    currentOrderState = {}; 
    
    document.getElementById("modalTitle").innerText = `Zamówienie od: ${selectedAnnouncement.sellerName}`;
    const listContainer = document.getElementById("productsSelectionList");
    listContainer.innerHTML = "";
    
    selectedAnnouncement.products.forEach((prod, index) => {
        if (prod.available > 0) {
            currentOrderState[index] = { name: prod.name, qty: 0, max: prod.available, price: prod.price };
            
            listContainer.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 10px;">
                    <div style="flex: 1; padding-right: 10px;">
                        <strong style="color: #1e3a8a; font-size: 1.1rem;">${prod.name}</strong><br>
                        <small style="color: #64748b;">${parseFloat(prod.price).toFixed(2)} zł / ${prod.unit} (Dostępne: ${prod.available})</small>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button type="button" class="qty-btn" onclick="changeQty(${index}, -1)">-</button>
                        <span id="qty-val-${index}" style="font-weight: 800; font-size: 1.1rem; width: 30px; text-align: center;">0</span>
                        <button type="button" class="qty-btn" onclick="changeQty(${index}, 1)">+</button>
                    </div>
                </div>
            `;
        }
    });
    
    updateTotalCost();
    document.getElementById("orderModal").classList.add("active");
};

window.changeQty = (index, delta) => {
    let item = currentOrderState[index];
    let newVal = item.qty + delta;
    if (newVal >= 0 && newVal <= item.max) {
        item.qty = newVal;
        document.getElementById(`qty-val-${index}`).innerText = item.qty;
        updateTotalCost();
    }
};

function updateTotalCost() {
    let total = 0;
    for (let idx in currentOrderState) {
        total += currentOrderState[idx].qty * currentOrderState[idx].price;
    }
    document.getElementById("totalCostValue").innerText = total.toFixed(2) + " zł";
}

// 5. TRANSAKCJA ZAMÓWIENIA
const confirmOrderBtn = document.getElementById("confirmOrderBtn");
if(confirmOrderBtn) {
    confirmOrderBtn.onclick = async () => {
        const name = document.getElementById("customerName").value.trim();
        const address = document.getElementById("customerAddress").value.trim();
        const phone = document.getElementById("customerPhone").value.trim();

        if (!name || !address || !phone) return alert("Podaj swoje dane kontaktowe!");

        let orderedItems = Object.keys(currentOrderState)
            .filter(idx => currentOrderState[idx].qty > 0)
            .map(idx => ({
                index: parseInt(idx),
                name: currentOrderState[idx].name,
                qty: currentOrderState[idx].qty,
                price: currentOrderState[idx].price
            }));

        if (orderedItems.length === 0) return alert("Wybierz przynajmniej jeden produkt (użyj '+')!");

        const customerData = { name, address, phone, timestamp: new Date().toISOString() };
        const btn = document.getElementById("confirmOrderBtn");

        try {
            btn.innerText = "Przetwarzanie...";
            btn.disabled = true;

            const announcementRef = doc(db, "announcements", selectedAnnouncement.id);
            let finalCost = 0;
            
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(announcementRef);
                if (!sfDoc.exists()) throw "Ogłoszenie już nie istnieje!";
                
                let data = sfDoc.data();
                let updatedProducts = [...data.products];

                for (let item of orderedItems) {
                    let dbProd = updatedProducts[item.index];
                    if (dbProd.available < item.qty) {
                        throw `Niestety, zostało już tylko ${dbProd.available} x ${dbProd.name}.`;
                    }
                    dbProd.available -= item.qty;
                    finalCost += item.qty * item.price;
                }

                transaction.update(announcementRef, { products: updatedProducts });
                
                customerData.totalCost = finalCost;
                customerData.announcementId = selectedAnnouncement.id;
                customerData.sellerName = data.sellerName;
                customerData.items = orderedItems.map(i => ({ name: i.name, qty: i.qty }));
            });
            
            await addDoc(ordersCol, customerData);

            document.getElementById("orderModal").classList.remove("active");
            document.getElementById("successTotal").innerText = finalCost.toFixed(2) + " zł";
            document.getElementById("successModal").classList.add("active");
            
            document.getElementById("customerName").value = "";
            document.getElementById("customerAddress").value = "";
            document.getElementById("customerPhone").value = "";

        } catch (error) {
            alert("Błąd: " + error);
        } finally {
            btn.innerText = "Złóż zamówienie";
            btn.disabled = false;
        }
    };
}