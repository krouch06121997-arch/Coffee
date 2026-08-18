import sqlite3
from flask import Flask, render_template_string, request, redirect, url_for

app = Flask(__name__)

def init_db():
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT NOT NULL, 
        price REAL NOT NULL
    )''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        table_num INTEGER, 
        item_name TEXT, 
        quantity INTEGER, 
        sugar TEXT, 
        total REAL
    )''')
    
    cursor.execute("SELECT COUNT(*) FROM menu")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("INSERT INTO menu (name, price) VALUES (?, ?)", [
            ('Espresso', 1.50), ('Iced Latte', 2.50), ('Cappuccino', 2.25), ('Green Tea', 2.00)
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
    
    return render_template_string('''
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
                    <div class="card border-0 shadow-sm rounded-4 p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h5 class="mb-0 fw-bold">{{ item[1] }}</h5>
                            <span class="text-success fw-bold fs-5">${{ "%.2f"|format(item[2]) }}</span>
                        </div>
                        <form action="/order" method="POST">
                            <input type="hidden" name="table" value="{{table}}">
                            <input type="hidden" name="item_name" value="{{ item[1] }}">
                            <input type="hidden" name="price" value="{{ item[2] }}">
                            
                            <div class="row g-2 align-items-center">
                                <div class="col-5">
                                    <label class="form-label mb-1"><small>🍬 ស្ករ</small></label>
                                    <select name="sugar" class="form-select form-select-sm rounded-3">
                                        <option value="100%">100%</option>
                                        <option value="75%">75%</option>
                                        <option value="50%">50%</option>
                                        <option value="25%">25%</option>
                                        <option value="0%">0% (ឥតស្ករ)</option>
                                    </select>
                                </div>
                                <div class="col-3">
                                    <label class="form-label mb-1"><small>ចំនួន</small></label>
                                    <input type="number" name="qty" value="1" min="1" class="form-control form-control-sm text-center rounded-3">
                                </div>
                                <div class="col-4 align-self-end">
                                    <button type="submit" class="btn btn-success btn-sm w-100 rounded-3 fw-bold">កុម្ម៉ង់</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
                {% endfor %}
            </div>

            <div class="text-center mt-4">
                <a href="/admin" class="btn btn-outline-secondary btn-sm rounded-3">👨‍💼 ទៅកាន់ Admin Dashboard</a>
            </div>
        </div>
    </body>
    </html>
    ''', items=items, table=table)

@app.route('/order', methods=['POST'])
def order():
    table = request.form.get('table')
    item_name = request.form.get('item_name')
    price = float(request.form.get('price'))
    qty = int(request.form.get('qty'))
    sugar = request.form.get('sugar', '100%')
    total = price * qty

    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO sales (table_num, item_name, quantity, sugar, total) VALUES (?, ?, ?, ?, ?)",
                   (table, item_name, qty, sugar, total))
    conn.commit()
    conn.close()

    return render_template_string('''
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light d-flex align-items-center justify-content-center vh-100">
        <div class="card p-4 shadow-sm text-center rounded-4" style="max-width: 400px;">
            <h2 class="text-success mb-3">✅ ជោគជ័យ!</h2>
            <p class="fs-5 mb-1">បានកុម្ម៉ង់ <b>{{item_name}}</b> x{{qty}}</p>
            <p class="badge bg-warning text-dark fs-6 mb-3">🍬 ស្ករ: {{sugar}}</p>
            <h4 class="text-primary mb-3">សរុប៖ ${{ "%.2f"|format(total) }} (តុ {{table}})</h4>
            <a href="/?table={{table}}" class="btn btn-primary rounded-3">កុម្ម៉ង់បន្ថែមទៀត</a>
        </div>
    </body>
    </html>
    ''', item_name=item_name, qty=qty, sugar=sugar, total=total, table=table)

@app.route('/admin')
def admin():
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT SUM(total) FROM sales")
    grand_total = cursor.fetchone()[0] or 0.0
    # រើសយក Column ច្បាស់ៗតាមលំដាប់លំដោយ
    cursor.execute("SELECT table_num, item_name, quantity, sugar, total FROM sales ORDER BY id DESC LIMIT 20")
    sales = cursor.fetchall()
    conn.close()

    return render_template_string('''
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
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2>👨‍💼 Admin Dashboard</h2>
                <a href="/admin/menu" class="btn btn-primary btn-sm rounded-3">⚙️ គ្រប់គ្រង Menu</a>
            </div>
            
            <div class="card bg-dark text-white p-4 rounded-4 shadow-sm mb-4">
                <small class="text-white-50">ចំណូលសរុប</small>
                <h1 class="display-5 fw-bold text-warning m-0">${{ "%.2f"|format(grand_total) }}</h1>
            </div>

            <div class="card border-0 shadow-sm rounded-4 p-3">
                <h4 class="mb-3">📊 ប្រវត្តិលក់ចុងក្រោយ</h4>
                <div class="table-responsive">
                    <table class="table table-hover align-middle">
                        <thead class="table-light">
                            <tr>
                                <th>តុ</th>
                                <th>ទំនិញ</th>
                                <th>ចំនួន</th>
                                <th>ស្ករ</th>
                                <th>សរុប</th>
                            </tr>
                        </thead>
                        <tbody>
                            {% for s in sales %}
                            <tr>
                                <td><span class="badge bg-secondary">តុ {{s[0]}}</span></td>
                                <td class="fw-bold">{{s[1]}}</td>
                                <td>{{s[2]}}</td>
                                <td><span class="badge bg-info text-dark">{{s[3]}}</span></td>
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
    ''', grand_total=grand_total, sales=sales)

@app.route('/admin/menu')
def admin_menu():
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM menu")
    items = cursor.fetchall()
    conn.close()
    return render_template_string('''
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <div class="container py-4" style="max-width:600px;">
        <h3>🍱 គ្រប់គ្រង Menu</h3>
        <form action="/admin/add" method="POST" class="row g-2 mb-4">
            <div class="col-6"><input type="text" name="name" class="form-control" placeholder="ឈ្មោះកាហ្វេ" required></div>
            <div class="col-3"><input type="number" step="0.01" name="price" class="form-control" placeholder="តម្លៃ" required></div>
            <div class="col-3"><button class="btn btn-success w-100">បន្ថែម</button></div>
        </form>
        <ul class="list-group">
            {% for item in items %}
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <span><b>{{ item[1] }}</b> - ${{ "%.2f"|format(item[2]) }}</span>
                <a href="/admin/delete/{{ item[0] }}" class="btn btn-danger btn-sm">លុប</a>
            </li>
            {% endfor %}
        </ul>
        <a href="/admin" class="btn btn-secondary mt-3">ត្រឡប់ក្រោយ</a>
    </div>
    ''', items=items)

@app.route('/admin/add', methods=['POST'])
def add_menu():
    name = request.form.get('name'); price = request.form.get('price')
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO menu (name, price) VALUES (?, ?)", (name, price))
    conn.commit(); conn.close()
    return redirect(url_for('admin_menu'))

@app.route('/admin/delete/<int:id>')
def delete_menu(id):
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("DELETE FROM menu WHERE id = ?", (id,))
    conn.commit(); conn.close()
    return redirect(url_for('admin_menu'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
