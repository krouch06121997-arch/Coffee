import sqlite3
from flask import Flask, render_template_string, request

app = Flask(__name__)

def init_db():
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_num INTEGER,
            item_name TEXT,
            quantity INTEGER,
            total REAL
        )
    ''')
    cursor.execute("SELECT COUNT(*) FROM menu")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("INSERT INTO menu (name, price) VALUES (?, ?)", [
            ('Espresso', 1.50),
            ('Iced Latte', 2.50),
            ('Cappuccino', 2.25),
            ('Green Tea', 2.00)
        ])
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    table = request.args.get('table', 1)
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM menu")
    items = cursor.fetchall()
    conn.close()
    
    html = '''
    <!DOCTYPE html>
    <html lang="km">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Coffee POS</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
        <div class="container py-4" style="max-width: 500px;">
            <div class="card shadow-sm mb-4 border-0 rounded-4 bg-primary text-white text-center p-3">
                <h3 class="m-0">☕ កុម្ម៉ង់កាហ្វេ</h3>
                <small>តុលេខ {{table}}</small>
            </div>

            <div class="row g-3">
                {% for item in items %}
                <div class="col-12">
                    <div class="card border-0 shadow-sm rounded-3 p-3 d-flex flex-row align-items-center justify-content-between">
                        <div>
                            <h5 class="mb-1 fw-bold">{{ item[1] }}</h5>
                            <span class="text-success fw-bold">${{ "%.2f"|format(item[2]) }}</span>
                        </div>
                        <form action="/order" method="POST" class="d-flex align-items-center gap-2">
                            <input type="hidden" name="table" value="{{table}}">
                            <input type="hidden" name="item_name" value="{{ item[1] }}">
                            <input type="hidden" name="price" value="{{ item[2] }}">
                            <input type="number" name="qty" value="1" min="1" class="form-control text-center" style="width: 60px;">
                            <button type="submit" class="btn btn-success rounded-3 fw-bold">កុម្ម៉ង់</button>
                        </form>
                    </div>
                </div>
                {% endfor %}
            </div>

            <div class="text-center mt-4">
                <a href="/admin" class="btn btn-outline-secondary btn-sm">👨‍💼 ទៅកាន់ Admin Dashboard</a>
            </div>
        </div>
    </body>
    </html>
    '''
    return render_template_string(html, items=items, table=table)

@app.route('/order', methods=['POST'])
def order():
    table = request.form.get('table')
    item_name = request.form.get('item_name')
    price = float(request.form.get('price'))
    qty = int(request.form.get('qty'))
    total = price * qty

    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO sales (table_num, item_name, quantity, total) VALUES (?, ?, ?, ?)",
                   (table, item_name, qty, total))
    conn.commit()
    conn.close()

    html = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light d-flex align-items-center justify-content-center vh-100">
        <div class="card p-4 shadow-sm text-center rounded-4" style="max-width: 400px;">
            <h2 class="text-success mb-3">✅ ជោគជ័យ!</h2>
            <p class="fs-5">បានកុម្ម៉ង់ <b>{item_name}</b> x{qty}</p>
            <h4 class="text-primary mb-3">សរុប៖ ${total:.2f} (តុ {table})</h4>
            <a href="/?table={table}" class="btn btn-primary rounded-3">កុម្ម៉ង់បន្ថែមទៀត</a>
        </div>
    </body>
    </html>
    '''
    return html

@app.route('/admin')
def admin():
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT SUM(total) FROM sales")
    result = cursor.fetchone()[0]
    grand_total = result if result else 0.0
    cursor.execute("SELECT * FROM sales ORDER BY id DESC LIMIT 20")
    sales = cursor.fetchall()
    conn.close()

    html = '''
    <!DOCTYPE html>
    <html lang="km">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Admin Dashboard</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
        <div class="container py-4">
            <h2 class="mb-4">👨‍💼 ផ្ទាំងគ្រប់គ្រងម្ចាស់ហាង</h2>
            
            <div class="card bg-dark text-white p-4 rounded-4 shadow-sm mb-4">
                <small class="text-white-50">ចំណូលសរុប</small>
                <h1 class="display-5 fw-bold text-warning m-0">${{ "%.2f"|format(grand_total) }}</h1>
            </div>

            <div class="card border-0 shadow-sm rounded-4 p-3">
                <h4 class="mb-3">📊 ប្រវត្តិលក់ចុងក្រោយ</h4>
                <div class="table-responsive">
                    <table class="table table-hover align-middle">
                        <thead class="table-light">
                            <tr><th>តុ</th><th>ទំនិញ</th><th>ចំនួន</th><th>សរុប</th></tr>
                        </thead>
                        <tbody>
                            {% for s in sales %}
                            <tr>
                                <td><span class="badge bg-secondary">តុ {{s[1]}}</span></td>
                                <td class="fw-bold">{{s[2]}}</td>
                                <td>{{s[3]}}</td>
                                <td class="text-success fw-bold">${{ "%.2f"|format(s[4]) }}</td>
                            </tr>
                            {% endfor %}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="mt-4">
                <a href="/" class="btn btn-link text-decoration-none">⬅️ ត្រឡប់ទៅទំព័រអតិថិជន</a>
            </div>
        </div>
    </body>
    </html>
    '''
    return render_template_string(html, grand_total=grand_total, sales=sales)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)

