// ════════════════════════════════════════════════
//  APOGUARD — script.js
//  Ganti dua baris di bawah ini dengan kredensial Supabase kamu
// ════════════════════════════════════════════════

const SUPABASE_URL      = 'https://spavhlrmpakdnrqvkhss.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_repKElw3DDdSsVKDmS-m-Q_vA-es2nP'

// ────────────────────────────────────────────────
const { createClient } = supabase
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════
const MAX_ITEMS  = 2
const DAYS_LIMIT = 7

// ════════════════════════════════════════════════
//  STATE — user aktif
// ════════════════════════════════════════════════
let currentUserId  = null   // UUID dari Supabase auth
let currentUserEmail = null

// ════════════════════════════════════════════════
//  AUTH — LOGIN / LOGOUT
// ════════════════════════════════════════════════
async function initAuth () {
  const { data: { session } } = await sb.auth.getSession()
  if (session) {
    showApp(session.user)
  } else {
    showLogin()
  }

  sb.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session.user)
    else         showLogin()
  })
}

function showLogin () {
  currentUserId    = null
  currentUserEmail = null
  document.getElementById('login-page').style.display = 'flex'
  document.getElementById('app-page').style.display   = 'none'
}

function showApp (user) {
  currentUserId    = user.id
  currentUserEmail = user.email || '—'

  document.getElementById('login-page').style.display = 'none'
  document.getElementById('app-page').style.display   = 'flex'

  // Tampilkan email apoteker
  document.getElementById('user-email-display').textContent = currentUserEmail
  document.getElementById('user-avatar').textContent = currentUserEmail[0].toUpperCase()

  // Set tanggal
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  document.getElementById('dateDisplay').textContent = new Date().toLocaleDateString('id-ID', dateOptions)

  // Inisialisasi ikon & data
  lucide.createIcons()
  initApp()
}

// Tombol Login
document.getElementById('btn-login').addEventListener('click', async () => {
  const email    = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value

  if (!email || !password) {
    showLoginAlert('Email dan password wajib diisi.')
    return
  }

  const btn = document.getElementById('btn-login')
  btn.disabled     = true
  btn.innerHTML    = '<i data-lucide="loader-2"></i> Memproses...'
  lucide.createIcons()

  const { error } = await sb.auth.signInWithPassword({ email, password })

  btn.disabled  = false
  btn.innerHTML = '<i data-lucide="log-in"></i> Masuk'
  lucide.createIcons()

  if (error) {
    showLoginAlert('Email atau password salah. Silakan coba lagi.')
  }
})

// Enter key di field password
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-login').click()
})

// Tombol Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut()
})

function showLoginAlert (msg) {
  const el = document.getElementById('login-alert')
  el.textContent    = msg
  el.style.display  = 'block'
}

// ════════════════════════════════════════════════
//  INIT APP (dipanggil setelah login berhasil)
// ════════════════════════════════════════════════
function initApp () {
  setupNav()
  renderTables()
  syncInventoryUI()
  setupForms()
}

// ════════════════════════════════════════════════
//  NAVIGASI SIDEBAR
// ════════════════════════════════════════════════
function setupNav () {
  const navItems = {
    'menu-pos'      : 'view-pos',
    'menu-history'  : 'view-history',
    'menu-alerts'   : 'view-alerts',
    'menu-inventory': 'view-inventory',
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
      renderTables()
      syncInventoryUI()
    })
  })
}

// ════════════════════════════════════════════════
//  DATABASE — INVENTORI (per apotek / per user)
// ════════════════════════════════════════════════
//
//  Skema tabel `inventory`:
//  id TEXT, user_id UUID, name TEXT, stock INT
//
//  RLS Supabase:
//  - SELECT: auth.uid() = user_id
//  - INSERT: auth.uid() = user_id
//  - UPDATE: auth.uid() = user_id
//  - DELETE: auth.uid() = user_id

async function getInventory () {
  // Hanya ambil inventori milik apotek (user) yang sedang login
  const { data, error } = await sb
    .from('inventory')
    .select('*')
    .eq('user_id', currentUserId)
    .order('name')

  if (error) { console.error('getInventory:', error); return [] }

  // Seed data awal kalau apotek ini belum punya inventori sama sekali
  if (data.length === 0) {
    const seeds = [
      { id: 'inv-' + currentUserId.substr(0,8) + '-1', user_id: currentUserId, name: 'Dextromethorphan (Sirup Batuk)', stock: 50 },
      { id: 'inv-' + currentUserId.substr(0,8) + '-2', user_id: currentUserId, name: 'Pseudoephedrine (Tablet Flu)',   stock: 50 },
      { id: 'inv-' + currentUserId.substr(0,8) + '-3', user_id: currentUserId, name: 'Tramadol (Nyeri)',               stock: 50 },
      { id: 'inv-' + currentUserId.substr(0,8) + '-4', user_id: currentUserId, name: 'Chlorpheniramine (Antihistamin)',stock: 50 },
    ]
    const { error: seedErr } = await sb.from('inventory').insert(seeds)
    if (seedErr) console.error('seed inventory:', seedErr)
    return seeds
  }
  return data
}

async function updateInventoryStock (id, newStock) {
  const { error } = await sb
    .from('inventory')
    .update({ stock: newStock })
    .eq('id', id)
    .eq('user_id', currentUserId)   // pastikan hanya update milik sendiri
  if (error) console.error('updateInventoryStock:', error)
}

async function deleteInventoryItem (id) {
  const { error } = await sb
    .from('inventory')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUserId)   // pastikan hanya hapus milik sendiri
  if (error) console.error('deleteInventoryItem:', error)
}

async function insertInventoryItem (item) {
  // Selalu sisipkan user_id agar inventori terikat ke apotek ini
  const { error } = await sb.from('inventory').insert({ ...item, user_id: currentUserId })
  if (error) console.error('insertInventoryItem:', error)
}

// ════════════════════════════════════════════════
//  DATABASE — TRANSAKSI (global, semua apotek)
// ════════════════════════════════════════════════
//
//  Skema tabel `transactions`:
//  id TEXT, timestamp TIMESTAMPTZ, nik TEXT,
//  medicine_id TEXT, medicine TEXT, quantity INT,
//  status TEXT, reason TEXT,
//  pharmacist_user_id UUID,   ← siapa yang input
//  pharmacy_email TEXT        ← nama/identitas apotek asal
//
//  RLS Supabase:
//  - SELECT: true (semua apoteker login bisa baca)
//  - INSERT: auth.uid() = pharmacist_user_id (hanya pemilik bisa insert)
//  - DELETE: auth.uid() = pharmacist_user_id (hanya pemilik bisa hapus miliknya)

async function getTransactions (searchQuery = '') {
  // Semua apotek bisa lihat SEMUA transaksi (global)
  let query = sb
    .from('transactions')
    .select('*')
    .order('timestamp', { ascending: false })

  if (searchQuery) {
    query = query.or(`nik.ilike.%${searchQuery}%,medicine.ilike.%${searchQuery}%`)
  }

  const { data, error } = await query
  if (error) { console.error('getTransactions:', error); return [] }
  return data
}

async function saveTransaction (tx) {
  // Tambahkan identitas apotek yang mencatat transaksi ini
  const enriched = {
    ...tx,
    pharmacist_user_id : currentUserId,
    pharmacy_email     : currentUserEmail,
  }
  const { error } = await sb.from('transactions').insert(enriched)
  if (error) console.error('saveTransaction:', error)
}

async function clearAllTransactions () {
  // Hanya hapus transaksi yang dicatat oleh apotek ini sendiri
  const { error } = await sb
    .from('transactions')
    .delete()
    .eq('pharmacist_user_id', currentUserId)
  if (error) console.error('clearAllTransactions:', error)
}

// ════════════════════════════════════════════════
//  RULES ENGINE
//  Cek limit dari seluruh transaksi global (lintas apotek)
// ════════════════════════════════════════════════
async function checkRules (nik, medicineId, targetQty) {
  const inv = await getInventory()
  const med = inv.find(i => i.id === medicineId)

  if (!med)                   return { allowed: false, type: 'error', reason: 'Obat tidak terdaftar di sistem.' }
  if (med.stock < targetQty)  return { allowed: false, type: 'error', reason: `Stok ${med.name} hanya tersisa ${med.stock} pcs.` }

  // ── Cek riwayat 7 hari terakhir dari SELURUH apotek (global) ──
  // Kita cocokkan berdasarkan nama obat (medicine), bukan medicine_id,
  // karena tiap apotek punya medicine_id sendiri-sendiri untuk obat yang sama.
  // Gunakan nama obat yang sudah dinormalisasi (tanpa info stok di dalam nama).
  const medNameClean = med.name   // gunakan nama lengkap, cocokkan exact

  const timeLimit = new Date(Date.now() - DAYS_LIMIT * 24 * 60 * 60 * 1000).toISOString()

  const { data: past, error } = await sb
    .from('transactions')
    .select('quantity, pharmacy_email')
    .eq('nik', nik)
    .eq('medicine', medNameClean)   // cocok nama obat lintas apotek
    .eq('status', 'SUCCESS')
    .gte('timestamp', timeLimit)

  if (error) console.error('checkRules query:', error)

  const accumulatedQty = (past || []).reduce((sum, tx) => sum + tx.quantity, 0)
  const newTotal       = accumulatedQty + parseInt(targetQty)

  // Buat deskripsi apotek mana saja yang sudah melayani
  const pharmaciesServed = [...new Set((past || []).map(t => t.pharmacy_email).filter(Boolean))]

  if (newTotal > MAX_ITEMS) {
    const pharmacyInfo = pharmaciesServed.length > 0
      ? ` (Sudah beli di: ${pharmaciesServed.join(', ')})`
      : ''
    return {
      allowed : false,
      type    : 'blocked',
      reason  : `NIK ${nik} sudah membeli ${accumulatedQty} pcs ${medNameClean} dalam 7 hari terakhir${pharmacyInfo}. Batas maksimal ${MAX_ITEMS} pcs.`,
      medName : medNameClean,
      med,
    }
  }

  return { allowed: true, type: 'ok', medName: medNameClean, med }
}

// ════════════════════════════════════════════════
//  ALERT UI
// ════════════════════════════════════════════════
function showAlert (type, title, message) {
  const container = document.getElementById('alertContainer')
  const iconHtml  = type === 'success'
    ? `<i data-lucide="check-circle" style="color:var(--success)"></i>`
    : `<i data-lucide="shield-alert" style="color:var(--danger)"></i>`

  const div = document.createElement('div')
  div.className = `alert alert-${type}`
  div.innerHTML = `${iconHtml}<div class="alert-content"><h4>${title}</h4><p>${message}</p></div>`
  container.innerHTML = ''
  container.appendChild(div)
  lucide.createIcons()
  setTimeout(() => { if (container.contains(div)) div.remove() }, 8000)
}

function setLoading (btn, loading, defaultHtml) {
  btn.disabled  = loading
  btn.innerHTML = loading ? '<i data-lucide="loader-2"></i> Memproses...' : defaultHtml
  lucide.createIcons()
}

// ════════════════════════════════════════════════
//  FORM KASIR
// ════════════════════════════════════════════════
function setupForms () {
  // ── Kasir ──
  const posForm = document.getElementById('posForm')
  posForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const nik        = document.getElementById('nik').value.trim()
    const medicineId = document.getElementById('medicine').value
    const quantity   = parseInt(document.getElementById('quantity').value)
    if (!nik || !medicineId || !quantity) return

    const submitBtn = posForm.querySelector('button[type="submit"]')
    setLoading(submitBtn, true, '<i data-lucide="check-circle"></i> Validasi & Proses Transaksi')

    const ruleCheck = await checkRules(nik, medicineId, quantity)
    setLoading(submitBtn, false, '<i data-lucide="check-circle"></i> Validasi & Proses Transaksi')

    if (ruleCheck.type === 'error') {
      showAlert('danger', 'Gagal Memproses!', ruleCheck.reason)
      return
    }

    const txObj = {
      id          : 'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      timestamp   : new Date().toISOString(),
      nik,
      medicine_id : medicineId,
      medicine    : ruleCheck.medName || 'Unknown',
      quantity,
      status      : ruleCheck.allowed ? 'SUCCESS' : 'BLOCKED',
      reason      : ruleCheck.allowed ? '-' : ruleCheck.reason,
    }

    await saveTransaction(txObj)

    if (ruleCheck.allowed) {
      const newStock = ruleCheck.med.stock - quantity
      await updateInventoryStock(medicineId, newStock)
      showAlert('success', 'Transaksi Valid', `KTP ${nik} sukses membeli ${quantity} pcs ${ruleCheck.medName}. Stok apotek ini berhasil dipotong.`)
      posForm.reset()
    } else {
      showAlert('danger', 'Transaksi Diblokir!', ruleCheck.reason)
    }

    await renderTables()
    await syncInventoryUI()
  })

  // ── Inventori ──
  const invForm = document.getElementById('inventoryForm')
  if (invForm) {
    invForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const name  = document.getElementById('newMedicineName').value.trim()
      const stock = parseInt(document.getElementById('newMedicineStock').value)
      const item  = { id: 'inv-' + currentUserId.substr(0,8) + '-' + Math.random().toString(36).substr(2, 5), name, stock }

      const submitBtn = invForm.querySelector('button[type="submit"]')
      setLoading(submitBtn, true, '<i data-lucide="plus-circle"></i> Tambah ke Inventori')
      await insertInventoryItem(item)
      setLoading(submitBtn, false, '<i data-lucide="plus-circle"></i> Tambah ke Inventori')

      showAlert('success', 'Berhasil', `Obat ${name} ditambahkan dengan stok awal ${stock}.`)
      invForm.reset()
      await syncInventoryUI()
    })
  }

  // ── Hapus Riwayat (hanya transaksi dari apotek ini) ──
  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Yakin hapus semua riwayat transaksi yang dicatat oleh apotek ini?')) return
    await clearAllTransactions()
    await renderTables()
    showAlert('success', 'Berhasil', 'Riwayat transaksi apotek ini telah dihapus.')
  })

  // ── Inventori table actions (delegasi event) ──
  document.getElementById('inventoryTableBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    const id  = btn.getAttribute('data-id')
    const inv = await getInventory()
    const med = inv.find(i => i.id === id)
    if (!med) return

    if (btn.classList.contains('btn-del')) {
      if (!confirm(`Yakin hapus ${med.name} dari inventori?`)) return
      await deleteInventoryItem(id)

    } else if (btn.classList.contains('btn-add-stok')) {
      const add = prompt(`Tambah stok untuk ${med.name}:`, '10')
      if (!add || isNaN(add)) return
      await updateInventoryStock(id, med.stock + parseInt(add))

    } else if (btn.classList.contains('btn-min-stok')) {
      const min = prompt(`Kurangi stok untuk ${med.name}:`, '5')
      if (!min || isNaN(min)) return
      if (med.stock < parseInt(min)) { alert('Stok tidak cukup!'); return }
      await updateInventoryStock(id, med.stock - parseInt(min))
    }

    await syncInventoryUI()
  })

  // ── Search ──
  const searchInput = document.getElementById('searchHistory')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => renderTables(e.target.value))
  }
}

// ════════════════════════════════════════════════
//  RENDER INVENTORI UI
// ════════════════════════════════════════════════
async function syncInventoryUI () {
  const inv    = await getInventory()
  const select = document.getElementById('medicine')
  if (select) {
    select.innerHTML = '<option value="" disabled selected>Pilih jenis obat...</option>'
    inv.forEach(med => {
      const opt       = document.createElement('option')
      opt.value       = med.id
      opt.textContent = `${med.name} (Sisa: ${med.stock})`
      opt.disabled    = med.stock <= 0
      select.appendChild(opt)
    })
  }

  const tbody = document.getElementById('inventoryTableBody')
  if (tbody) {
    tbody.innerHTML = ''
    if (inv.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Belum ada obat terdaftar.</td></tr>'
    } else {
      inv.forEach(med => {
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td><strong>${med.name}</strong></td>
          <td>${med.stock}</td>
          <td>
            <div style="display:flex;gap:8px;">
              <button type="button" class="btn btn-outline btn-sm btn-min-stok" data-id="${med.id}">-</button>
              <button type="button" class="btn btn-outline btn-sm btn-add-stok" data-id="${med.id}">+</button>
              <button type="button" class="btn btn-sm btn-del" data-id="${med.id}" style="border:1px solid var(--danger);color:var(--danger);background:transparent;">Hapus</button>
            </div>
          </td>`
        tbody.appendChild(tr)
      })
    }
  }
}

// ════════════════════════════════════════════════
//  RENDER TABEL HISTORY & LOG BLOKIR
//  Menampilkan transaksi GLOBAL (semua apotek)
//  dengan kolom tambahan: apotek pencatat
// ════════════════════════════════════════════════
async function renderTables (searchQuery = '') {
  const transactions  = await getTransactions(searchQuery)
  const historyTbody  = document.getElementById('historyTableBody')
  const alertsTbody   = document.getElementById('alertsTableBody')

  if (historyTbody) historyTbody.innerHTML = ''
  if (alertsTbody)  alertsTbody.innerHTML  = ''

  if (transactions.length === 0) {
    if (historyTbody) historyTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">Belum ada data transaksi</td></tr>'
    if (alertsTbody)  alertsTbody.innerHTML  = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">Belum ada log pelanggaran</td></tr>'
    return
  }

  transactions.forEach(tx => {
    const dateStr     = new Date(tx.timestamp).toLocaleString('id-ID')
    const isSuccess   = tx.status === 'SUCCESS'
    const pharmacyTag = tx.pharmacy_email
      ? `<span style="font-size:0.7rem;color:var(--text-muted);">${tx.pharmacy_email}</span>`
      : '—'
    const isMine      = tx.pharmacist_user_id === currentUserId

    const tr = document.createElement('tr')
    tr.style.background = isMine ? '' : '#fafbff'   // warna berbeda untuk transaksi apotek lain
    tr.innerHTML = `
      <td>${dateStr}<br>${pharmacyTag}</td>
      <td><strong>${tx.nik}</strong></td>
      <td>${tx.medicine}</td>
      <td>${tx.quantity}</td>
      <td><span class="badge ${isSuccess ? 'badge-success' : 'badge-danger'}">${tx.status}</span></td>`
    if (historyTbody) historyTbody.appendChild(tr)

    if (!isSuccess) {
      const trAlert = document.createElement('tr')
      trAlert.style.background = isMine ? '' : '#fafbff'
      trAlert.innerHTML = `
        <td>${dateStr}<br>${pharmacyTag}</td>
        <td><strong>${tx.nik}</strong></td>
        <td>${tx.medicine}</td>
        <td>${tx.quantity}</td>
        <td class="text-danger">${tx.reason}</td>`
      if (alertsTbody) alertsTbody.appendChild(trAlert)
    }
  })
}

// ════════════════════════════════════════════════
//  ENTRY POINT
// ════════════════════════════════════════════════
initAuth()
