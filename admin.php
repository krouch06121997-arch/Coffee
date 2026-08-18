<?php
$db = new SQLite3('coffee_shop.db');

// លុបមុខម្ហូប
if (isset($_GET['delete_menu'])) {
    $db->exec("DELETE FROM menu WHERE id = " . (int)$_GET['delete_menu']);
}
// លុបទិន្នន័យលក់ទាំងអស់ (Reset)
if (isset($_GET['reset'])) {
    $db->exec("DELETE FROM sales");
}

$grand_total = $db->querySingle("SELECT SUM(total) FROM sales");
$menu_items = $db->query("SELECT * FROM menu");
$sales_history = $db->query("SELECT * FROM sales ORDER BY id DESC LIMIT 50");
?>

<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <title>Admin Dashboard - Coffee Shop</title>
    <style>
        body { font-family: sans-serif; background: #f0f2f5; padding: 20px; }
        .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .stats { background: #2c3e50; color: white; padding: 20px; border-radius: 10px; text-align: center; font-size: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
        .btn-del { color: red; text-decoration: none; font-weight: bold; }
        .btn-reset { background: #e74c3c; color: white; padding: 10px; border: none; border-radius: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>👨‍💼 ផ្ទាំងគ្រប់គ្រងម្ចាស់ហាង (Admin)</h1>
    
    <div class="stats">
        ចំណូលសរុប៖ <strong>$<?= number_format($grand_total ?? 0, 2) ?></strong>
    </div>

    <div class="card">
        <h3>📋 គ្រប់គ្រងម៉ឺនុយ</h3>
        <table>
            <?php while ($item = $menu_items->fetchArray(SQLITE3_ASSOC)): ?>
            <tr>
                <td><?= $item['name'] ?></td>
                <td>$<?= $item['price'] ?></td>
                <td><a href="?delete_menu=<?= $item['id'] ?>" class="btn-del">លុប</a></td>
            </tr>
            <?php endwhile; ?>
        </table>
    </div>

    <div class="card">
        <h3>📊 ប្រវត្តិលក់ (50 ចុងក្រោយ)</h3>
        <table>
            <tr><th>តុ</th><th>ទំនិញ</th><th>សរុប</th></tr>
            <?php while ($row = $sales_history->fetchArray(SQLITE3_ASSOC)): ?>
            <tr>
                <td>តុ <?= $row['table_num'] ?></td>
                <td><?= $row['item_name'] ?> (x<?= $row['quantity'] ?>)</td>
                <td>$<?= number_format($row['total'], 2) ?></td>
            </tr>
            <?php endwhile; ?>
        </table>
        <br>
        <button class="btn-reset" onclick="if(confirm('សម្អាតទិន្នន័យទាំងអស់?')) window.location='?reset=1'">សម្អាតប្រវត្តិលក់ (Reset)</button>
    </div>
    
    <a href="index.php">⬅️ ត្រឡប់ទៅទំព័រអតិថិជន</a>
</body>
</html>

