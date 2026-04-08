const express = require('express');
const path = require('path');
const { initDB, saveClaim, updateClaimStatus, getAllClaims, getPendingClaims } = require('./database');
const { processClaim, checkPendingStatus } = require('./automator');

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // untuk akses index.html di root

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/claim', async (req, res) => {
  const { userId, ticketCode, manualBetting } = req.body;
  if (!userId || !ticketCode) return res.status(400).json({ error: 'User ID dan kode tiket wajib' });
  try {
    await dbReady;
    await saveClaim({ userId, ticketCode, betting: manualBetting || '', scatter: '', status: 'PROCESSING' });
    processClaim(userId, ticketCode, manualBetting).then(async (result) => {
      if (result.success) {
        await updateClaimStatus(ticketCode, 'PENDING', `Scatter: ${result.scatter}, Bet: ${result.betting}`);
      } else {
        await updateClaimStatus(ticketCode, 'FAILED', result.error);
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/claims', async (req, res) => {
  await dbReady;
  res.json(await getAllClaims());
});

async function monitorPending() {
  await dbReady;
  const pendings = await getPendingClaims();
  for (const claim of pendings) {
    const { status, remark } = await checkPendingStatus(claim.ticketCode);
    if (status !== 'PENDING') {
      await updateClaimStatus(claim.ticketCode, status, remark);
    }
  }
}
setInterval(monitorPending, 60000);
monitorPending();

let dbReady = initDB();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
