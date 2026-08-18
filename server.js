const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ភ្ជាប់ Database SQLite
const db = new sqlite3.Database('./coffee_shop.db', (err) => {
    if (!err) {
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
    }
});

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

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

