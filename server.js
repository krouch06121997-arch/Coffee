const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware ការពារ Admin (អនុញ្ញាតតែ App/Capacitor ប៉ុណ្ណោះ)
function requireAdminApp(req, res, next) {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.includes('Capacitor') || userAgent.includes('wv')) {
        return next();
    }
    return res.status(403).send('🔒 Access Denied: Admin access is restricted to the App.');
}

let db;
const dbPath = path.join(__dirname, 'pos.sqlite');

async function initDB() {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
        const filebuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(filebuffer);
    } else {
        db = new SQL.Database();
        saveDB();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id TEXT,
            name TEXT,
            price REAL
        );
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id TEXT,
            table_num TEXT,
            item_name TEXT,
            quantity INTEGER,
            sugar TEXT,
            note TEXT,
            status TEXT DEFAULT 'pending'
        );
    `);
    saveDB();
}

function saveDB() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

// Socket.io Connection
io.on('connection', (socket) => {
    socket.on('join_shop', (shopId) => {
        socket.join(shopId);
    });
});

// ---------------- ROUTES ----------------

// ១. Route សម្រាប់ Admin Dashboard
app.get('/:shopId/admin', requireAdminApp, (req, res) => {
    const { shopId } = req.params;

    const menuStmt = db.prepare("SELECT * FROM menu WHERE shop_id = ?");
    menuStmt.bind([shopId]);
    const menuItems = [];
    while (menuStmt.step()) menuItems.push(menuStmt.getAsObject());
    menuStmt.free();

    const salesStmt = db.prepare("SELECT * FROM sales WHERE shop_id = ? ORDER BY id DESC");
    salesStmt.bind([shopId]);
    const salesItems = [];
    let grandTotal = 0;
    while (salesStmt.step()) {
        const row = salesStmt.getAsObject();
        salesItems.push(row);
        const item = menuItems.find(m => m.name === row.item_name);
        if (item) {
            grandTotal += item.price * row.quantity;
        }
    }
    salesStmt.free();

    res.render('admin', { shopId, menuItems, salesItems, grandTotal });
});

// ២. បន្ថែម Menu
app.post('/:shopId/admin/menu/add', requireAdminApp, (req, res) => {
    const { shopId } = req.params;
    const { name, price } = req.body;
    db.run("INSERT INTO menu (shop_id, name, price) VALUES (?, ?, ?)", [shopId, name || '', parseFloat(price) || 0]);
    saveDB();
    res.redirect(`/${shopId}/admin`);
});

// ៣. លុប Menu
app.post('/:shopId/admin/menu/delete/:id', requireAdminApp, (req, res) => {
    const { shopId, id } = req.params;
    db.run("DELETE FROM menu WHERE id = ? AND shop_id = ?", [id, shopId]);
    saveDB();
    res.redirect(`/${shopId}/admin`);
});

// ៤. ផ្លាស់ប្តូរ Status Order (ឆុងរួចរាល់)
app.post('/:shopId/admin/order-status', requireAdminApp, (req, res) => {
    const { shopId } = req.params;
    const { order_id, status } = req.body;
    db.run("UPDATE sales SET status = ? WHERE id = ?", [status || 'ready', order_id]);
    saveDB();
    
    io.to(shopId).emit('customer_confirmed', { orderId: order_id });
    res.redirect(`/${shopId}/admin`);
});

// ៥. ទំព័រ Menu សម្រាប់ Customer (ស្កែន QR)
app.get('/:shopId', (req, res) => {
    const { shopId } = req.params;
    const tableNum = req.query.table || '1';

    const menuStmt = db.prepare("SELECT * FROM menu WHERE shop_id = ?");
    menuStmt.bind([shopId]);
    const menuItems = [];
    while (menuStmt.step()) menuItems.push(menuStmt.getAsObject());
    menuStmt.free();

    res.render('index', { shopId, tableNum, menuItems });
});

// ៦. Customer ចុច Order (ការពារតម្លៃ undefined និងបាញ់ Socket ទៅ Admin)
app.post('/:shopId/order', (req, res) => {
    const { shopId } = req.params;
    const { table_num, item_name, quantity, sugar, note } = req.body;

    // កំណត់តម្លៃសុវត្ថិភាព ការពារ Error: tried to bind a value of an unknown type
    const safeTableNum = table_num ? String(table_num) : '1';
    const safeItemName = item_name ? String(item_name) : 'ភេសជ្ជៈ';
    const safeQuantity = parseInt(quantity) || 1;
    const safeSugar = sugar ? String(sugar) : '100%';
    const safeNote = note ? String(note) : '';

    db.run(
        "INSERT INTO sales (shop_id, table_num, item_name, quantity, sugar, note, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
        [shopId, safeTableNum, safeItemName, safeQuantity, safeSugar, safeNote]
    );
    saveDB();

    // 🔴 បាញ់ Socket ទៅកាន់ Admin Dashboard ឱ្យ Auto Refresh
    io.to(shopId).emit('new_order');

    res.redirect(`/${shopId}?table=${safeTableNum}`);
});

initDB().then(() => {
    const PORT = process.env.PORT || 8000;
    server.listen(PORT, () => {
        console.log(`☕ Coffee POS Server Running on Port ${PORT}`);
    });
});

