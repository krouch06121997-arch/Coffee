const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');
const os = require('os');
const fs = require('fs');
const path = require('path');

const app = express();

// Set Up View Engine និង Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// បង្កើត Folder សម្រាប់រក្សុទុករូបភាព QR Code ប្រសិនបើមិនទាន់មាន
const qrDir = './qrcodes_img';
if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir);
}

// បង្កើត / ភ្ជាប់ Database សម្រាប់កត់ត្រាការលក់ និង Menu
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

        // បន្ថែម Menu គំរូ ប្រសិនបើមិនទាន់មានទិន្នន័យ
        db.get("SELECT COUNT(*) as count FROM menu", (err, row) => {
            if (row && row.count === 0) {
                db.run("INSERT INTO menu (name, price) VALUES ('Espresso', 1.50), ('Iced Latte', 2.50), ('Cappuccino', 2.25), ('Green Tea', 2.00)");
            }
        });
    }
});

// មុខងារស្វែងរក IP Address របស់ Server ក្នុង Wi-Fi Local
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return 'localhost';
}

// មុខងារ Auto Save QR Code ទាំង ១០ តុ ជា PNG និងបង្កើត ZIP
async function generateQRCodesAndZip() {
    const localIp = getLocalIpAddress();
    const port = 8000;

    for (let i = 1; i <= 10; i++) {
        const url = `http://${localIp}:${port}/?table=${i}`;
        const filePath = path.join(qrDir, `table_${i}.png`);
        
        await QRCode.toFile(filePath, url, {
            width: 300,
            margin: 2
        });
    }
    console.log('✅ រូបភាព QR Code ទាំង ១០ ត្រូវបានបង្កើតក្នុង Folder "qrcodes_img"');
}

// ----------------- ROUTES ----------------- //

// ចូលមក http://localhost:8000/ ភ្លាម ឱ្យទៅ Admin (លើកលែងតែមាន ?table=X ពីការ Scan)
app.get('/', (req, res) => {
    if (req.query.table) {
        const tableNum = req.query.table;
        db.all("SELECT * FROM menu", [], (err, items) => {
            if (err) items = [];
            res.render('menu', { items, tableNum });
        });
    } else {
        res.redirect('/admin');
    }
});

// ទំព័រ Admin Dashboard
app.get('/admin', (req, res) => {
    db.all("SELECT * FROM menu", [], (err, menuItems) => {
        db.all("SELECT * FROM sales ORDER BY id DESC LIMIT 20", [], (err, salesItems) => {
            db.get("SELECT SUM(total) as grandTotal FROM sales", [], (err, row) => {
                const grandTotal = (row && row.grandTotal) ? row.grandTotal : 0;
                res.render('admin', { menuItems: menuItems || [], salesItems: salesItems || [], grandTotal });
            });
        });
    });
});

// បន្ថែម Menu ថ្មីពី Admin
app.post('/admin/menu/add', (req, res) => {
    const { name, price } = req.body;
    db.run("INSERT INTO menu (name, price) VALUES (?, ?)", [name, price], () => {
        res.redirect('/admin');
    });
});

// លុប Menu ពី Admin
app.get('/admin/menu/delete/:id', (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM menu WHERE id = ?", [id], () => {
        res.redirect('/admin');
    });
});

// ទទួលការកុម្ម៉ង់ពីអតិថិជន
app.post('/order', (req, res) => {
    const { table, item_name, price, qty, sugar } = req.body;
    const sugarVal = sugar || '100%';
    const total = parseFloat(price) * parseInt(qty);

    db.run(
        `INSERT INTO sales (table_num, item_name, quantity, sugar, total) VALUES (?, ?, ?, ?, ?)`,
        [table, item_name, qty, sugarVal, total],
        (err) => {
            res.send(`
                <script>
                    alert('✅ បានកុម្ម៉ង់ជោគជ័យ! (តុទី ${table} | ស្ករ: ${sugarVal})');
                    window.location.href = '/?table=${table}';
                </script>
            `);
        }
    );
});

// Route សម្រាប់ Print ឬទាញយក QR Code ទាំង ១០ តុ
app.get('/qrcodes', async (req, res) => {
    const localIp = getLocalIpAddress();
    const port = 8000;
    const qrList = [];

    for (let i = 1; i <= 10; i++) {
        const url = `http://${localIp}:${port}/?table=${i}`;
        const qrImage = await QRCode.toDataURL(url);
        qrList.push({ table: i, url: url, qrImage: qrImage });
    }

    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR Codes ទាំង ១០ តុ</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body class="bg-light p-4">
            <div class="container text-center">
                <div class="no-print mb-4">
                    <h2>📌 QR Code សម្រាប់តុទាំង ១០</h2>
                    <p class="text-muted">ភ្ជាប់ Wi-Fi ហាង រួច Scan QR Code តាមតុនីមួយៗ</p>
                    <button onclick="window.print()" class="btn btn-primary btn-lg">🖨️ Print QR Codes ទាំងអស់</button>
                    <a href="/admin" class="btn btn-secondary btn-lg ms-2">⬅️ ទៅកាន់ Admin Dashboard</a>
                </div>
                <div class="row g-4">
    `;

    qrList.forEach(item => {
        html += `
            <div class="col-md-4 col-sm-6">
                <div class="card p-3 shadow-sm border-2 rounded-4">
                    <h3 class="fw-bold mb-1">តុលេខ ${item.table}</h3>
                    <img src="${item.qrImage}" class="img-fluid mx-auto" style="max-width:200px;">
                    <small class="text-muted mt-2">${item.url}</small>
                </div>
            </div>
        `;
    });

    html += `
                </div>
            </div>
        </body>
        </html>
    `;

    res.send(html);
});

// Link សម្រាប់ Download File ZIP នៃ QR Code ទាំងអស់
app.get('/download-qr', (req, res) => {
    const zipPath = './qrcodes.zip';
    if (fs.existsSync(zipPath)) {
        res.download(zipPath);
    } else {
        res.send("សូមរត់ដកស្រង់ File ZIP តាម Terminal ជាមុនសិន!");
    }
});

// បើក Server
app.listen(8000, '0.0.0.0', () => {
    console.log(`Server running at http://${getLocalIpAddress()}:8000`);
    generateQRCodesAndZip();
});

