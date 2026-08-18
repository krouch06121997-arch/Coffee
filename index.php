<?php
// 1. Database Connection & Setup
$db = new SQLite3('coffee_shop.db');

$db->exec("CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_num INTEGER DEFAULT 0,
    item_name TEXT,
    price REAL,
    quantity INTEGER,
    total REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");

$db->exec("CREATE TABLE IF NOT EXISTS menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    image TEXT
)");

// Insert Default Menu if Empty
$check_menu = $db->querySingle("SELECT COUNT(*) FROM menu");
if ($check_menu == 0) {
    $db->exec("INSERT INTO menu (name, price, image) VALUES 
        ('Espresso', 1.50, '☕'),
        ('Iced Latte', 2.50, '🧋'),
        ('Cappuccino', 2.25, '☕'),
        ('Green Tea', 2.00, '🍵')");
}

$current_table = isset($_GET['table']) ? (int)$_GET['table'] : 0;
$message = "";
$last_order = null;

// 2. Process Order
if (isset($_POST['action']) && $_POST['action'] === 'order') {
    $item_id = (int)$_POST['item_id'];
    $qty = (int)$_POST['quantity'];
    $table_num = (int)$_POST['table_num'];
    
    $item = $db->querySingle("SELECT * FROM menu WHERE id = $item_id", true);
    if ($item && $qty > 0) {
        $total = $item['price'] * $qty;
        $stmt = $db->prepare("INSERT INTO sales (table_num, item_name, price, quantity, total) VALUES (:table, :name, :price, :qty, :total)");
        $stmt->bindValue(':table', $table_num, SQLITE3_INTEGER);
        $stmt->bindValue(':name', $item['name'], SQLITE3_TEXT);
        $stmt->bindValue(':price', $item['price'], SQLITE3_FLOAT);
        $stmt->bindValue(':qty', $qty, SQLITE3_INTEGER);
        $stmt->bindValue(':total', $total, SQLITE3_FLOAT);
        $stmt->execute();
        
        $message = "កុម្ម៉ង់ជោគជ័យសម្រាប់ " . ($table_num > 0 ? "តុលេខ $table_num" : "ទូទៅ") . "!";
        $last_order = [
            'table' => $table_num,
            'name' => $item['name'],
            'price' => $item['price'],
            'qty' => $qty,
            'total' => $total,
            'time' => date('H:i:s')
        ];
    }
}

$sales_history = $db->query("SELECT * FROM sales ORDER BY id DESC LIMIT 20");
$menu_items = $db->query("SELECT * FROM menu");
?>

<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Coffee Shop POS & QR System</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #f4f1ea; margin: 0; padding: 15px; color: #333; }
        .container { max-width: 700px; margin: 0 auto; }
        .table-banner { background: #e74c3c; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 15px; }
        
        /* Menu Grid */
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .card { background: white; padding: 12px; border-radius: 8px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.08); }
        .card .icon { font-size: 35px; }
        .price { color: #e67e22; font-weight: bold; margin: 5px 0; }
        button { background: #27ae60; color: white; border: none; padding: 8px; border-radius: 5px; width: 100%; font-weight: bold; cursor: pointer; }
        
        /* Boxes & Receipt */
        .box { background: white; padding: 15px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.08); margin-bottom: 20px; }
        .receipt { background: #fff8e7; border: 2px dashed #d4ac0d; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .flex { display: flex; justify-content: space-between; margin: 5px 0; }
        
        /* Table */
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 14px; }
        th { background: #f8f9fa; }
        .badge { background: #3498db; color: white; padding: 2px 6px; border-radius: 10px; font-size: 12px; }

        /* QR Code Horizontal Scroll */
        .qr-gallery { display: flex; gap: 12px; overflow-x: auto; padding: 10px 0; }
        .qr-item { min-width: 110px; text-align: center; background: #f8f9fa; padding: 8px; border-radius: 8px; border: 1px solid #ddd; }
        .qr-item img { width: 90px; height: 90px; border-radius: 5px; }

        @media print {
            body * { visibility: hidden; }
            .receipt, .receipt * { visibility: visible; }
            .receipt { position: absolute; left: 0; top: 0; width: 100%; }
        }
    </style>
</head>
<body>

<div class="container">
    <div class="table-banner">
        <?= $current_table > 0 ? "📍 អ្នកកំពុងកុម្ម៉ង់នៅ តុលេខ $current_table" : "☕ ប្រព័ន្ធគ្រប់គ្រងការលក់ (POS)" ?>
    </div>

    <?php if ($message): ?>
        <div style="background:#d4edda; color:#155724; padding:10px; text-align:center; border-radius:5px; margin-bottom:15px; font-weight:bold;">
            <?= $message ?>
        </div>
    <?php endif; ?>

    <!-- វិក្កយបត្រចុងក្រោយ (Receipt) -->
    <?php if ($last_order): ?>
        <div class="receipt">
            <h3 style="margin-top:0; text-align:center;">🧾 វិក្កយបត្រ / Receipt</h3>
            <div class="flex"><span>តុ៖</span> <strong><?= $last_order['table'] > 0 ? 'តុលេខ ' . $last_order['table'] : 'ទូទៅ' ?></strong></div>
            <div class="flex"><span>មុខទំនិញ៖</span> <span><?= htmlspecialchars($last_order['name']) ?></span></div>
            <div class="flex"><span>ចំនួន៖</span> <span>x<?= $last_order['qty'] ?> ($<?= number_format($last_order['price'], 2) ?>/កែវ)</span></div>
            <div class="flex" style="border-top:1px solid #ccc; padding-top:5px; font-weight:bold; color:#27ae60;">
                <span>សរុប៖</span> <span>$<?= number_format($last_order['total'], 2) ?></span>
            </div>
            <button onclick="window.print()" style="margin-top:10px; background:#4a2c2a;">🖨️ Print វិក្កយបត្រ</button>
        </div>
    <?php endif; ?>

    <!-- បញ្ជី Menu -->
    <h2>📋 បញ្ជីមុខម្ហូប</h2>
    <div class="grid">
        <?php while ($item = $menu_items->fetchArray(SQLITE3_ASSOC)): ?>
            <div class="card">
                <div class="icon"><?= htmlspecialchars($item['image']) ?></div>
                <div style="font-weight:bold;"><?= htmlspecialchars($item['name']) ?></div>
                <div class="price">$<?= number_format($item['price'], 2) ?></div>
                <form method="POST">
                    <input type="hidden" name="action" value="order">
                    <input type="hidden" name="item_id" value="<?= $item['id'] ?>">
                    <input type="hidden" name="table_num" value="<?= $current_table ?>">
                    <input type="number" name="quantity" value="1" min="1" style="width:50px; text-align:center; margin:5px 0;">
                    <button type="submit">កុម្ម៉ង់</button>
                </form>
            </div>
        <?php endwhile; ?>
    </div>

    <!-- បញ្ជី QR Code សម្រាប់បង្ហាញ ឬឱ្យអតិថិជនស្កែនលើអេក្រង់ -->
    <div class="box">
        <h3 style="margin-top:0;">📱 QR Code សម្រាប់តុទាំង ១០</h3>
        <p style="font-size:12px; color:#666; margin-bottom:5px;">អូសទៅស្តាំដើម្បីមើល QR Code តាមតុ ៖</p>
        <div class="qr-gallery">
            <?php for($i = 1; $i <= 10; $i++): ?>
                <div class="qr-item">
                    <img src="qr-table-<?= $i ?>.png" alt="តុ <?= $i ?>">
                    <div style="font-weight:bold; font-size:13px; margin-top:3px;">តុ <?= $i ?></div>
                    <a href="qr-table-<?= $i ?>.png" download style="font-size:11px; color:#3498db; text-decoration:none;">Download</a>
                </div>
            <?php endfor; ?>
        </div>
    </div>

    <!-- តារាងប្រវត្តិលក់ -->
    <div class="box">
        <h3 style="margin-top:0;">📊 ប្រវត្តិលក់ចុងក្រោយ</h3>
        <table>
            <thead>
                <tr>
                    <th>តុ</th>
                    <th>ទំនិញ</th>
                    <th>ចំនួន</th>
                    <th>សរុប</th>
                    <th>ម៉ោង</th>
                </tr>
            </thead>
            <tbody>
                <?php while ($row = $sales_history->fetchArray(SQLITE3_ASSOC)): ?>
                    <tr>
                        <td><span class="badge">តុ <?= $row['table_num'] ?></span></td>
                        <td><?= htmlspecialchars($row['item_name']) ?></td>
                        <td>x<?= $row['quantity'] ?></td>
                        <td>$<?= number_format($row['total'], 2) ?></td>
                        <td><?= date('H:i', strtotime($row['created_at'])) ?></td>
                    </tr>
                <?php endwhile; ?>
            </tbody>
        </table>
    </div>
</div>

</body>
</html>

