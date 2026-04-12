// ... (początek kodu bez zmian) ...

window.openOrderModal = async (id, editIdx = null) => {
    currentEditId = id;
    editingResIndex = editIdx;
    const snap = await getDoc(doc(db, "listings", id));
    const d = snap.data();
    cachedListingData = d;
    
    const container = document.getElementById('modal-order-items');
    container.innerHTML = '';
    
    d.items.forEach((it) => {
        const rem = getRem(it.name, it.totalQty, d.reservations, editingResIndex);
        const startVal = (editingResIndex !== null) ? (d.reservations[editingResIndex].items.find(i => i.name === it.name)?.qty || 0) : 0;
        
        // NOWY UKŁAD MOBILNY: Nazwa nad suwakiem
        const row = document.createElement('div');
        row.className = 'order-row-mobile';
        row.innerHTML = `
            <div class="order-row-info">
                <b>${it.name}</b>
                <small>Dostępne: ${rem} ${it.unit}</small>
            </div>
            <div class="qty-control">
                <button type="button" class="qty-btn" onclick="this.nextElementSibling.innerText = Math.max(0, parseFloat(this.nextElementSibling.innerText) - ${it.step}).toFixed(2); updateSum();">-</button>
                <span class="order-qty-val" data-name="${it.name}" data-price="${it.price}">${startVal}</span>
                <button type="button" class="qty-btn" onclick="if(parseFloat(this.previousElementSibling.innerText) + ${it.step} <= ${rem}) { this.previousElementSibling.innerText = (parseFloat(this.previousElementSibling.innerText) + ${it.step}).toFixed(2); updateSum(); } else { alert('Brak towaru!'); }">+</button>
            </div>
        `;
        container.appendChild(row);
    });

    // Pamięć Imienia i PINu
    if (editingResIndex === null) {
        document.getElementById('buyerName').value = localStorage.getItem('ryneczek_name') || '';
        document.getElementById('buyerPin').value = localStorage.getItem('ryneczek_pin') || '';
    }

    document.getElementById('reservation-modal').classList.remove('hidden');
    updateSum();
};

// ... (reszta kodu bez zmian) ...