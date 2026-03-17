// ========================================
// CERTIFICATE CHECKER - Frontend Logic
// Batch Processing: 100 kode per request
// ========================================

// State management
let allResults = [];
let currentPage = 1;
const itemsPerPage = 10;
const batchSize = 100;

// DOM Elements
const codesInput = document.getElementById('codesInput');
const checkBtn = document.getElementById('checkBtn');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const apiUrlInput = document.getElementById('apiUrl');
const apiKeyInput = document.getElementById('apiKey');
const lineCountEl = document.getElementById('lineCount');
const loadingStatus = document.getElementById('loadingStatus');
const loadingText = document.getElementById('loadingText');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const statsContainer = document.getElementById('statsContainer');
const tableContainer = document.getElementById('tableContainer');
const resultsBody = document.getElementById('resultsBody');
const noResults = document.getElementById('noResults');
const paginationContainer = document.getElementById('paginationContainer');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');

// ========================================
// EVENT LISTENERS
// ========================================

codesInput.addEventListener('input', updateLineCount);
checkBtn.addEventListener('click', handleCheckValidation);
clearBtn.addEventListener('click', handleClearAll);
downloadBtn.addEventListener('click', downloadCSV);
prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextBtn.addEventListener('click', () => goToPage(currentPage + 1));

// ========================================
// UTILITY FUNCTIONS
// ========================================

function updateLineCount() {
  const lines = codesInput.value.trim().split('\n').filter(line => line.trim());
  lineCountEl.textContent = lines.length;
  checkBtn.disabled = lines.length === 0;
}

function showLoading(show, message) {
  if (show) {
    loadingStatus.classList.remove('hidden');
    loadingText.textContent = message;
  } else {
    loadingStatus.classList.add('hidden');
  }
}

function showMessage(type, message) {
  successMessage.classList.add('hidden');
  errorMessage.classList.add('hidden');

  if (type === 'success') {
    successMessage.textContent = message;
    successMessage.classList.remove('hidden');
  } else if (type === 'error') {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
  }
}

function cleanInput(input) {
  return input
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.trim())
    .slice(0, 1000); // Maksimal 1000 baris
}

// ========================================
// BATCH PROCESSING
// ========================================

async function handleCheckValidation() {
  const codes = cleanInput(codesInput.value);

  if (codes.length === 0) {
    showMessage('error', 'Masukkan setidaknya satu nomor referensi');
    return;
  }

  const apiUrl = apiUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  if (!apiUrl || apiUrl.includes('YOUR_DEPLOYMENT_ID')) {
    showMessage('error', 'Masukkan Google Apps Script Web App URL yang valid');
    return;
  }

  // Reset
  allResults = [];
  currentPage = 1;
  checkBtn.disabled = true;

  // Process dalam batch
  const batches = [];
  for (let i = 0; i < codes.length; i += batchSize) {
    batches.push(codes.slice(i, i + batchSize));
  }

  const totalBatches = batches.length;
  let processedCount = 0;

  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      showLoading(true, `Memproses batch ${batchIndex + 1} dari ${totalBatches}...`);

      try {
        const results = await sendBatchToBackend(batch, apiUrl, apiKey);
        allResults = allResults.concat(results);
        processedCount += batch.length;
      } catch (error) {
        console.error(`Error batch ${batchIndex + 1}:`, error);
        showMessage('error', `Error pada batch ${batchIndex + 1}: ${error.message}`);
        return;
      }

      // Delay antara batch untuk menghindari rate limiting
      if (batchIndex < batches.length - 1) {
        await sleep(500);
      }
    }

    showLoading(false);
    displayResults();
    showMessage('success', `✓ Berhasil memproses ${allResults.length} sertifikat`);

  } catch (error) {
    showLoading(false);
    showMessage('error', `Error: ${error.message}`);
  } finally {
    checkBtn.disabled = false;
  }
}

async function sendBatchToBackend(batch, apiUrl, apiKey) {
  const payload = {
    api_key: apiKey,
    codes: batch
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown error from backend');
    }

    return data.results || [];

  } catch (error) {
    throw new Error(`Backend error: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// DISPLAY RESULTS
// ========================================

function displayResults() {
  if (allResults.length === 0) {
    noResults.classList.remove('hidden');
    tableContainer.classList.add('hidden');
    statsContainer.classList.add('hidden');
    paginationContainer.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    return;
  }

  // Show containers
  noResults.classList.add('hidden');
  tableContainer.classList.remove('hidden');
  statsContainer.classList.remove('hidden');
  downloadBtn.classList.remove('hidden');

  // Update stats
  updateStats();

  // Render pagination
  renderPagination();

  // Show/hide pagination
  if (getTotalPages() > 1) {
    paginationContainer.classList.remove('hidden');
  } else {
    paginationContainer.classList.add('hidden');
  }
}

function updateStats() {
  const total = allResults.length;
  const valid = allResults.filter(r => r.status === 'Valid').length;
  const invalid = total - valid;
  const rate = total > 0 ? Math.round((valid / total) * 100) : 0;

  document.getElementById('totalCount').textContent = total;
  document.getElementById('validCount').textContent = valid;
  document.getElementById('invalidCount').textContent = invalid;
  document.getElementById('successRate').textContent = rate + '%';
}

function renderPagination() {
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageResults = allResults.slice(startIdx, endIdx);

  resultsBody.innerHTML = pageResults.map(result => `
    <tr class="border-b border-gray-200 hover:bg-gray-50">
      <td class="px-4 py-3 text-gray-800">${result.index}</td>
      <td class="px-4 py-3 text-gray-800 font-medium">${escapeHtml(result.nama)}</td>
      <td class="px-4 py-3 text-gray-600 text-xs font-mono">${escapeHtml(result.code)}</td>
      <td class="px-4 py-3 text-center">
        <span class="px-3 py-1 rounded-full text-sm font-semibold ${
          result.status === 'Valid' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }">
          ${result.status}
        </span>
      </td>
    </tr>
  `).join('');

  const totalPages = getTotalPages();
  pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages}`;

  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
}

function goToPage(page) {
  const totalPages = getTotalPages();
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderPagination();
  // Scroll ke atas tabel
  document.getElementById('tableContainer').scrollIntoView({ behavior: 'smooth' });
}

function getTotalPages() {
  return Math.ceil(allResults.length / itemsPerPage);
}

// ========================================
// CSV DOWNLOAD
// ========================================

function downloadCSV() {
  if (allResults.length === 0) {
    alert('Tidak ada data untuk diunduh');
    return;
  }

  // CSV Header
  const header = ['No', 'Nama', 'Nomor Referensi', 'Status'];
  
  // CSV Rows
  const rows = allResults.map(result => [
    result.index,
    `"${result.nama.replace(/"/g, '""')}"`, // Escape quotes
    `"${result.code.replace(/"/g, '""')}"`,
    result.status
  ]);

  // Combine
  const csvContent = [
    header.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // Add BOM untuk UTF-8
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Create download link
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `hasil_validasi_${getDateStamp()}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getDateStamp() {
  const now = new Date();
  return now.toISOString().slice(0, 10) + '_' + 
         now.toTimeString().slice(0, 8).replace(/:/g, '-');
}

// ========================================
// CLEAR ALL
// ========================================

function handleClearAll() {
  if (confirm('Hapus semua data? Tindakan ini tidak dapat dibatalkan.')) {
    codesInput.value = '';
    allResults = [];
    currentPage = 1;
    updateLineCount();
    noResults.classList.remove('hidden');
    tableContainer.classList.add('hidden');
    statsContainer.classList.add('hidden');
    paginationContainer.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    successMessage.classList.add('hidden');
    errorMessage.classList.add('hidden');
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ========================================
// INITIALIZE
// ========================================

updateLineCount();
console.log('Certificate Checker initialized. Ready to validate certificates.');
