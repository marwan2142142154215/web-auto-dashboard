const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { initDB, saveClaim, updateClaimStatus, getAllClaims, getPendingClaims } = require('./database');
const { processClaim, checkPendingStatus } = require('./automator');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(express.json());

// ===== PERUBAHAN: Serve static files dari root (tempat index.html berada) =====
// Coba cari di folder public dulu, jika tidak ada pakai root
const publicPath = path.join(__dirname, 'public');
const fs = require('fs');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
} else {
  // Jika folder public tidak ada, gunakan root sebagai static
  app.use(express.static(__dirname));
}
// Fallback untuk semua route non-API
app.get('*', (req, res) => {
  // Coba kirim index.html dari root
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else if (fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).send('File index.html tidak ditemukan');
  }
});

let dbReady = initDB();

app.post('/api/claim', async (req, res) => {
  const { userId, ticketCode, manualBetting } = req.body;
  if (!userId || !ticketCode) return res.status(400).json({ error: 'User ID dan kode tiket wajib' });
  try {
    await dbReady;
    await saveClaim({ userId, ticketCode, betting: manualBetting || '', scatter: '', status: 'PROCESSING' });
    
    processClaim(userId, ticketCode, manualBetting).then(async (result) => {
      if (result.success) {
        await updateClaimStatus(ticketCode, 'PENDING', `Scatter: ${result.scatter}, Bet: ${result.betting}`);
        io.emit('new-claim', { ticketCode, status: 'PENDING' });
      } else {
        await updateClaimStatus(ticketCode, 'FAILED', result.error || 'Gagal auto claim');
        io.emit('claim-updated', { ticketCode, status: 'FAILED', remark: result.error });
      }
    }).catch(err => {
      updateClaimStatus(ticketCode, 'FAILED', err.message);
    });
    
    res.json({ success: true, message: 'Klaim diproses di background' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/claims', async (req, res) => {
  await dbReady;
  const claims = await getAllClaims();
  res.json(claims);
});

async function monitorPending() {
  await dbReady;
  const pendings = await getPendingClaims();
  for (const claim of pendings) {
    const { status, remark } = await checkPendingStatus(claim.ticketCode);
    if (status !== 'PENDING') {
      await updateClaimStatus(claim.ticketCode, status, remark);
      io.emit('claim-updated', { ticketCode: claim.ticketCode, status, remark });
    }
  }
}
setInterval(monitorPending, 60000);
monitorPending();

io.on('connection', async (socket) => {
  const claims = await getAllClaims();
  socket.emit('initial-data', claims);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
