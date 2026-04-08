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
app.use(express.static(path.join(__dirname, 'public')));

let dbReady = initDB();

app.post('/api/claim', async (req, res) => {
  const { userId, ticketCode, manualBetting } = req.body;
  if (!userId || !ticketCode) return res.status(400).json({ error: 'User ID dan kode tiket wajib' });
  try {
    await dbReady;
    await saveClaim({ userId, ticketCode, betting: manualBetting || '', scatter: '', status: 'PROCESSING' });
    
    // Proses di background
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

// Scheduler pengecekan status pending setiap 1 menit
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