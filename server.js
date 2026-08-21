const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const QRCode = require('qrcode');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 10000 
});

try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase Admin Initialized.");
} catch (e) {
    console.log("⚠️ Firebase serviceAccountKey.json not found.");
}

const uploadDir = path.join(__dirname, 'public/uploads');
const qrDir = path.join(__dirname, 'public/qrcodes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

async function generateMasterQRCode(shopId) {
    const baseUrl = 'http://192.168.43.1:8000';
    const qrPath = path.join(qrDir, `master.png`);
    const targetUrl = `${baseUrl}/${shopId}`;
    try {
        await QRCode.toFile(qrPath, targetUrl, {
            width: 400, margin: 2, color: { dark: '#120C08', light: '#FFFFFF' }
        });
    } catch (err) { console.error(err); }
}

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
})});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function requireAdminApp(req, res, next) {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.includes('Capacitor') || userAgent.includes('wv')) return next();
    return res.status(403).send('🔒 Access Denied');
}

let db;
const dbPath = path.join(__dirname, 'pos.sqlite');

async function initDB() {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
        db = new SQL.Database(fs.readFileSync(dbPath));
    } else {
        db = new SQL.Database();
        saveDB();
    }
    db.run(`
        CREATE TABLE IF NOT EXISTS menu (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id TEXT, name TEXT, price REAL, image_url TEXT);
        CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id TEXT, table_num TEXT, item_name TEXT, quantity INTEGER, sugar TEXT, note TEXT, status TEXT DEFAULT 'pending');
        CREATE TABLE IF NOT EXISTS sales_history (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id TEXT, shift_date TEXT, table_num TEXT, item_name TEXT, quantity INTEGER, sugar TEXT, note TEXT, total_price REAL);
    `);
    saveDB();
}

function saveDB() {
    if (db) fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

io.on('connection', (socket) => {
    socket.on('join_shop', (shopId) => { if (shopId) socket.join(String(shopId)); });
});

// ---------------- ROUTES ----------------

app.get('/:shopId/admin', requireAdminApp, async (req, res) => {
    const { shopId } = req.params;
    await generateMasterQRCode(shopId);
    
    const menuItems = [];
    const menuStmt = db.prepare("SELECT * FROM menu WHERE shop_id = ?");
    menuStmt.bind([shopId]);
    while (menuStmt.step()) menuItems.push(menuStmt.getAsObject());
    menuStmt.free();

    const salesItems = [];
    let grandTotal = 0;
    const salesStmt = db.prepare("SELECT * FROM sales WHERE shop_id = ? ORDER BY id DESC");
    salesStmt.bind([shopId]);
    while (salesStmt.step()) {
        const row = salesStmt.getAsObject();
        salesItems.push(row);
        const item = menuItems.find(m => m.name === row.item_name);
        if (item) grandTotal += item.price * row.quantity;
    }
    salesStmt.free();

    const historyItems = [];
    const historyStmt = db.prepare("SELECT * FROM sales_history WHERE shop_id = ? ORDER BY id DESC");
    historyStmt.bind([shopId]);
    while (historyStmt.step()) historyItems.push(historyStmt.getAsObject());
    historyStmt.free();

    res.render('admin', { shopId, menuItems, salesItems, grandTotal, historyItems });
});

// 🚀 កន្លែងដែលបានកែសម្រួល (កុំឱ្យញាក់)
app.post('/:shopId/admin/order-status', requireAdminApp, (req, res) => {
    const { shopId } = req.params;
    const { order_id, status } = req.body;
    
    db.run("UPDATE sales SET status = ? WHERE id = ? AND shop_id = ?", [status || 'ready', order_id, shopId]);
    saveDB();
    
    io.to(shopId).emit('customer_confirmed', { orderId: order_id, status });
    
    // ឆ្លើយតបជា JSON ជំនួសឱ្យការ Redirect
    res.json({ success: true }); 
});

// Routes ផ្សេងៗទៀតទុកដូចដើម...
app.post('/:shopId/admin/close-shift', requireAdminApp, (req, res) => {
    const { shopId } = req.params;
    const shiftDate = new Date().toLocaleDateString();
    const salesStmt = db.prepare("SELECT * FROM sales WHERE shop_id = ?");
    salesStmt.bind([shopId]);
    while (salesStmt.step()) {
        const s = salesStmt.getAsObject();
        db.run("INSERT INTO sales_history (shop_id, shift_date, table_num, item_name, quantity, sugar, note, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [shopId, shiftDate, s.table_num, s.item_name, s.quantity, s.sugar, s.note, 0]);
    }
    salesStmt.free();
    db.run("DELETE FROM sales WHERE shop_id = ?", [shopId]);
    saveDB();
    io.to(shopId).emit('menu_updated');
    res.redirect(`/${shopId}/admin`);
});

app.post('/:shopId/admin/menu/add', requireAdminApp, upload.single('image'), (req, res) => {
    const { shopId } = req.params;
    const { name, price } = req.body;
    db.run("INSERT INTO menu (shop_id, name, price, image_url) VALUES (?, ?, ?, ?)", [shopId, name, parseFloat(price), req.file ? '/uploads/' + req.file.filename : '']);
    saveDB();
    io.to(shopId).emit('menu_updated');
    res.redirect(`/${shopId}/admin`);
});

app.post('/:shopId/order', async (req, res) => {
    const { shopId } = req.params;
    const { table, item_name, qty, sugar, note } = req.body;
    db.run("INSERT INTO sales (shop_id, table_num, item_name, quantity, sugar, note, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
        [shopId, table || '1', item_name || 'កាហ្វេ', parseInt(qty) || 1, sugar || '100%', note || '']);
    saveDB();
    io.to(shopId).emit('new_order');
    res.redirect(`/${shopId}?table=${table || '1'}`);
});

initDB().then(() => {
    const PORT = process.env.PORT || 8000;
    server.listen(PORT, () => console.log(`☕ Coffee POS Server Running on Port ${PORT}`));
});

