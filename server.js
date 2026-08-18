const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'secret_key_coffee_app',
    resave: false,
    saveUninitialized: true
}));

const db = new sqlite3.Database('./coffee_shop.db', (err) => {
    if (!err) {
        db.run(`CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT NOT NULL, 
            price REAL NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            table_num INTEGER, 
            item_name TEXT, 
            quantity INTEGER, 
            sugar TEXT, 
            total REAL
        )`);
    }
});

function checkAdminAuth(req, res, next) {
    if (req.session.isAdmin) {
        next();
    } else {
        res.redirect('/login');
    }
}

// ទំព័រ Menu សម្រាប់អតិថិជន
app.get('/', (req, res) => {
    const tableNum = req.query.table || 1;
    db.all("SELECT * FROM menu", [], (err, items) => {
        if (err) items = [];
        res.render('menu', { items, tableNum });
    });
});

// ទទួល Order និងរក្សាទុកព័ត៌មានស្ករ
app.post('/order', (req, res) => {
    const { table, item_name, price, qty, sugar } = req.body;
    const sugarVal = sugar || '100%';
    const total = parseFloat(price) * parseInt(qty);

    db.run(
        `INSERT INTO sales (table_num, item_name, quantity, sugar, total) VALUES (?, ?, ?, ?, ?)`,
        [table, item_name, qty, sugarVal, total],
        (err) => {
            if (err) {
                console.error(err.message);
            }
            res.send(`
                <script>
                    alert('✅ កុម្ម៉ង់បានជោគជ័យ! (ស្ករ: ${sugarVal})');
                    window.location.href = '/?table=${table}';
                </script>
            `);
        }
    );
});

// Admin Login
app.get('/login', (req, res) => {
    res.send(`
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <div class="container py-5" style="max-width:400px;">
            <h3 class="text-center mb-3">🔐 Admin Login</h3>
            <form action="/login" method="POST" class="card p-4 shadow-sm">
                <input type="password" name="password" placeholder="បញ្ចូលលេខសម្ងាត់" class="form-control mb-3" required>
                <button type="submit" class="btn btn-primary w-100">Login</button>
            </form>
        </div>
    `);
});

app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
        res.send(`<script>alert('❌ លេខសម្ងាត់មិនត្រឹមត្រូវ!'); window.location.href='/login';</script>`);
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Admin Dashboard
app.get('/admin', checkAdminAuth, (req, res) => {
    db.all("SELECT * FROM menu", [], (err, menuItems) => {
        db.all("SELECT * FROM sales ORDER BY id DESC LIMIT 20", [], (err, salesItems) => {
            db.get("SELECT SUM(total) as grandTotal FROM sales", [], (err, row) => {
                const grandTotal = (row && row.grandTotal) ? row.grandTotal : 0;
                res.render('admin', { menuItems: menuItems || [], salesItems: salesItems || [], grandTotal });
            });
        });
    });
});

app.post('/admin/menu/add', checkAdminAuth, (req, res) => {
    const { name, price } = req.body;
    db.run("INSERT INTO menu (name, price) VALUES (?, ?)", [name, price], () => {
        res.redirect('/admin');
    });
});

app.get('/admin/menu/delete/:id', checkAdminAuth, (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM menu WHERE id = ?", [id], () => {
        res.redirect('/admin');
    });
});

app.listen(8000, () => {
    console.log('Server is running on http://localhost:8000');
});
