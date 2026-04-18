document.addEventListener('DOMContentLoaded', () => {
    // === UI INITIALIZATION ===
    // Set Date
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('dateDisplay').textContent = new Date().toLocaleDateString('id-ID', dateOptions);

    // Sidebar Navigation
    const navItems = {
        'menu-pos': 'view-pos',
        'menu-history': 'view-history',
        'menu-alerts': 'view-alerts',
        'menu-inventory': 'view-inventory'
    };

    Object.keys(navItems).forEach(menuId => {
        const menuEl = document.getElementById(menuId);
        if(menuEl) {
            menuEl.addEventListener('click', (e) => {
                e.preventDefault();
                // Remove active classes
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
                
                // Add active class
                e.currentTarget.classList.add('active');
                document.getElementById(navItems[menuId]).classList.add('active');

                // Re-render
                renderTables();
                syncInventoryUI();
            });
        }
    });

    // === DATA MANAGEMENT (LocalStorage) ===
    const STORAGE_KEY = 'apoguard_transactions';
    const INV_KEY = 'apoguard_inventory';

    // -- Inventori --
    function getInventory() {
        let data = localStorage.getItem(INV_KEY);
        if (!data) {
            data = [
                { id: 'inv-1', name: 'Dextromethorphan (Sirup Batuk)', stock: 50 },
                { id: 'inv-2', name: 'Pseudoephedrine (Tablet Flu)', stock: 50 },
                { id: 'inv-3', name: 'Tramadol (Nyeri)', stock: 50 },
                { id: 'inv-4', name: 'Chlorpheniramine (Antihistamin)', stock: 50 }
            ];
            localStorage.setItem(INV_KEY, JSON.stringify(data));
        } else {
            data = JSON.parse(data);
        }
        return data;
    }

    function saveInventory(data) {
        localStorage.setItem(INV_KEY, JSON.stringify(data));
        syncInventoryUI();
    }

    // -- Transaksi --
    function getTransactions() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    function saveTransaction(tx) {
        const data = getTransactions();
        data.push(tx);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function clearHistory() {
        if(confirm('Apakah Anda yakin ingin menghapus semua history riwayat?')) {
            localStorage.removeItem(STORAGE_KEY);
            renderTables();
            showAlert('success', 'Berhasil', 'Seluruh data riwayat transaksi telah dihapus.');
        }
    }
    
    document.getElementById('btn-clear-history').addEventListener('click', clearHistory);

    // === RULES ENGINE ===
    const MAX_ITEMS = 2;
    const DAYS_LIMIT = 7;

    function checkRules(nik, medicineId, targetQty) {
        // Cek Inventori dulu
        const inv = getInventory();
        const med = inv.find(i => i.id === medicineId);
        
        if (!med) return { allowed: false, type: 'error', reason: "Obat tidak terdaftar di sistem." };
        if (med.stock < targetQty) return { allowed: false, type: 'error', reason: `Gagal diproses! Sisa stok ${med.name} di inventori hanya ${med.stock} pcs.`};
        
        // Cek Riwayat Penyalahgunaan
        const transactions = getTransactions();
        const now = new Date();
        const timeLimit = now.getTime() - (DAYS_LIMIT * 24 * 60 * 60 * 1000);

        // Filter valid historical purchases for EXACT SAME NIK and MEDICINE
        const pastPurchases = transactions.filter(tx => 
            tx.nik === nik && 
            tx.medicineId === medicineId && 
            tx.status === 'SUCCESS' &&
            new Date(tx.timestamp).getTime() > timeLimit
        );

        let accumulatedQty = 0;
        pastPurchases.forEach(tx => {
            accumulatedQty += tx.quantity;
        });

        const newTotal = accumulatedQty + parseInt(targetQty);

        if (newTotal > MAX_ITEMS) {
            return {
                allowed: false,
                type: 'abuse',
                reason: `Batas aturan terlampaui. Total limit adalah ${MAX_ITEMS} botol/pcs dalam ${DAYS_LIMIT} hari. (Sebelumnya sudah membeli ${accumulatedQty} + permintaan baru ${targetQty} = ${newTotal}). Indikasi Penyalahgunaan.`,
                medName: med.name
            };
        }

        return { allowed: true, type: 'success', medName: med.name };
    }

    // === UI HELPERS ===
    function showAlert(type, title, message) {
        const container = document.getElementById('alertContainer');
        
        let iconHtml = type === 'success' 
            ? `<i data-lucide="check-circle" style="color:var(--success)"></i>` 
            : `<i data-lucide="shield-alert" style="color:var(--danger)"></i>`;

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = `
            ${iconHtml}
            <div class="alert-content">
                <h4>${title}</h4>
                <p>${message}</p>
            </div>
        `;

        container.innerHTML = '';
        container.appendChild(alertDiv);
        lucide.createIcons();

        setTimeout(() => {
            if(container.contains(alertDiv)) {
                alertDiv.remove();
            }
        }, 8000);
    }

    // === FORM KASIR HANDLING ===
    const posForm = document.getElementById('posForm');
    
    posForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nik = document.getElementById('nik').value;
        const medicineId = document.getElementById('medicine').value;
        const quantity = parseInt(document.getElementById('quantity').value);

        if(!nik || !medicineId || !quantity) return;

        // 1. Check rules & stock
        const ruleCheck = checkRules(nik, medicineId, quantity);

        // Pencegahan Kasus Error Sistem (Misal: Kehabisan Stok)
        // Jangan catat ke log sejarah pelanggaran, karena ini murni error!
        if (ruleCheck.type === 'error') {
            showAlert('danger', 'Gagal Memproses!', ruleCheck.reason);
            return; // LANGSUNG BERHENTI, jangan disave
        }

        // 2. Create Transaction Obj
        const txObj = {
            id: 'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            timestamp: new Date().toISOString(),
            nik: nik,
            medicineId: medicineId,
            medicine: ruleCheck.medName || 'Unknown',
            quantity: quantity,
            status: ruleCheck.allowed ? 'SUCCESS' : 'BLOCKED',
            reason: ruleCheck.allowed ? '-' : ruleCheck.reason
        };

        // 3. Save Log
        saveTransaction(txObj);

        // 4. Update UI & Deduct Stock
        if (ruleCheck.allowed) {
            // Deduct Stock
            let inv = getInventory();
            let medIndex = inv.findIndex(i => i.id === medicineId);
            if(medIndex !== -1) {
                inv[medIndex].stock -= quantity;
                saveInventory(inv);
            }

            showAlert('success', 'Transaksi Valid', `KTP ${nik} sukses membeli ${quantity} ${ruleCheck.medName}. Stok berhasil dipotong.`);
            posForm.reset(); 
        } else {
            showAlert('danger', 'Transaksi Diblokir!', `KTP ${nik}: ${ruleCheck.reason}`);
        }

        renderTables(); 
    });

    // === FORM INVENTORY HANDLING ===
    const invForm = document.getElementById('inventoryForm');
    if(invForm) {
        invForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('newMedicineName').value;
            const stock = parseInt(document.getElementById('newMedicineStock').value);
            
            let inv = getInventory();
            inv.push({
                id: 'inv-' + Math.random().toString(36).substr(2, 9),
                name: name,
                stock: stock
            });
            saveInventory(inv);
            
            showAlert('success', 'Berhasil', `Obat baru ${name} ditambahkan ke inventori dengan stok awal ${stock}.`);
            invForm.reset();
        });
    }

    // Table Event Delegation for Delete/Adjust
    document.getElementById('inventoryTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if(!btn) return;
        
        const id = btn.getAttribute('data-id');
        let inv = getInventory();
        const medIndex = inv.findIndex(i => i.id === id);
        if(medIndex === -1) return;

        if (btn.classList.contains('btn-del')) {
            if(confirm(`Yakin hapus ${inv[medIndex].name} dari inventori?`)) {
                inv.splice(medIndex, 1);
                saveInventory(inv);
            }
        } else if (btn.classList.contains('btn-add-stok')) {
             let add = prompt(`Masukkan jumlah stok yang ditambahkan untuk ${inv[medIndex].name}:`, "10");
             if (add && !isNaN(add)) {
                 inv[medIndex].stock += parseInt(add);
                 saveInventory(inv);
             }
        } else if (btn.classList.contains('btn-min-stok')) {
             let min = prompt(`Masukkan jumlah stok yang dikurangi untuk ${inv[medIndex].name}:`, "5");
             if (min && !isNaN(min)) {
                 if (inv[medIndex].stock < parseInt(min)) {
                     alert('Stok tidak cukup untuk dikurangi!');
                     return;
                 }
                 inv[medIndex].stock -= parseInt(min);
                 saveInventory(inv);
             }
        }
    });

    // === RENDER INVENTORY UI ===
    function syncInventoryUI() {
        const inv = getInventory();
        
        // 1. Sync Dropdown in POS
        const select = document.getElementById('medicine');
        if(select) {
            select.innerHTML = '<option value="" disabled selected>Pilih jenis obat...</option>';
            inv.forEach(med => {
                const opt = document.createElement('option');
                opt.value = med.id;
                opt.textContent = `${med.name} (Sisa: ${med.stock})`;
                opt.disabled = med.stock <= 0;
                select.appendChild(opt);
            });
        }
        
        // 2. Sync Inventory Table
        const tbody = document.getElementById('inventoryTableBody');
        if(tbody) {
            tbody.innerHTML = '';
            if(inv.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Belum ada obat terdaftar.</td></tr>';
            } else {
                inv.forEach(med => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${med.name}</strong></td>
                        <td>${med.stock}</td>
                        <td>
                            <div style="display:flex; gap:8px;">
                                <button type="button" class="btn btn-outline btn-sm btn-min-stok" data-id="${med.id}" title="Kurangi Stok">-</button>
                                <button type="button" class="btn btn-outline btn-sm btn-add-stok" data-id="${med.id}" title="Tambah Stok">+</button>
                                <button type="button" class="btn btn-sm btn-del" data-id="${med.id}" style="border: 1px solid var(--danger); color:var(--danger); background:transparent;" title="Hapus">Hapus</button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }
    }

    // === RENDER HISTORY TABLES ===
    function renderTables(searchQuery = '') {
        let transactions = getTransactions();
        
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            transactions = transactions.filter(tx => 
                tx.nik.toLowerCase().includes(lowerQuery) || 
                tx.medicine.toLowerCase().includes(lowerQuery)
            );
        }
        
        // Sort newest first
        transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const historyTbody = document.getElementById('historyTableBody');
        const alertsTbody = document.getElementById('alertsTableBody');
        
        if(historyTbody) historyTbody.innerHTML = '';
        if(alertsTbody) alertsTbody.innerHTML = '';

        if(transactions.length === 0) {
            if(historyTbody) historyTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Belum ada data transaksi</td></tr>';
            if(alertsTbody) alertsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Belum ada log pelanggaran</td></tr>';
            return;
        }

        transactions.forEach(tx => {
            const dateStr = new Date(tx.timestamp).toLocaleString('id-ID');
            const isSuccess = tx.status === 'SUCCESS';

            // All Transactions row
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td><strong>${tx.nik}</strong></td>
                <td>${tx.medicine}</td>
                <td>${tx.quantity}</td>
                <td><span class="badge ${isSuccess ? 'badge-success' : 'badge-danger'}">${tx.status}</span></td>
            `;
            if(historyTbody) historyTbody.appendChild(tr);

            // Blocked Alerts row
            if(!isSuccess) {
                const trAlert = document.createElement('tr');
                trAlert.innerHTML = `
                    <td>${dateStr}</td>
                    <td><strong>${tx.nik}</strong></td>
                    <td>${tx.medicine}</td>
                    <td>${tx.quantity}</td>
                    <td class="text-danger">${tx.reason}</td>
                `;
                if(alertsTbody) alertsTbody.appendChild(trAlert);
            }
        });
    }

    // Initial renders
    renderTables();
    syncInventoryUI();

    // History Search Feature
    const searchInput = document.getElementById('searchHistory');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderTables(e.target.value);
        });
    }
});
