const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);const initSqlJs = require('sql.js');
const fs = require('fs');

let db;

// មុខងារ save ដិនន័យចូលឯកសារ coffee_shop.db
function saveDb() {
    if (db) {
            const data = db.export();
                    const buffer = Buffer.from(data);
                            fs.writeFileSync('./coffee_shop.db', buffer);
                                }
                                }

                                // ចាប់ផ្តើម Database
                                initSqlJs().then(SQL => {
                                    if (fs.existsSync('./coffee_shop.db')) {
                                            const filebuffer = fs.readFileSync('./coffee_shop.db');
                                                    db = new SQL.Database(filebuffer);
                                                        } else {
                                                                db = new SQL.Database();
                                                                    }
                                    // បន្ថែម Wrapper នេះដើម្បីឱ្យកូដចាស់ (db.all, db.run) ដើរជាមួយ sql.js បាន
db.all = function(sql, params = [], callback) {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }
    try {
        const stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        const result = [];
        while (stmt.step()) {
            result.push(stmt.getAsObject());
        }
        stmt.free();
        if (callback) callback(null, result);
        return result;
    } catch (err) {
        if (callback) callback(err);
    }
};

// អនុញ្ញាតឱ្យ db.run ដើរជាមួយ callback ចាស់ដែរ
const originalRun = db.run.bind(db);
db.run = function(sql, params = [], callback) {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }
    try {
        originalRun(sql, params);
        saveDb(); // Auto-save ចូល file coffee_shop.db ពេលមានការ Insert/Update
        if (callback) callback(null);
    } catch (err) {
        if (callback) callback(err);
    }
};


                                                                        // បង្កើត Table ប្រសិនបើមិនទាន់មាន
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
                                                                                                                                                                                                                

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


io.on('connection', (socket) => {
    socket.on('join_shop', (shopId) => socket.join(shopId));
    socket.on('join_order', (orderId) => socket.join(`order_${orderId}`));
});

// ----------------- ROUTES ----------------- //

// ១. ទំព័រកុម្ម៉ង់ Menu សម្រាប់អតិថិជន
app.get('/:shopId/', (req, res) => {
    const shopId = req.params.shopId;
    const tableNum = req.query.table || 1;
    db.all("SELECT * FROM menu WHERE shop_id = ?", [shopId], (err, items) => {
        res.render('menu', { items: items || [], tableNum, shopId });
    });
});

// ២. ទំព័រតាមដានស្ថានភាព Order របស់អតិថិជន (Order Tracking)
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
            const orderId = this.lastID;
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

// ៤. ទំព័រ Admin Dashboard (មើល Menu, ប្រវត្តិលក់ប្រចាំថ្ងៃ និងគ្រប់គ្រង Status)
app.get('/:shopId/admin', (req, res) => {
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

// ៥. មុខងារ Admin បន្ថែម Menu ថ្មី
app.post('/:shopId/admin/menu/add', (req, res) => {
    const shopId = req.params.shopId;
    const { name, price } = req.body;
    db.run("INSERT INTO menu (shop_id, name, price) VALUES (?, ?, ?)", [shopId, name, price], () => {
        res.redirect(`/${shopId}/admin`);
    });
});

// ៦. មុខងារ Admin លុប Menu ចោល
app.post('/:shopId/admin/menu/delete/:id', (req, res) => {
    const { shopId, id } = req.params;
    db.run("DELETE FROM menu WHERE id = ? AND shop_id = ?", [id, shopId], () => {
        res.redirect(`/${shopId}/admin`);
    });
});

// ၇. ម្ចាស់ហាងប្តូរ Status Order ថា "ឆុងរួចរាល់ (Ready)"
app.post('/:shopId/admin/order-status', (req, res) => {
    const { shopId } = req.params;
    const { order_id, status } = req.body;

    db.run("UPDATE sales SET status = ? WHERE id = ? AND shop_id = ?", [status, order_id, shopId], () => {
        io.to(`order_${order_id}`).emit('status_change', { status });
        res.redirect(`/${shopId}/admin`);
    });
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

app.get('/', (req, res) => {
    res.redirect('/shop1/?table=1');
});



// បន្ថែម Menu ថ្មី
app.post('/:shopId/admin/menu/add', (req, res) => {
    const shopId = req.params.shopId;
    const { name, price } = req.body;
    db.run("INSERT INTO menu (shop_id, name, price) VALUES (?, ?, ?)", [shopId, name, price], () => {
        // ប្រកាសប្រាប់អេក្រង់អតិថិជនឱ្យ Refresh ទាញយក Menu ថ្មី
        io.to(shopId).emit('menu_updated');
        res.redirect(`/${shopId}/admin`);
    });
});


const PORT = process.env.PORT || 8000;

// '0.0.0.0' អនុញ្ញាតឱ្យឧបករណ៍គ្រប់ក្នុង Wi-Fi អាច Scan ចូលបាន
server.listen(PORT, '0.0.0.0', () => {
    console.log(`☕ Coffee POS Server កំពុងដំណើរការលើ Port ${PORT}`);
    });

const cors = require('cors');
app.use(cors({
    origin: '*',
    credentials: true
}));

// ១. Route សម្រាប់ Admin (ត្រូវដាក់នៅខាងលើកុំឱ្យច្រឡំជាមួយ :shopId)
app.get('/admin', (req, res) => {
    db.all("SELECT * FROM menu", [], (err, items) => {
        res.render('admin', { items: items || [] });
    });
});

// Route សម្រាប់ Post បន្ថែម Menu ថ្មី
app.post('/admin/add', (req, res) => {
    const { shop_id, item_name, price } = req.body;
    db.run("INSERT INTO menu (shop_id, item_name, price) VALUES (?, ?, ?)", 
    [shop_id || 'shop1', item_name, price], (err) => {
        res.redirect('/admin');
    });
});

// --------------------------------------------------
// ២. Route សម្រាប់អតិថិជន (ត្រូវដាក់នៅក្រោម /admin)
app.get('/:shopId', (req, res) => {
    // ... កូដចាស់របស់អ្នក ...
});
