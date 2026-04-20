// ════════════════════════════════════════════════
//  APOGUARD — script.js
// ════════════════════════════════════════════════

const SUPABASE_URL      = 'https://spavhlrmpakdnrqvkhss.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_repKElw3DDdSsVKDmS-m-Q_vA-es2nP'

const { createClient } = supabase
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const DAYS_LIMIT = 7

let currentUserId    = null
let currentUserEmail = null
let inventoryCache   = []
let appInitialized   = false   // ← FIX: cegah duplicate event listener

// ════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════
async function initAuth () {
  const { data: { session } } = await sb.auth.getSession()
  if (session) showApp(session.user)
  else         showLogin()
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session.user)
    else         showLogin()
  })
}

function showLogin () {
  currentUserId = null; currentUserEmail = null
  document.getElementById('login-page').style.display = 'flex'
  document.getElementById('app-page').style.display   = 'none'
}

function showApp (user) {
  currentUserId    = user.id
  currentUserEmail = user.email || '—'
  document.getElementById('login-page').style.display = 'none'
  document.getElementById('app-page').style.display   = 'flex'
  document.getElementById('user-email-display').textContent = currentUserEmail
  document.getElementById('user-avatar').textContent        = currentUserEmail[0].toUpperCase()
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  document.getElementById('dateDisplay').textContent = new Date().toLocaleDateString('id-ID', dateOptions)
  lucide.createIcons()
  initApp()
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const email    = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  if (!email || !password) { showLoginAlert('Email dan password wajib diisi.'); return }
  const btn = document.getElementById('btn-login')
  btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2"></i> Memproses...'; lucide.createIcons()
  const { error } = await sb.auth.signInWithPassword({ email, password })
  btn.disabled = false; btn.innerHTML = '<i data-lucide="log-in"></i> Masuk'; lucide.createIcons()
  if (error) showLoginAlert('Email atau password salah. Silakan coba lagi.')
})
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-login').click()
})
document.getElementById('btn-logout').addEventListener('click', async () => { await sb.auth.signOut() })
function showLoginAlert (msg) {
  const el = document.getElementById('login-alert'); el.textContent = msg; el.style.display = 'block'
}

// ════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════
function initApp () {
  if (!appInitialized) {
    setupNav()
    setupForms()
    appInitialized = true
  }
  renderTables()
  syncInventoryUI()
}

// ════════════════════════════════════════════════
//  NAVIGASI
// ════════════════════════════════════════════════
function setupNav () {
  const navItems = {
    'menu-pos':'view-pos','menu-history':'view-history',
    'menu-alerts':'view-alerts','menu-inventory':'view-inventory'
  }
  Object.keys(navItems).forEach(menuId => {
    const el = document.getElementById(menuId)
    if (!el) return
    el.addEventListener('click', (e) => {
      e.preventDefault()
      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'))
      document.querySelectorAll('.view-section').forEach(x => x.classList.remove('active'))
      e.currentTarget.classList.add('active')
      document.getElementById(navItems[menuId]).classList.add('active')
      renderTables(); syncInventoryUI()
    })
  })
}

// ════════════════════════════════════════════════
//  DATABASE — INVENTORI (per apotek)
//  Tambahkan kolom max_purchase INT DEFAULT 2 di Supabase
// ════════════════════════════════════════════════
async function getInventory () {
  const { data, error } = await sb.from('inventory').select('*')
    .eq('user_id', currentUserId).order('name')
  if (error) { console.error('getInventory:', error); return [] }

  if (data.length === 0) {
    const pfx = currentUserId.substr(0, 8)
    const seeds = [
      { id: `inv-${pfx}-1`, user_id: currentUserId, name: 'Dextromethorphan (Sirup Batuk)', stock: 50, max_purchase: 2 },
      { id: `inv-${pfx}-2`, user_id: currentUserId, name: 'Pseudoephedrine (Tablet Flu)',   stock: 50, max_purchase: 2 },
      { id: `inv-${pfx}-3`, user_id: currentUserId, name: 'Tramadol (Nyeri)',               stock: 50, max_purchase: 1 },
      { id: `inv-${pfx}-4`, user_id: currentUserId, name: 'Chlorpheniramine (Antihistamin)',stock: 50, max_purchase: 3 },
    ]
    const { error: se } = await sb.from('inventory').insert(seeds)
    if (se) console.error('seed:', se)
    return seeds
  }
  return data.map(d => ({ ...d, max_purchase: d.max_purchase ?? 2 }))
}

async function updateInventoryStock (id, newStock) {
  const { error } = await sb.from('inventory').update({ stock: newStock })
    .eq('id', id).eq('user_id', currentUserId)
  if (error) console.error('updateInventoryStock:', error)
}

async function updateInventoryMaxPurchase (id, maxPurchase) {
  const { error } = await sb.from('inventory').update({ max_purchase: maxPurchase })
    .eq('id', id).eq('user_id', currentUserId)
  if (error) console.error('updateInventoryMaxPurchase:', error)
}

async function deleteInventoryItem (id) {
  const { error } = await sb.from('inventory').delete()
    .eq('id', id).eq('user_id', currentUserId)
  if (error) console.error('deleteInventoryItem:', error)
}

async function insertInventoryItem (item) {
  const { error } = await sb.from('inventory').insert({ ...item, user_id: currentUserId })
  if (error) console.error('insertInventoryItem:', error)
}

// ════════════════════════════════════════════════
//  DATABASE — TRANSAKSI (global)
// ════════════════════════════════════════════════
async function getTransactions (searchQuery = '') {
  let query = sb.from('transactions').select('*').order('timestamp', { ascending: false })
  if (searchQuery) query = query.or(`nik.ilike.%${searchQuery}%,medicine.ilike.%${searchQuery}%`)
  const { data, error } = await query
  if (error) { console.error('getTransactions:', error); return [] }
  return data
}

async function saveTransaction (tx) {
  const { error } = await sb.from('transactions').insert({
    ...tx, pharmacist_user_id: currentUserId, pharmacy_email: currentUserEmail,
  })
  if (error) console.error('saveTransaction:', error)
}

// FIX: workaround RLS — Supabase butuh minimal 1 kondisi non-empty di DELETE
async function clearAllTransactions () {
  const { error } = await sb.from('transactions').delete()
    .eq('pharmacist_user_id', currentUserId)
    .gt('timestamp', '1970-01-01T00:00:00Z')
  if (error) {
    console.error('clearAllTransactions:', error)
    alert('Gagal menghapus riwayat: ' + (error.message || JSON.stringify(error)))
  }
}

// ════════════════════════════════════════════════
//  RULES ENGINE — batas diambil dari max_purchase tiap obat
// ════════════════════════════════════════════════
async function checkRules (nik, medicineId, targetQty) {
  const inv = await getInventory()
  const med = inv.find(i => i.id === medicineId)

  if (!med)                  return { allowed: false, type: 'error', reason: 'Obat tidak terdaftar.' }
  if (med.stock < targetQty) return { allowed: false, type: 'error', reason: `Stok ${med.name} hanya tersisa ${med.stock} pcs.` }

  const maxPurchase = med.max_purchase ?? 2
  const timeLimit   = new Date(Date.now() - DAYS_LIMIT * 24 * 60 * 60 * 1000).toISOString()

  const { data: past, error } = await sb.from('transactions')
    .select('quantity, pharmacy_email')
    .eq('nik', nik)
    .eq('medicine', med.name)
    .eq('status', 'SUCCESS')
    .gte('timestamp', timeLimit)
  if (error) console.error('checkRules:', error)

  const accumulatedQty    = (past || []).reduce((s, tx) => s + tx.quantity, 0)
  const newTotal          = accumulatedQty + parseInt(targetQty)
  const pharmaciesServed  = [...new Set((past || []).map(t => t.pharmacy_email).filter(Boolean))]

  if (newTotal > maxPurchase) {
    const apoInfo = pharmaciesServed.length ? ` (Sudah beli di: ${pharmaciesServed.join(', ')})` : ''
    return {
      allowed: false, type: 'blocked',
      reason: `NIK ${nik} sudah membeli ${accumulatedQty} pcs ${med.name} dalam ${DAYS_LIMIT} hari terakhir${apoInfo}. Batas obat ini: ${maxPurchase} pcs / ${DAYS_LIMIT} hari.`,
      medName: med.name, med,
    }
  }
  return { allowed: true, type: 'ok', medName: med.name, med, maxPurchase }
}

// ════════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════════
function showAlert (type, title, message) {
  const container = document.getElementById('alertContainer')
  const icon = type === 'success'
    ? `<i data-lucide="check-circle" style="color:var(--success)"></i>`
    : `<i data-lucide="shield-alert" style="color:var(--danger)"></i>`
  const div = document.createElement('div')
  div.className = `alert alert-${type}`
  div.innerHTML = `${icon}<div class="alert-content"><h4>${title}</h4><p>${message}</p></div>`
  container.innerHTML = ''; container.appendChild(div)
  lucide.createIcons()
  setTimeout(() => { if (container.contains(div)) div.remove() }, 8000)
}

function setLoading (btn, loading, defaultHtml) {
  btn.disabled = loading
  btn.innerHTML = loading ? '<i data-lucide="loader-2"></i> Memproses...' : defaultHtml
  lucide.createIcons()
}

// ════════════════════════════════════════════════
//  FORMS
// ════════════════════════════════════════════════
function setupForms () {

  // Kasir
  document.getElementById('posForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const nik        = document.getElementById('nik').value.trim()
    const medicineId = document.getElementById('medicine').value
    const quantity   = parseInt(document.getElementById('quantity').value)
    if (!nik || !medicineId || !quantity) return
    const btn = e.target.querySelector('button[type="submit"]')
    const dHtml = '<i data-lucide="check-circle"></i> Validasi & Proses Transaksi'
    setLoading(btn, true, dHtml)
    const rc = await checkRules(nik, medicineId, quantity)
    setLoading(btn, false, dHtml)
    if (rc.type === 'error') { showAlert('danger', 'Gagal!', rc.reason); return }
    const txObj = {
      id: 'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      timestamp: new Date().toISOString(), nik, medicine_id: medicineId,
      medicine: rc.medName || 'Unknown', quantity,
      status: rc.allowed ? 'SUCCESS' : 'BLOCKED',
      reason: rc.allowed ? '-' : rc.reason,
    }
    await saveTransaction(txObj)
    if (rc.allowed) {
      await updateInventoryStock(medicineId, rc.med.stock - quantity)
      showAlert('success', 'Transaksi Valid',
        `KTP ${nik} sukses membeli ${quantity} pcs ${rc.medName}. (Batas: ${rc.maxPurchase} pcs / ${DAYS_LIMIT} hari)`)
      e.target.reset()
    } else {
      showAlert('danger', 'Transaksi Diblokir!', rc.reason)
    }
    await renderTables(); await syncInventoryUI()
  })

  // Form tambah inventori
  const invForm = document.getElementById('inventoryForm')
  if (invForm) {
    invForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const name        = document.getElementById('newMedicineName').value.trim()
      const stock       = parseInt(document.getElementById('newMedicineStock').value)
      const maxPurchase = parseInt(document.getElementById('newMedicineMaxPurchase').value) || 2
      const item = {
        id: `inv-${currentUserId.substr(0,8)}-${Math.random().toString(36).substr(2,5)}`,
        name, stock, max_purchase: maxPurchase,
      }
      const btn = invForm.querySelector('button[type="submit"]')
      const dHtml = '<i data-lucide="plus-circle"></i> Tambah ke Inventori'
      setLoading(btn, true, dHtml)
      await insertInventoryItem(item)
      setLoading(btn, false, dHtml)
      invForm.reset(); await syncInventoryUI()
    })
  }

  // Hapus riwayat
  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Yakin hapus semua riwayat transaksi yang dicatat apotek ini?')) return
    await clearAllTransactions(); await renderTables()
  })

  // Inventori table actions (delegasi)
  document.getElementById('inventoryTableBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    const id  = btn.getAttribute('data-id')
    const inv = await getInventory()
    const med = inv.find(i => i.id === id)
    if (!med) return

    if (btn.classList.contains('btn-del')) {
      if (!confirm(`Yakin hapus ${med.name}?`)) return
      await deleteInventoryItem(id)
    } else if (btn.classList.contains('btn-add-stok')) {
      const add = prompt(`Tambah stok untuk "${med.name}":`, '10')
      if (!add || isNaN(add)) return
      await updateInventoryStock(id, med.stock + parseInt(add))
    } else if (btn.classList.contains('btn-min-stok')) {
      const min = prompt(`Kurangi stok untuk "${med.name}":`, '5')
      if (!min || isNaN(min)) return
      if (med.stock < parseInt(min)) { alert('Stok tidak cukup!'); return }
      await updateInventoryStock(id, med.stock - parseInt(min))
    } else if (btn.classList.contains('btn-set-limit')) {
      const newLimit = prompt(
        `Batas maks pembelian per ${DAYS_LIMIT} hari untuk:\n"${med.name}"\n\nBatas saat ini: ${med.max_purchase} pcs\nMasukkan nilai baru:`,
        med.max_purchase
      )
      if (!newLimit || isNaN(newLimit) || parseInt(newLimit) < 1) return
      await updateInventoryMaxPurchase(id, parseInt(newLimit))
    }
    await syncInventoryUI()
  })

  // Search riwayat
  const sh = document.getElementById('searchHistory')
  if (sh) sh.addEventListener('input', (e) => renderTables(e.target.value))

  // Search inventori (filter lokal, tanpa round-trip DB)
  const si = document.getElementById('searchInventory')
  if (si) si.addEventListener('input', (e) => renderInventoryTable(e.target.value))
}

// ════════════════════════════════════════════════
//  RENDER INVENTORI
// ════════════════════════════════════════════════
async function syncInventoryUI () {
  inventoryCache = await getInventory()

  // Dropdown kasir
  const select = document.getElementById('medicine')
  if (select) {
    select.innerHTML = '<option value="" disabled selected>Pilih jenis obat...</option>'
    inventoryCache.forEach(med => {
      const opt = document.createElement('option')
      opt.value       = med.id
      opt.textContent = `${med.name} — Sisa: ${med.stock} | Maks: ${med.max_purchase ?? 2} pcs/${DAYS_LIMIT}hr`
      opt.disabled    = med.stock <= 0
      select.appendChild(opt)
    })
  }

  const searchVal = document.getElementById('searchInventory')?.value || ''
  renderInventoryTable(searchVal)
}

function renderInventoryTable (searchQuery = '') {
  const tbody = document.getElementById('inventoryTableBody')
  if (!tbody) return
  const q   = searchQuery.toLowerCase().trim()
  const inv = q ? inventoryCache.filter(m => m.name.toLowerCase().includes(q)) : inventoryCache

  tbody.innerHTML = ''
  if (inv.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;">${q ? 'Obat tidak ditemukan.' : 'Belum ada obat terdaftar.'}</td></tr>`
    return
  }

  inv.forEach(med => {
    const maxP = med.max_purchase ?? 2
    const tr   = document.createElement('tr')
    tr.innerHTML = `
      <td><strong>${med.name}</strong></td>
      <td>${med.stock}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:8px;">
          <strong>${maxP}</strong> pcs / ${DAYS_LIMIT} hari
          <button type="button" class="btn btn-outline btn-sm btn-set-limit" data-id="${med.id}"
            style="padding:3px 10px;font-size:0.72rem;">✏️ Ubah</button>
        </span>
      </td>
      <td>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm btn-min-stok" data-id="${med.id}">−</button>
          <button type="button" class="btn btn-outline btn-sm btn-add-stok" data-id="${med.id}">+</button>
          <button type="button" class="btn btn-sm btn-del" data-id="${med.id}"
            style="border:1px solid var(--danger);color:var(--danger);background:transparent;">Hapus</button>
        </div>
      </td>`
    tbody.appendChild(tr)
  })
}

// ════════════════════════════════════════════════
//  RENDER RIWAYAT & LOG BLOKIR
// ════════════════════════════════════════════════
async function renderTables (searchQuery = '') {
  const transactions = await getTransactions(searchQuery)
  const historyTbody = document.getElementById('historyTableBody')
  const alertsTbody  = document.getElementById('alertsTableBody')
  if (historyTbody) historyTbody.innerHTML = ''
  if (alertsTbody)  alertsTbody.innerHTML  = ''

  if (transactions.length === 0) {
    if (historyTbody) historyTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Belum ada data transaksi</td></tr>'
    if (alertsTbody)  alertsTbody.innerHTML  = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Belum ada log pelanggaran</td></tr>'
    return
  }

  transactions.forEach(tx => {
    const dateStr   = new Date(tx.timestamp).toLocaleString('id-ID')
    const isSuccess = tx.status === 'SUCCESS'
    const isMine    = tx.pharmacist_user_id === currentUserId
    const apoTag    = tx.pharmacy_email
      ? `<br><span style="font-size:0.7rem;color:var(--text-muted)">${tx.pharmacy_email}</span>` : ''
    const rowBg     = isMine ? '' : 'background:#fafbff;'

    if (historyTbody) {
      const tr = document.createElement('tr')
      tr.setAttribute('style', rowBg)
      tr.innerHTML = `
        <td>${dateStr}${apoTag}</td>
        <td><strong>${tx.nik}</strong></td>
        <td>${tx.medicine}</td>
        <td>${tx.quantity}</td>
        <td><span class="badge ${isSuccess ? 'badge-success' : 'badge-danger'}">${tx.status}</span></td>`
      historyTbody.appendChild(tr)
    }

    if (!isSuccess && alertsTbody) {
      const trA = document.createElement('tr')
      trA.setAttribute('style', rowBg)
      trA.innerHTML = `
        <td>${dateStr}${apoTag}</td>
        <td><strong>${tx.nik}</strong></td>
        <td>${tx.medicine}</td>
        <td>${tx.quantity}</td>
        <td class="text-danger">${tx.reason}</td>`
      alertsTbody.appendChild(trA)
    }
  })
}

// ════════════════════════════════════════════════
//  ENTRY POINT
// ════════════════════════════════════════════════
initAuth()
