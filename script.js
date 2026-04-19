// ════════════════════════════════════════════════
//  APOGUARD — script.js
//  Ganti dua baris di bawah ini dengan kredensial Supabase kamu
// ════════════════════════════════════════════════

const SUPABASE_URL      = 'https://spavhlrmpakdnrqvkhss.supabase.co'   // contoh: https://abcxyz.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_repKElw3DDdSsVKDmS-m-Q_vA-es2nP' // sb_publishable_...

// ────────────────────────────────────────────────
const { createClient } = supabase
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════
const MAX_ITEMS  = 2
const DAYS_LIMIT = 7

// ════════════════════════════════════════════════
//  AUTH — LOGIN / LOGOUT
// ════════════════════════════════════════════════
async function initAuth () {
  // Cek URL hash untuk token dari email invite/recovery
  const hash        = window.location.hash
  const hashParams  = new URLSearchParams(hash.replace('#', ''))
  const accessToken = hashParams.get('access_token')
  const refreshToken= hashParams.get('refresh_token')
  const urlType     = hashParams.get('type') // 'invite' | 'recovery'

  if (accessToken && refreshToken) {
    // Bersihkan URL
    history.replaceState(null, '', window.location.pathname)
    // Set session dari token
    await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    const { data: { session } } = await sb.auth.getSession()
    if (session) {
      if (urlType === 'recovery') {
        showLogin()
        showModalSetPassword('reset')
      } else {
        // invite
        showApp(session.user)
        setTimeout(() => showModalSetPassword('invite'), 400)
      }
    } else {
      showLogin()
    }
    return
  }

  // Normal flow
  const { data: { session } } = await sb.auth.getSession()
  if (session) showApp(session.user)
  else showLogin()

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      showLogin()
      setTimeout(() => showModalSetPassword('reset'), 200)
      return
    }
    if (session) showApp(session.user)
    else showLogin()
  })
}

function showModalSetPassword (mode) {
  const modal    = document.getElementById('modal-set-password')
  const title    = document.getElementById('set-password-title')
  const subtitle = document.getElementById('set-password-subtitle')
  if (mode === 'invite') {
    title.textContent    = '🔐 Buat Password Baru'
    subtitle.textContent = 'Selamat datang! Silakan buat password untuk login berikutnya.'
  } else {
    title.textContent    = '🔑 Reset Password'
    subtitle.textContent = 'Masukkan password baru Anda.'
  }
  document.getElementById('new-password').value     = ''
  document.getElementById('confirm-password').value = ''
  document.getElementById('set-password-alert').style.display = 'none'
  modal.style.display = 'flex'
  lucide.createIcons()
}

function showLogin () {
  document.getElementById('login-page').style.display = 'flex'
  document.getElementById('app-page').style.display   = 'none'
  document.getElementById('login-email').value = ''
  document.getElementById('login-password').value = ''
  document.getElementById('login-alert').style.display = 'none'
}

function showApp (user) {
  document.getElementById('login-page').style.display = 'none'
  document.getElementById('app-page').style.display   = 'flex'

  // Tampilkan email apoteker
  const email = user.email || '—'
  document.getElementById('user-email-display').textContent = email
  document.getElementById('user-avatar').textContent = email[0].toUpperCase()

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

// Logout
async function doLogout () {
  await sb.auth.signOut()
  showLogin()
}
document.getElementById('btn-logout').addEventListener('click', doLogout)
const _mobileLogout = document.getElementById('btn-logout-mobile')
if (_mobileLogout) _mobileLogout.addEventListener('click', doLogout)

// Modal Set Password handler
document.getElementById('btn-set-password-save').addEventListener('click', async () => {
  const newPass     = document.getElementById('new-password').value
  const confirmPass = document.getElementById('confirm-password').value
  const alertEl     = document.getElementById('set-password-alert')
  alertEl.style.display = 'none'

  if (!newPass || newPass.length < 6) {
    alertEl.textContent = 'Password minimal 6 karakter.'
    alertEl.style.display = 'block'
    alertEl.style.background = 'var(--danger-bg)'
    alertEl.style.color = '#991b1b'
    return
  }
  if (newPass !== confirmPass) {
    alertEl.textContent = 'Password dan konfirmasi tidak cocok.'
    alertEl.style.display = 'block'
    alertEl.style.background = 'var(--danger-bg)'
    alertEl.style.color = '#991b1b'
    return
  }

  const btn = document.getElementById('btn-set-password-save')
  btn.disabled  = true
  btn.innerHTML = '<i data-lucide="loader-2"></i> Menyimpan...'
  lucide.createIcons()

  const { error } = await sb.auth.updateUser({ password: newPass })

  btn.disabled  = false
  btn.innerHTML = '<i data-lucide="save"></i> Simpan Password'
  lucide.createIcons()

  if (error) {
    alertEl.textContent = 'Gagal: ' + error.message
    alertEl.style.display = 'block'
    alertEl.style.background = 'var(--danger-bg)'
    alertEl.style.color = '#991b1b'
  } else {
    alertEl.textContent = '✅ Password tersimpan! Silakan login kembali.'
    alertEl.style.display = 'block'
    alertEl.style.background = 'var(--success-bg)'
    alertEl.style.color = '#065f46'
    setTimeout(async () => {
      document.getElementById('modal-set-password').style.display = 'none'
      await doLogout()
    }, 2500)
  }
})

// Lupa Password
document.getElementById('btn-forgot-password').addEventListener('click', () => {
  document.getElementById('reset-email').value = ''
  document.getElementById('reset-alert').style.display = 'none'
  document.getElementById('modal-reset').style.display = 'flex'
  lucide.createIcons()
})
document.getElementById('btn-reset-cancel').addEventListener('click', () => {
  document.getElementById('modal-reset').style.display = 'none'
})
document.getElementById('btn-reset-send').addEventListener('click', async () => {
  const email   = document.getElementById('reset-email').value.trim()
  const alertEl = document.getElementById('reset-alert')
  alertEl.style.display = 'none'
  if (!email) {
    alertEl.textContent = 'Email wajib diisi.'
    alertEl.style.display = 'block'
    alertEl.style.background = 'var(--danger-bg)'
    alertEl.style.color = '#991b1b'
    return
  }
  const btn = document.getElementById('btn-reset-send')
  btn.disabled  = true
  btn.innerHTML = '<i data-lucide="loader-2"></i> Mengirim...'
  lucide.createIcons()
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  })
  btn.disabled  = false
  btn.innerHTML = '<i data-lucide="send"></i> Kirim Link'
  lucide.createIcons()
  if (error) {
    alertEl.textContent = 'Gagal mengirim. Periksa email dan coba lagi.'
    alertEl.style.display = 'block'
    alertEl.style.background = 'var(--danger-bg)'
    alertEl.style.color = '#991b1b'
  } else {
    alertEl.textContent = '✅ Link reset dikirim! Cek inbox email Anda.'
    alertEl.style.display = 'block'
    alertEl.style.background = 'var(--success-bg)'
    alertEl.style.color = '#065f46'
    setTimeout(() => { document.getElementById('modal-reset').style.display = 'none' }, 3000)
  }
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
//  DATABASE — INVENTORI
// ════════════════════════════════════════════════
async function getInventory () {
  const { data, error } = await sb.from('inventory').select('*').order('name')
  if (error) { console.error(error); return [] }

  // Seed data awal kalau tabel kosong
  if (data.length === 0) {
    const seeds = [
      { id: 'inv-1', name: 'Dextromethorphan (Sirup Batuk)', stock: 50 },
      { id: 'inv-2', name: 'Pseudoephedrine (Tablet Flu)',   stock: 50 },
      { id: 'inv-3', name: 'Tramadol (Nyeri)',               stock: 50 },
      { id: 'inv-4', name: 'Chlorpheniramine (Antihistamin)',stock: 50 },
    ]
    await sb.from('inventory').insert(seeds)
    return seeds
  }
  return data
}

async function updateInventoryStock (id, newStock) {
  const { error } = await sb.from('inventory').update({ stock: newStock }).eq('id', id)
  if (error) console.error('updateInventoryStock:', error)
}

async function deleteInventoryItem (id) {
  const { error } = await sb.from('inventory').delete().eq('id', id)
  if (error) console.error('deleteInventoryItem:', error)
}

async function insertInventoryItem (item) {
  const { error } = await sb.from('inventory').insert(item)
  if (error) console.error('insertInventoryItem:', error)
}

// ════════════════════════════════════════════════
//  DATABASE — TRANSAKSI
// ════════════════════════════════════════════════
async function getTransactions (searchQuery = '') {
  let query = sb.from('transactions').select('*').order('timestamp', { ascending: false })
  if (searchQuery) {
    query = query.or(`nik.ilike.%${searchQuery}%,medicine.ilike.%${searchQuery}%`)
  }
  const { data, error } = await query
  if (error) { console.error(error); return [] }
  return data
}

async function saveTransaction (tx) {
  const { error } = await sb.from('transactions').insert(tx)
  if (error) console.error('saveTransaction:', error)
}

async function clearAllTransactions () {
  const { error } = await sb.from('transactions').delete().neq('id', '')
  if (error) console.error('clearAllTransactions:', error)
}

// ════════════════════════════════════════════════
//  RULES ENGINE
// ════════════════════════════════════════════════
async function checkRules (nik, medicineId, targetQty) {
  const inv = await getInventory()
  const med = inv.find(i => i.id === medicineId)

  if (!med)                   return { allowed: false, type: 'error', reason: 'Obat tidak terdaftar di sistem.' }
  if (med.stock < targetQty)  return { allowed: false, type: 'error', reason: `Stok ${med.name} hanya tersisa ${med.stock} pcs.` }

  // Cek riwayat 7 hari terakhir
  const timeLimit = new Date(Date.now() - DAYS_LIMIT * 24 * 60 * 60 * 1000).toISOString()
  const { data: past, error } = await sb
    .from('transactions')
    .select('quantity')
    .eq('nik', nik)
    .eq('medicine_id', medicineId)
    .eq('status', 'SUCCESS')
    .gte('timestamp', timeLimit)

  if (error) console.error('checkRules query:', error)

  const accumulatedQty = (past || []).reduce((sum, tx) => sum + tx.quantity, 0)
  const newTotal       = accumulatedQty + parseInt(targetQty)

  if (newTotal > MAX_ITEMS) {
    return {
      allowed : false,
      type    : 'abuse',
      reason  : `Batas aturan terlampaui. Limit ${MAX_ITEMS} pcs per ${DAYS_LIMIT} hari. (Sudah beli ${accumulatedQty} + permintaan ${targetQty} = ${newTotal}). Indikasi Penyalahgunaan.`,
      medName : med.name,
    }
  }

  return { allowed: true, type: 'success', medName: med.name, med }
}

// ════════════════════════════════════════════════
//  UI HELPERS
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
      showAlert('success', 'Transaksi Valid', `KTP ${nik} sukses membeli ${quantity} ${ruleCheck.medName}. Stok berhasil dipotong.`)
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
      const item  = { id: 'inv-' + Math.random().toString(36).substr(2, 9), name, stock }

      const submitBtn = invForm.querySelector('button[type="submit"]')
      setLoading(submitBtn, true, '<i data-lucide="plus-circle"></i> Tambah ke Inventori')
      await insertInventoryItem(item)
      setLoading(submitBtn, false, '<i data-lucide="plus-circle"></i> Tambah ke Inventori')

      showAlert('success', 'Berhasil', `Obat ${name} ditambahkan dengan stok awal ${stock}.`)
      invForm.reset()
      await syncInventoryUI()
    })
  }

  // ── Hapus Riwayat ──
  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Yakin hapus semua riwayat transaksi?')) return
    await clearAllTransactions()
    await renderTables()
    showAlert('success', 'Berhasil', 'Seluruh riwayat transaksi telah dihapus.')
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
// ════════════════════════════════════════════════
async function renderTables (searchQuery = '') {
  const transactions  = await getTransactions(searchQuery)
  const historyTbody  = document.getElementById('historyTableBody')
  const alertsTbody   = document.getElementById('alertsTableBody')

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

    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td><strong>${tx.nik}</strong></td>
      <td>${tx.medicine}</td>
      <td>${tx.quantity}</td>
      <td><span class="badge ${isSuccess ? 'badge-success' : 'badge-danger'}">${tx.status}</span></td>`
    if (historyTbody) historyTbody.appendChild(tr)

    if (!isSuccess) {
      const trAlert = document.createElement('tr')
      trAlert.innerHTML = `
        <td>${dateStr}</td>
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
