const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const multer = require('multer'); // ថែម multer

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// រៀបចំ Folder សម្រាប់រក្សារូបភាព Upload
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ការរៀបចំ Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

        try {
            db.run("ALTER TABLE menu ADD COLUMN image_url TEXT");
        } catch (e) {}

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

io.on('connection', (socket) => {
    socket.on('join_shop', (shopId) => {
        if (shopId) socket.join(String(shopId));
    });
});

// ---------------- ROUTES ----------------

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

// ២. បន្ថែម Menu ដោយ Upload រូបភាព ( upload.single('image') )
app.post('/:shopId/admin/menu/add', requireAdminApp, upload.single('image'), (req, res) => {
    const { shopId } = req.params;
    const { name, price } = req.body;
    
    // បើមាន File Upload យក Path រូបភាព តែបើគ្មានទេទុកទទេ
    let image_url = '';
    if (req.file) {
        image_url = '/uploads/' + req.file.filename;
    }

    db.run(
        "INSERT INTO menu (shop_id, name, price, image_url) VALUES (?, ?, ?, ?)", 
        [shopId, name || '', parseFloat(price) || 0, image_url]
    );
    saveDB();

    io.to(shopId).emit('menu_updated');
    res.redirect(`/${shopId}/admin`);
});

app.post('/:shopId/admin/menu/delete/:id', requireAdminApp, (req, res) => {
    const { shopId, id } = req.params;
    
    // លុបរូបភាពចេញពី Folder ពេលលុប Menu (Optional Clean Up)
    const stmt = db.prepare("SELECT image_url FROM menu WHERE id = ? AND shop_id = ?");
    stmt.bind([id, shopId]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.image_url && row.image_url.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, 'public', row.image_url);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
    stmt.free();

    db.run("DELETE FROM menu WHERE id = ? AND shop_id = ?", [id, shopId]);
    saveDB();

    io.to(shopId).emit('menu_updated');
    res.redirect(`/${shopId}/admin`);
});

app.post('/:shopId/admin/order-status', requireAdminApp, (req, res) => {
    const { shopId } = req.params;
    const { order_id, status } = req.body;
    
    db.run("UPDATE sales SET status = ? WHERE id = ? AND shop_id = ?", [status || 'ready', order_id, shopId]);
    saveDB();
    
    io.to(shopId).emit('customer_confirmed', { orderId: order_id, status });
    res.redirect(`/${shopId}/admin`);
});

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

initDB().then(() => {
    const PORT = process.env.PORT || 8000;
    server.listen(PORT, () => {
        console.log(`☕ Coffee POS Server Running on Port ${PORT}`);
    });
});

