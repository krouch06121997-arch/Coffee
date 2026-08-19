const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Middlewares (ត្រូវដាក់នៅខាងលើគេជានិច្ច)
app.use(cors({ origin: '*', credentials: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

let db;
const dbFilePath = path.join(__dirname, 'coffee_shop.db');

function saveDb() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbFilePath, buffer);
    }
}

// 2. ចាប់ផ្តើម Database & បន្ថែម Wrappers ឱ្យពេញលេញ
initSqlJs().then(SQL => {
    if (fs.existsSync(dbFilePath)) {
        const filebuffer = fs.readFileSync(dbFilePath);
        db = new SQL.Database(filebuffer);
    } else {
        db = new SQL.Database();
    }

    // Wrapper: db.all
    db.all = function(sql, params = [], callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        try {
            const stmt = db.prepare(sql);
            if (params.length) stmt.bind(params);
            const result = [];
            while (stmt.step()) result.push(stmt.getAsObject());
            stmt.free();
            if (callback) callback(null, result);
            return result;
        } catch (err) {
            if (callback) callback(err);
        }
    };

    // Wrapper: db.get (បន្ថែមថ្មីដើម្បីកុំឱ្យ Error)
    db.get = function(sql, params = [], callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        try {
            const stmt = db.prepare(sql);
            if (params.length) stmt.bind(params);
            const row = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            if (callback) callback(null, row);
            return row;
        } catch (err) {
            if (callback) callback(err);
        }
    };

    // Wrapper: db.run (កែសម្រួលដើម្បី support lastID)
    const originalRun = db.run.bind(db);
    db.run = function(sql, params = [], callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        try {
            originalRun(sql, params);
            saveDb();
            // ទាញយក ID ដែលទើប Insert រួច
            const lastIdStmt = db.prepare("SELECT last_insert_rowid() as id");
            lastIdStmt.step();
            const lastID = lastIdStmt.getAsObject().id;
            lastIdStmt.free();

            if (callback) callback.call({ lastID }, null);
        } catch (err) {
            if (callback) callback(err);
        }
    };

    // បង្កើត Tables
    db.run(`CREATE TABLE IF NOT EXISTS menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL DEFAULT 'shop1',
        name TEXT NOT NULL,
        price REAL NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL DEFAULT 'shop1',
        table_num INTEGER,
        item_name TEXT,
        quantity INTEGER,
        sugar TEXT,
        note TEXT,
        total REAL,
        status TEXT DEFAULT 'pending',
        created_at DATE DEFAULT CURRENT_TIMESTAMP
    )`);

    saveDb();
    console.log("☕ Database initialized successfully with sql.js!");
});

// 3. SOCKET.IO REALTIME
io.on('connection', (socket) => {
    socket.on('join_shop', (shopId) => socket.join(shopId));
    socket.on('join_order', (orderId) => socket.join(`order_${orderId}`));
});

// ----------------- ROUTES ----------------- //

// Route ទំព័រដើម Default
app.get('/', (req, res) => {
    res.redirect('/shop1/?table=1');
});

// Direct Admin Shortcut Redirect
app.get('/admin', (req, res) => {
    res.redirect('/shop1/admin');
});



// ៥. មុខងារ Admin បន្ថែម Menu ថ្មី
app.post('/:shopId/admin/menu/add', (req, res) => {
    const shopId = req.params.shopId;
    const { name, price } = req.body;
    db.run("INSERT INTO menu (shop_id, name, price) VALUES (?, ?, ?)", [shopId, name, price], function(err) {
        io.to(shopId).emit('menu_updated');
        res.redirect(`/${shopId}/admin`);
    });
});

// ៦. មុខងារ Admin លុប Menu ចោល
app.post('/:shopId/admin/menu/delete/:id', (req, res) => {
    const { shopId, id } = req.params;
    db.run("DELETE FROM menu WHERE id = ? AND shop_id = ?", [id, shopId], () => {
        io.to(shopId).emit('menu_updated');
        res.redirect(`/${shopId}/admin`);
    });
});

// ៧. ម្ចាស់ហាងប្តូរ Status Order
app.post('/:shopId/admin/order-status', (req, res) => {
    const { shopId } = req.params;
    const { order_id, status } = req.body;

    db.run("UPDATE sales SET status = ? WHERE id = ? AND shop_id = ?", [status, order_id, shopId], () => {
        io.to(`order_${order_id}`).emit('status_change', { status });
        res.redirect(`/${shopId}/admin`);
    });
});

// ១. ទំព័រកុម្ម៉ង់ Menu សម្រាប់អតិថិជន (ដាក់នៅក្រោម Admin ជានិច្ច)
app.get('/:shopId', (req, res) => {
    const shopId = req.params.shopId;
    const tableNum = req.query.table || 1;
    db.all("SELECT * FROM menu WHERE shop_id = ?", [shopId], (err, items) => {
        res.render('menu', { items: items || [], tableNum, shopId });
    });
});

// ២. ទំព័រតាមដានស្ថានភាព Order របស់អតិថិជន
app.get('/:shopId/order-status/:orderId', (req, res) => {
    const { shopId, orderId } = req.params;
    db.get("SELECT * FROM sales WHERE id = ? AND shop_id = ?", [orderId, shopId], (err, order) => {
        if (!order) return res.send("រកមិនឃើញ Order នេះទេ!");
        res.render('order_status', { order, shopId });
    });
});

// ៣. ទទួលការកុម្ម៉ង់ថ្មីពីអតិថិជន
app.post('/:shopId/order', (req, res) => {
    const shopId = req.params.shopId;
    const { table, item_name, price, qty, sugar, note } = req.body;
    const total = parseFloat(price) * parseInt(qty);

    db.run(
        `INSERT INTO sales (shop_id, table_num, item_name, quantity, sugar, note, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [shopId, table, item_name, qty, sugar || '100%', note || '-', total],
        function(err) {
            const orderId = this ? this.lastID : null;
            const newOrder = {
                id: orderId,
                table_num: table,
                item_name,
                quantity: qty,
                sugar: sugar || '100%',
                note: note || '-',
                total: total.toFixed(2),
                status: 'pending'
            };

            io.to(shopId).emit('new_order', newOrder);
            res.redirect(`/${shopId}/order-status/${orderId}`);
        }
    );
});

// ៨. អតិថិជនចុចបញ្ជាក់ថា "បានទទួលភេសជ្ជៈរួចរាល់"
app.post('/:shopId/customer/confirm-received', (req, res) => {
    const { shopId } = req.params;
    const { order_id } = req.body;

    db.run("UPDATE sales SET status = 'completed' WHERE id = ? AND shop_id = ?", [order_id, shopId], () => {
        io.to(shopId).emit('customer_confirmed', { orderId: order_id });
        io.to(`order_${order_id}`).emit('status_change', { status: 'completed' });
        res.json({ success: true });
    });
});
// បន្ថែម Middleware ការពារ Admin Route (អនុញ្ញាតតែ App Admin ឬ Localhost)
const requireAdminApp = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.includes('Capacitor') || req.ip === '127.0.0.1' || req.ip === '::1' || req.ip.includes('127.0.0.1')) {
        return next();
    }
    res.status(403).send("⛔ អ្នកមិនមានសិទ្ធិចូលកាន់ទំព័រ Admin ឡើយ!");
};

// ៤. ទំព័រ Admin Dashboard (យក requireAdminApp មកការពារនៅត្រង់នេះ)
app.get('/:shopId/admin', requireAdminApp, (req, res) => {
    const shopId = req.params.shopId;
    db.all(
        "SELECT * FROM sales WHERE shop_id = ? AND date(created_at) = date('now', 'localtime') ORDER BY id DESC", 
        [shopId], 
        (err, salesItems) => {
            db.get(
                "SELECT SUM(total) as grandTotal FROM sales WHERE shop_id = ? AND date(created_at) = date('now', 'localtime')", 
                [shopId], 
                (err, row) => {
                    db.all("SELECT * FROM menu WHERE shop_id = ?", [shopId], (err, menuItems) => {
                        res.render('admin', { 
                            menuItems: menuItems || [], 
                            salesItems: salesItems || [], 
                            grandTotal: (row && row.grandTotal) ? row.grandTotal : 0, 
                            shopId 
                        });
                    });
                }
            );
        }
    );
});



// 5. Start Server
const PORT = process.env.PORT || 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`☕ Coffee POS Server កំពុងដំណើរការលើ Port ${PORT}`);
});

