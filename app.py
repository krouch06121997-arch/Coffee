import sqlite3
from flask import Flask, render_template_string, request, redirect, url_for

app = Flask(__name__)

def init_db():
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS menu (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, table_num INTEGER, item_name TEXT, quantity INTEGER, total REAL)''')
    cursor.execute("SELECT COUNT(*) FROM menu")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("INSERT INTO menu (name, price) VALUES (?, ?)", [('Espresso', 1.50), ('Iced Latte', 2.50), ('Cappuccino', 2.25)])
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
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <div class="container py-4" style="max-width:500px;">
        <h3 class="text-center">☕ កុម្ម៉ង់កាហ្វេ (តុ {{table}})</h3>
        {% for item in items %}
        <div class="card p-3 mb-2 shadow-sm d-flex flex-row justify-content-between align-items-center">
            <div><b>{{ item[1] }}</b> - ${{ "%.2f"|format(item[2]) }}</div>
            <form action="/order" method="POST">
                <input type="hidden" name="table" value="{{table}}"><input type="hidden" name="item_name" value="{{ item[1] }}"><input type="hidden" name="price" value="{{ item[2] }}">
                <input type="number" name="qty" value="1" min="1" style="width:50px;"> <button type="submit" class="btn btn-success btn-sm">កុម្ម៉ង់</button>
            </form>
        </div>
        {% endfor %}
        <a href="/admin" class="btn btn-outline-secondary w-100 mt-3">👨‍💼 ទៅកាន់ Admin Dashboard</a>
    </div>
    ''', items=items, table=table)

@app.route('/order', methods=['POST'])
def order():
    table = request.form.get('table'); item_name = request.form.get('item_name'); price = float(request.form.get('price')); qty = int(request.form.get('qty'))
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO sales (table_num, item_name, quantity, total) VALUES (?, ?, ?, ?)", (table, item_name, qty, price * qty))
    conn.commit(); conn.close()
    return f"<h3>✅ បានកុម្ម៉ង់រៀបរយ!</h3><a href='/?table={table}'>ត្រឡប់ក្រោយ</a>"

@app.route('/admin')
def admin():
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT SUM(total) FROM sales")
    grand_total = cursor.fetchone()[0] or 0.0
    cursor.execute("SELECT * FROM sales ORDER BY id DESC LIMIT 10")
    sales = cursor.fetchall()
    conn.close()
    return render_template_string('''
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <div class="container py-4">
        <h2>👨‍💼 Admin Dashboard</h2>
        <div class="card bg-dark text-white p-3 mb-3"><h4>ចំណូលសរុប: ${{ "%.2f"|format(grand_total) }}</h4></div>
        <a href="/admin/menu" class="btn btn-primary mb-3">⚙️ គ្រប់គ្រង Menu</a>
        <table class="table table-bordered"><tr><th>តុ</th><th>ទំនិញ</th><th>សរុប</th></tr>
        {% for s in sales %}<tr><td>{{s[1]}}</td><td>{{s[2]}}</td><td>${{ "%.2f"|format(s[4]) }}</td></tr>{% endfor %}
        </table>
        <a href="/">⬅️ ត្រឡប់ទៅទំព័រអតិថិជន</a>
    </div>
    ''', grand_total=grand_total, sales=sales)

# ---- មុខងារគ្រប់គ្រង Menu ថ្មី ----
@app.route('/admin/menu')
def admin_menu():
    conn = sqlite3.connect('coffee_shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM menu")
    items = cursor.fetchall()
    conn.close()
    return render_template_string('''
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <div class="container py-4">
        <h3>🍱 គ្រប់គ្រង Menu</h3>
        <form action="/admin/add" method="POST" class="row g-2 mb-4">
            <div class="col-6"><input type="text" name="name" class="form-control" placeholder="ឈ្មោះកាហ្វេ" required></div>
            <div class="col-3"><input type="number" step="0.01" name="price" class="form-control" placeholder="តម្លៃ" required></div>
            <div class="col-3"><button class="btn btn-success w-100">បន្ថែម</button></div>
        </form>
        <ul class="list-group">
            {% for item in items %}
            <li class="list-group-item d-flex justify-content-between">
                {{ item[1] }} - ${{ item[2] }}
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

