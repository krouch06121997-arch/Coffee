const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

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
    try {
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
                price REAL,
                image_url TEXT
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

        // អាប់ដេត Table Structure បើគ្មាន column image_url (ការពារកុំឱ្យ Crash)
        try {
            db.run("ALTER TABLE menu ADD COLUMN image_url TEXT");
        } catch (e) {
            // មាន Column រួចហើយ
        }

        saveDB();
        console.log("✅ Database initialized successfully.");
    } catch (err) {
        console.error("❌ Database Initialization Error:", err);
    }
}

function saveDB() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// Socket.io Connection
io.on('connection', (socket) => {
    socket.on('join_shop', (shopId) => {
        if (shopId) socket.join(String(shopId));
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

// ២. បន្ថែម Menu (គាំទ្រ URL រូបភាព + Socket Event 'menu_updated')
app.post('/:shopId/admin/menu/add', requireAdminApp, (req, res) => {
    const { shopId } = req.params;
    const { name, price, image_url } = req.body;
    
    db.run(
        "INSERT INTO menu (shop_id, name, price, image_url) VALUES (?, ?, ?, ?)", 
        [shopId, name || '', parseFloat(price) || 0, image_url || '']
    );
    saveDB();

    io.to(shopId).emit('menu_updated');
    res.redirect(`/${shopId}/admin`);
});

// ៣. លុប Menu (ជាមួយនឹង Socket Event 'menu_updated')
app.post('/:shopId/admin/menu/delete/:id', requireAdminApp, (req, res) => {
    const { shopId, id } = req.params;
    db.run("DELETE FROM menu WHERE id = ? AND shop_id = ?", [id, shopId]);
    saveDB();

    io.to(shopId).emit('menu_updated');
    res.redirect(`/${shopId}/admin`);
});

// ៤. ផ្លាស់ប្តូរ Status Order (គាំទ្រ pending -> ready -> done)
app.post('/:shopId/admin/order-status', requireAdminApp, (req, res) => {
    const { shopId } = req.params;
    const { order_id, status } = req.body;
    
    db.run("UPDATE sales SET status = ? WHERE id = ? AND shop_id = ?", [status || 'ready', order_id, shopId]);
    saveDB();
    
    io.to(shopId).emit('customer_confirmed', { orderId: order_id, status });
    res.redirect(`/${shopId}/admin`);
});

// ៥. ទំព័រ Menu សម្រាប់ Customer ( Render ទៅ menu.ejs)
app.get('/:shopId', (req, res) => {
    const { shopId } = req.params;
    const tableNum = req.query.table || '1';

    const menuStmt = db.prepare("SELECT * FROM menu WHERE shop_id = ?");
    menuStmt.bind([shopId]);
    const itemsList = [];
    while (menuStmt.step()) itemsList.push(menuStmt.getAsObject());
    menuStmt.free();

    res.render('menu', { 
        shopId, 
        tableNum, 
        items: itemsList, 
        menuItems: itemsList 
    });
});

// ៦. Customer ចុច Order
app.post('/:shopId/order', (req, res) => {
    const { shopId } = req.params;
    const { table, table_num, item_name, qty, quantity, sugar, note } = req.body;

    const safeTableNum = table || table_num || '1';
    const safeItemName = item_name ? String(item_name) : 'ភេសជ្ជៈ';
    const safeQuantity = parseInt(qty || quantity) || 1;
    const safeSugar = sugar ? String(sugar) : '100%';
    const safeNote = note ? String(note) : '';

    db.run(
        "INSERT INTO sales (shop_id, table_num, item_name, quantity, sugar, note, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
        [shopId, String(safeTableNum), safeItemName, safeQuantity, safeSugar, safeNote]
    );
    saveDB();

    io.to(shopId).emit('new_order');
    res.redirect(`/${shopId}?table=${safeTableNum}`);
});

// បើក Server
initDB().then(() => {
    const PORT = process.env.PORT || 8000;
    server.listen(PORT, () => {
        console.log(`☕ Coffee POS Server Running on Port ${PORT}`);
    });
});

