from flask import Flask, jsonify, render_template, request, session
from flask_mysqldb import MySQL
from collections import defaultdict
import calendar
from datetime import datetime, timedelta
from flask import send_from_directory
from app.routes.main_routes import routes
import bcrypt
from flask_cors import CORS
from MySQLdb.cursors import DictCursor
from fpdf import FPDF
import os
from dotenv import load_dotenv
import stripe
from app.services.email_service import EmailService
from app.routes.dss_routes import init_dss_routes

# Load environment variables
load_dotenv()


app = Flask(__name__, template_folder='app/templates')

app.secret_key = 'my_super_secure_key_123'
app.permanent_session_lifetime = timedelta(days=1)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False  

CORS(app, supports_credentials=True)

stripe.api_key = 'sk_test_51RvFpAFnsPUQVISnTuNYVEFQlPbjSU8HBH3sxC5nFLLIBnnuJxs9cggYNENqUKD9PWdD4jPihDlkHeMTJD5l7PxF00Arox9DUH'  

app.config['MYSQL_HOST'] = 'junction.proxy.rlwy.net'
app.config['MYSQL_PORT'] = 55275
app.config['MYSQL_USER'] = 'root'
app.config['MYSQL_PASSWORD'] = 'SGyckJNxStTohqGxHjQIyELVqGIbDaPp'
app.config['MYSQL_DB'] = 'railway'

mysql = MySQL(app)

email_service = EmailService()

app.register_blueprint(routes)

init_dss_routes(app, mysql)


@app.route("/signsup", methods=["POST"])
def signsup():
    data = request.get_json()
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")
    first_name = data.get("firstName")
    last_name = data.get("lastName")
    role = data.get("role")  

    if role == 'customer':
        verification_code = email_service.generate_verification_code()
        code_expiry = datetime.now() + timedelta(minutes=10)
    else:
        # For employees and admins, set code_expiry to track registration time
        verification_code = None
        code_expiry = datetime.now() + timedelta(minutes=10)  # Used to calculate created_at
    
    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    try:
        cur = mysql.connection.cursor()
       
        cur.execute("SELECT email FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close()
            return jsonify({"success": False, "message": "Email already exists"}), 400
        
        cur.execute("""
            INSERT INTO pending_users (username, first_name, last_name, email, password, role, verification_code, code_expiry, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE 
            verification_code = VALUES(verification_code),
            code_expiry = VALUES(code_expiry),
            password = VALUES(password),
            created_at = NOW()
        """, (username, first_name, last_name, email, hashed_pw, role, verification_code, code_expiry, datetime.now()))
        mysql.connection.commit()
        cur.close()
        
        
        if role == 'customer':
            
            if email_service.send_verification_email(email, f"{first_name} {last_name}", verification_code):
                return jsonify({
                    "success": True, 
                    "message": "Verification email sent! Please check your email to complete registration.",
                    "email": email
                }), 200
            else:
                return jsonify({"success": False, "message": "Failed to send verification email"}), 500
        
        elif role == 'admin':
            return jsonify({
                "success": True,
                "message": "Registration submitted! Waiting for owner approval.",
                "email": email
            }), 200
        
        elif role == 'employee':
            return jsonify({
                "success": True,
                "message": "Registration submitted! Waiting for admin approval.",
                "email": email
            }), 200
        
        else:
            return jsonify({"success": True, "message": "Signup successful!"}), 200
            
    except Exception as e:
        print(" Signup Error:", str(e))
        return jsonify({"success": False, "message": f"An error occurred: {str(e)}"}), 400


@app.route("/verify-email", methods=["POST"])
def verify_email():
    data = request.get_json()
    email = data.get("email")
    code = data.get("code")
    
    try:
        cur = mysql.connection.cursor(DictCursor)
        
        cur.execute(
            """
            SELECT id, username, first_name, last_name, email, password, role
            FROM pending_users 
            WHERE email = %s 
              AND verification_code = %s 
              AND role = 'customer'
              AND (code_expiry IS NULL OR code_expiry > NOW())
            """,
            (email, code)
        )
        
        pending_user = cur.fetchone()
        
        if pending_user:
            cur2 = mysql.connection.cursor()
            cur2.execute(
                """
                INSERT INTO users (username, first_name, last_name, email, password, role)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    pending_user['username'],
                    pending_user['first_name'],
                    pending_user['last_name'],
                    pending_user['email'],
                    pending_user['password'],
                    pending_user['role']
                )
            )
            
            cur2.execute("DELETE FROM pending_users WHERE id = %s", (pending_user['id'],))
            
            mysql.connection.commit()
            cur2.close()
            cur.close()
            
            return jsonify({"success": True, "message": "Email verified successfully!"})
        else:
            cur.close()
            return jsonify({"success": False, "message": "Invalid or expired verification code"})
            
    except Exception as e:
        print("Verification Error:", str(e))
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/pending-approvals', methods=['GET'])
def get_pending_approvals():
    try:
        if session.get('role') != 'owner':
            return jsonify({"error": "Unauthorized"}), 403

        cur = mysql.connection.cursor()
       
        cur.execute(
            """
            SELECT id, username, first_name, last_name, email, role, code_expiry
            FROM pending_users
            WHERE role IN ('admin')
            ORDER BY id DESC
            """
        )
        rows = cur.fetchall()
        cur.close()

        approvals = []
        for row in rows:
     
            pending_id = row[0]
            username = row[1]
            first_name = row[2]
            last_name = row[3]
            email = row[4]
            role = row[5]
            code_expiry = row[6]

            try:
                created_at = (code_expiry - timedelta(minutes=10)) if code_expiry else datetime.now()
            except Exception:
                created_at = datetime.now()

            approvals.append({
                'id': pending_id,
                'username': username,
                'first_name': first_name,
                'last_name': last_name,
                'email': email,
                'role': role,
                'created_at': created_at
            })

        return jsonify(approvals)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/handle-approval', methods=['POST'])
def handle_approval():
    try:
        if session.get('role') != 'owner':
            return jsonify({"success": False, "message": "Unauthorized"}), 403

        data = request.get_json() or {}
        approval_id = data.get('approval_id')
        action = (data.get('action') or '').strip().lower()

        if not approval_id or action not in ('approve', 'reject'):
            return jsonify({"success": False, "message": "Invalid request"}), 400

        cur = mysql.connection.cursor()

        cur.execute("SELECT * FROM pending_users WHERE id = %s", (approval_id,))
        pending_user = cur.fetchone()
        if not pending_user:
            cur.close()
            return jsonify({"success": False, "message": "Pending request not found"}), 404

        if action == 'approve':
            if pending_user[6] != 'admin':
                cur.close()
                return jsonify({"success": False, "message": "Only admin approvals are handled by owner"}), 400
            
            cur.execute(
                """
                INSERT INTO users (username, first_name, last_name, email, password, role)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (pending_user[1], pending_user[2], pending_user[3], pending_user[4], pending_user[5], pending_user[6])
            )

        cur.execute("DELETE FROM pending_users WHERE id = %s", (approval_id,))

        mysql.connection.commit()
        cur.close()

        return jsonify({"success": True})
    except Exception as e:
        mysql.connection.rollback()
        return jsonify({"success": False, "message": str(e)}), 500



@app.route('/api/admin/pending-approvals', methods=['GET'])
def admin_get_pending_approvals():
    try:
        if session.get('role') != 'admin':
            return jsonify({"error": "Unauthorized"}), 403

        cur = mysql.connection.cursor()
        cur.execute(
            """
            SELECT id, username, first_name, last_name, email, role, code_expiry, created_at
            FROM pending_users
            WHERE role = 'employee'
            ORDER BY created_at DESC
            """
        )
        rows = cur.fetchall()
        cur.close()

        approvals = []
        for row in rows:
            code_expiry = row[6]
            created_at = row[7]  # Use created_at directly from database
            
            # If created_at is None, use code_expiry or current time
            if created_at is None:
                if code_expiry:
                    created_at = code_expiry - timedelta(minutes=10)
                else:
                    created_at = datetime.now()
            
            approvals.append({
                'id': row[0],
                'username': row[1],
                'first_name': row[2],
                'last_name': row[3],
                'email': row[4],
                'role': row[5],
                'created_at': created_at.isoformat() if created_at else datetime.now().isoformat()
            })

        return jsonify(approvals)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/handle-approval', methods=['POST'])
def admin_handle_approval():
    try:
        if session.get('role') != 'admin':
            return jsonify({"success": False, "message": "Unauthorized"}), 403

        data = request.get_json() or {}
        approval_id = data.get('approval_id')
        action = (data.get('action') or '').strip().lower()

        if not approval_id or action not in ('approve', 'reject'):
            return jsonify({"success": False, "message": "Invalid request"}), 400

        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM pending_users WHERE id = %s", (approval_id,))
        pending_user = cur.fetchone()
        if not pending_user:
            cur.close()
            return jsonify({"success": False, "message": "Pending request not found"}), 404

        if pending_user[6] != 'employee':
            cur.close()
            return jsonify({"success": False, "message": "Only employee approvals are handled by admin"}), 400

        if action == 'approve':
            cur.execute(
                """
                INSERT INTO users (username, first_name, last_name, email, password, role)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (pending_user[1], pending_user[2], pending_user[3], pending_user[4], pending_user[5], pending_user[6])
            )

        cur.execute("DELETE FROM pending_users WHERE id = %s", (approval_id,))
        mysql.connection.commit()
        cur.close()

        return jsonify({"success": True})
    except Exception as e:
        mysql.connection.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/resend-verification", methods=["POST"])
def resend_verification():
    data = request.get_json()
    email = data.get("email")
    
    try:
        cur = mysql.connection.cursor()
        
        cur.execute("SELECT * FROM pending_users WHERE email = %s", (email,))
        pending_user = cur.fetchone()
        
        if pending_user:
        
            verification_code = email_service.generate_verification_code()
            code_expiry = datetime.now() + timedelta(minutes=10)
            
            cur.execute("""
                UPDATE pending_users 
                SET verification_code = %s, code_expiry = %s 
                WHERE email = %s
            """, (verification_code, code_expiry, email))
            mysql.connection.commit()
            
            user_name = f"{pending_user[2]} {pending_user[3]}"  
            if email_service.send_verification_email(email, user_name, verification_code):
                cur.close()
                return jsonify({"success": True, "message": "Verification code sent again!"})
            else:
                cur.close()
                return jsonify({"success": False, "message": "Failed to send verification email"}), 500
        else:
            cur.close()
            return jsonify({"success": False, "message": "Email not found in pending registrations"}), 404
            
    except Exception as e:
        print(" Resend Verification Error:", str(e))
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/signsin", methods=["POST"])
def signsin():
    data = request.get_json()
    email = data.get("email").strip()
    password = data.get("password").strip()

    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        cur.close()

        if user:
            stored_password = user[5]
            if bcrypt.checkpw(password.encode('utf-8'), stored_password.encode('utf-8')):
                session.permanent = True
                session['role'] = user[6]
                session['user_id'] = user[0]

                print("SESSION SET:", session)

                return jsonify({
                    "success": True,
                    "message": "Login successful!",
                    "role": user[6]
                })
            else:
                return jsonify({"success": False, "message": "Incorrect password!"})
        else:
            return jsonify({"success": False, "message": "Email not found!"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@app.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json()
    email = data.get("email")

    try:
        cur = mysql.connection.cursor()
        
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        if not user:
            cur.close()
            return jsonify({"success": False, "message": "Email not registered"}), 404

        reset_code = email_service.generate_verification_code()
        code_expiry = datetime.now() + timedelta(minutes=10)

        cur.execute("""
            INSERT INTO password_resets (email, reset_code, code_expiry)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
            reset_code = VALUES(reset_code),
            code_expiry = VALUES(code_expiry)
        """, (email, reset_code, code_expiry))
        mysql.connection.commit()

        if email_service.send_password_reset_email(email, user[2] + " " + user[3], reset_code):
            cur.close()
            return jsonify({"success": True, "message": "Password reset code sent to email!"}), 200
        else:
            cur.close()
            return jsonify({"success": False, "message": "Failed to send reset email"}), 500

    except Exception as e:
        print(" Forgot Password Error:", str(e))
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json()
    email = data.get("email")
    reset_code = data.get("code")
    new_password = data.get("newPassword")

    try:
        cur = mysql.connection.cursor()

        cur.execute("""
            SELECT * FROM password_resets 
            WHERE email = %s AND reset_code = %s AND code_expiry > NOW()
        """, (email, reset_code))
        reset_entry = cur.fetchone()

        if not reset_entry:
            cur.close()
            return jsonify({"success": False, "message": "Invalid or expired reset code"}), 400

        hashed_pw = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        cur.execute("UPDATE users SET password = %s WHERE email = %s", (hashed_pw, email))

        cur.execute("DELETE FROM password_resets WHERE email = %s", (email,))
        
        mysql.connection.commit()
        cur.close()

        return jsonify({"success": True, "message": "Password updated successfully!"}), 200

    except Exception as e:
        print(" Reset Password Error:", str(e))
        return jsonify({"success": False, "message": str(e)}), 500



@app.route("/whoami")
def whoami():
    return jsonify({
        "role": session.get("role"),
        "user_id": session.get("user_id")
    })


@app.route('/')
def home():
    return render_template('home.html')


@app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user_profile(user_id):
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
        cur.close()
        
        if user:
            user_data = {
                'id': user[0],
                'username': user[1],
                'first_name': user[2],
                'last_name': user[3],
                'email': user[4],
                'role': user[6],
                'phone': user[7] if len(user) > 7 else None,
                'date_of_birth': user[8] if len(user) > 8 else None,
                'address': user[9] if len(user) > 9 else None,
                'city': user[10] if len(user) > 10 else None,
                'postal_code': user[11] if len(user) > 11 else None
            }
            return jsonify(user_data)
        else:
            return jsonify({"error": "User not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/update-profile', methods=['PUT'])
def update_profile():
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"success": False, "message": "Not authenticated"}), 401
        
        data = request.get_json()
        print("Updating user with ID:", user_id)
        
        cur = mysql.connection.cursor()
        cur.execute("""
            UPDATE customer SET 
                first_name = %s, 
                last_name = %s, 
                phone = %s, 
                date_of_birth = %s, 
                address = %s, 
                city = %s, 
                postal_code = %s
             WHERE user_id = %s 
        """, (
            data.get('first_name'),
            data.get('last_name'),
            data.get('phone'),
            data.get('date_of_birth'),
            data.get('address'),
            data.get('city'),
            data.get('postal_code'),
            session['user_id']
        ))
        mysql.connection.commit()
        cur.close()
        
        return jsonify({"success": True, "message": "Profile updated successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/change-password', methods=['PUT'])
def change_password():
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"success": False, "message": "Not authenticated"}), 401
        
        data = request.get_json()
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        cur = mysql.connection.cursor()
        cur.execute("SELECT password FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
        
        if user and bcrypt.checkpw(current_password.encode('utf-8'), user[0].encode('utf-8')):
            hashed_new_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            cur.execute("UPDATE users SET password = %s WHERE id = %s", (hashed_new_password, user_id))
            mysql.connection.commit()
            cur.close()
            return jsonify({"success": True, "message": "Password changed successfully"})
        else:
            cur.close()
            return jsonify({"success": False, "message": "Current password is incorrect"}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/my-orders', methods=['GET'])
def get_my_orders():
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify([])
        
        cur = mysql.connection.cursor()
        cur.execute("""
            SELECT o.order_id, o.order_date, o.total_amount, COUNT(oi.order_item_id) as item_count
            FROM orders o
            LEFT JOIN order_items oi ON o.order_id = oi.order_id
            WHERE o.customer_id = %s
            GROUP BY o.order_id
            ORDER BY o.order_date DESC
            LIMIT 10
        """, (user_id,))
        
        orders = []
        for row in cur.fetchall():
            orders.append({
                'order_id': row[0],
                'order_date': row[1],
                'total_amount': row[2],
                'item_count': row[3]
            })
        
        cur.close()
        return jsonify(orders)
    except Exception as e:
        return jsonify([])



@app.route('/api/users', methods=['GET'])
def get_all_users():
    try:
        cur = mysql.connection.cursor()
        cur.execute("SELECT id, username, first_name, last_name, email, role FROM users ORDER BY id DESC")
        rows = cur.fetchall()
        column_names = [desc[0] for desc in cur.description]
        cur.close()
        
        users = [dict(zip(column_names, row)) for row in rows]
        return jsonify(users)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/users', methods=['POST'])
def add_user():
    try:
        data = request.get_json()
        
        
        hashed_password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        cur = mysql.connection.cursor()
        cur.execute("""
            INSERT INTO users (username, first_name, last_name, email, password, role)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            data['username'],
            data['firstName'],
            data['lastName'],
            data['email'],
            hashed_password,
            data['role']
        ))
        mysql.connection.commit()
        cur.close()
        
        return jsonify({"success": True, "message": "User added successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    try:
        data = request.get_json()
        
        cur = mysql.connection.cursor()
        
    
        if 'password' in data and data['password']:
    
            hashed_password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            cur.execute("""
                UPDATE users SET 
                    username = %s, 
                    first_name = %s, 
                    last_name = %s, 
                    email = %s, 
                    password = %s, 
                    role = %s
                WHERE id = %s
            """, (
                data['username'],
                data['firstName'],
                data['lastName'],
                data['email'],
                hashed_password,
                data['role'],
                user_id
            ))
        else:
        
            cur.execute("""
                UPDATE users SET 
                    username = %s, 
                    first_name = %s, 
                    last_name = %s, 
                    email = %s, 
                    role = %s
                WHERE id = %s
            """, (
                data['username'],
                data['firstName'],
                data['lastName'],
                data['email'],
                data['role'],
                user_id
            ))
        
        mysql.connection.commit()
        cur.close()
        
        return jsonify({"success": True, "message": "User updated successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    try:
        cur = mysql.connection.cursor()
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        mysql.connection.commit()
        cur.close()
        
        return jsonify({"success": True, "message": "User deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500



@app.route('/api/customer-ledger/<int:customer_id>', methods=['GET'])
def get_customer_ledger(customer_id):
    try:
        cur = mysql.connection.cursor()
        

        cur.execute("SELECT id, username, first_name, last_name, email FROM users WHERE id = %s", (customer_id,))
        customer_info = cur.fetchone()
        
        if not customer_info:
            return jsonify({"error": "Customer not found"}), 404
        
        customer_data = {
            'id': customer_info[0],
            'name': f"{customer_info[2]} {customer_info[3]}",
            'email': customer_info[4]
        }
        

        cur.execute("""
            SELECT 
                o.order_date as date,
                o.order_id as inv_no,
                'Med-Sales' as trans_type,
                oi.product_name as item_name,
                CONCAT(oi.product_name, ' - Qty: ', oi.quantity) as description,
                oi.quantity as qty,
                oi.unit_price as rate,
                0 as credit_amount,
                oi.total_price as debit_amount,
                'Dr' as dr_cr
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            WHERE o.customer_id = %s
            
            UNION ALL
            
            SELECT 
                o.order_date as date,
                o.order_id as inv_no,
                'Receipt Vouc' as trans_type,
                'Cash Payment' as item_name,
                CONCAT('Payment for Order #', o.order_id) as description,
                1 as qty,
                o.paid_amount as rate,
                o.paid_amount as credit_amount,
                0 as debit_amount,
                'Cr' as dr_cr
            FROM orders o
            WHERE o.customer_id = %s AND o.paid_amount > 0
            
            ORDER BY date ASC, inv_no ASC
        """, (customer_id, customer_id))
        
        transactions = []
        running_balance = 0.0
        
        transactions = []
        running_balance = 0.0
        
        for row in cur.fetchall():
            debit_amount = float(row[8]) if row[8] else 0.0
            credit_amount = float(row[7]) if row[7] else 0.0
            
            running_balance += debit_amount - credit_amount
            
            if running_balance < 0:
                running_balance = 0.0

            transaction = {
                'date': row[0],
                'inv_no': row[1],
                'trans_type': row[2],
                'item_name': row[3],
                'description': row[4],
                'qty': row[5],
                'rate': float(row[6]) if row[6] else 0.0,
                'credit_amount': credit_amount,
                'debit_amount': debit_amount,
                'balance': running_balance,
                'dr_cr': 'Dr' if running_balance >= 0 else 'Cr'
            }
            transactions.append(transaction)


        total_debit = sum(t['debit_amount'] for t in transactions)
        total_credit = sum(t['credit_amount'] for t in transactions)
        
        summary = {
    'opening_balance': 0.0,
    'total_debit': total_debit,
    'total_credit': total_credit,
    'ending_balance': abs(running_balance),
    'ending_type': 'Dr' if running_balance >= 0 else 'Cr'
}

        cur.close()
        
        return jsonify({
            'customer_info': customer_data,
            'transactions': transactions,
            'summary': summary
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route('/api/products', methods=['GET'])
def get_products():
    try:
        # Get pagination parameters from query string
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        cur = mysql.connection.cursor()
        
        # Get total count of products
        cur.execute("SELECT COUNT(*) FROM products WHERE stock_quantity > 0")
        total_products = cur.fetchone()[0]
        
        # Get paginated products
        cur.execute("""
            SELECT product_id, product_name, brand, price, 
                stock_quantity, category, expiry_date, image_path
            FROM products
            WHERE stock_quantity > 0
            ORDER BY product_name
            LIMIT %s OFFSET %s
        """, (per_page, offset))
        
        rows = cur.fetchall()
        column_names = [desc[0] for desc in cur.description]
        cur.close()

        products = [dict(zip(column_names, row)) for row in rows]
        
        # Calculate total pages
        total_pages = (total_products + per_page - 1) // per_page
        
        return jsonify({
            "products": products,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total_products,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        })
    except Exception as err:
        return jsonify({"error": f"MySQL Error: {str(err)}"}), 500



@app.route('/api/products', methods=['POST'])
def add_product():
    try:
        data = request.form
        
        cur = mysql.connection.cursor()

        cur.execute("""
            INSERT INTO products 
            (product_name, brand, description, price, 
             stock_quantity, category, expiry_date, image_path)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data['product_name'],
            data.get('brand', 'Generic'),
            data.get('description', ''),
            float(data['price']),
            int(data['stock_quantity']),
            data['category'],
            data['expiry_date'] if data['expiry_date'] else None,
            None
        ))

        new_product_id = cur.lastrowid

        image_path = None
        if 'image' in request.files:
            image = request.files['image']
            if image.filename != '':
                image_filename = f"product_{new_product_id}_{image.filename}"
                image_path = f"images/{image_filename}"
                image.save(f"images/{image_filename}")

                cur.execute("""
                    UPDATE products 
                    SET image_path=%s 
                    WHERE product_id=%s
                """, (image_path, new_product_id))

        mysql.connection.commit()
        cur.close()

        return jsonify({"message": "Product added successfully"}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    try:
        data = request.form
        
    
        image_path = None
        if 'image' in request.files:
            image = request.files['image']
            if image.filename != '':
                image_filename = f"product_{product_id}_{image.filename}"
                image_path = f"images/{image_filename}"
                image.save(f"images/{image_filename}")
        
        cur = mysql.connection.cursor()
        
        
        update_fields = []
        values = []
        
        if 'product_name' in data:
            update_fields.append("product_name = %s")
            values.append(data['product_name'])
        
        if 'brand' in data:
            update_fields.append("brand = %s")
            values.append(data.get('brand', 'Generic'))
        
        if 'description' in data:
            update_fields.append("description = %s")
            values.append(data.get('description', ''))
        
        if 'price' in data:
            update_fields.append("price = %s")
            values.append(float(data['price']))
        
        if 'stock_quantity' in data:
            update_fields.append("stock_quantity = %s")
            values.append(int(data['stock_quantity']))
        
        if 'category' in data:
            update_fields.append("category = %s")
            values.append(data['category'])
        
        if 'expiry_date' in data and data['expiry_date']:
            update_fields.append("expiry_date = %s")
            values.append(data['expiry_date'])
        
        if image_path:
            update_fields.append("image_path = %s")
            values.append(image_path)
        
        if update_fields:
            query = f"UPDATE products SET {', '.join(update_fields)} WHERE product_id = %s"
            values.append(product_id)
            cur.execute(query, values)
            mysql.connection.commit()
        
        cur.close()
        return jsonify({"message": "Product updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    try:
        cur = mysql.connection.cursor()
        cur.execute("DELETE FROM products WHERE product_id = %s", (product_id,))
        mysql.connection.commit()
        cur.close()
        
        return jsonify({"message": "Product deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

from MySQLdb.cursors import DictCursor

@app.route('/api/customers', methods=['GET'])
def get_customers():
    try:
        cur = mysql.connection.cursor(DictCursor)   
        cur.execute("""
            SELECT id, first_name, last_name, email, username, role
            FROM users
            WHERE role = 'customer'
        """)
        customers = cur.fetchall()
        cur.close()
        return jsonify(customers), 200
    except Exception as e:
        print("Error in /api/customers:", str(e))
        return jsonify({"error": str(e)}), 500


# 2. Get all orders
@app.route('/api/customer-orders', methods=['GET'])
def get_customer_orders():
    try:
        cur = mysql.connection.cursor(DictCursor)  
        cur.execute("""
            SELECT order_id, customer_id, total_amount, order_date, payment_status
            FROM orders
            WHERE customer_id IS NOT NULL
        """)
        orders = cur.fetchall()
        cur.close()
        return jsonify(orders), 200
    except Exception as e:
        print(" Error in /api/customer-orders:", str(e))
        return jsonify({"error": str(e)}), 500


@app.route('/api/customer-order-details/<int:customer_id>', methods=['GET'])
def get_customer_order_details(customer_id):
    try:
        cur = mysql.connection.cursor(DictCursor)  
        query = """
            SELECT o.order_id, o.customer_id, o.order_date, o.total_amount, o.payment_status,
                   oi.product_id, p.product_name, oi.quantity
            FROM orders o
            LEFT JOIN order_items oi ON o.order_id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.product_id
            WHERE o.customer_id = %s
            ORDER BY o.order_date DESC
        """
        cur.execute(query, (customer_id,))
        rows = cur.fetchall()
        cur.close()


        orders = {}
        for row in rows:
            oid = row['order_id']
            if oid not in orders:
                orders[oid] = {
                    "order_id": row['order_id'],
                    "customer_id": row['customer_id'],
                    "order_date": row['order_date'],
                    "total_amount": row['total_amount'],
                    "payment_status": row['payment_status'],
                    "items": []
                }
            if row['product_id']:
                orders[oid]["items"].append({
                    "product_id": row['product_id'],
                    "product_name": row['product_name'],
                    "quantity": row['quantity']
                })

        return jsonify(list(orders.values())), 200
    except Exception as e:
        print(" Error in /api/customer-order-details:", str(e))
        return jsonify({"error": str(e)}), 500


@app.route('/save_pharmacy_order', methods=['POST'])
def save_pharmacy_order():
    data = request.json
    supplier_name = data.get('supplier_name')
    expected_delivery_date = data.get('expected_delivery_date')
    items = data.get('items')

    if not supplier_name or not expected_delivery_date or not items:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        total_amount = sum(item['quantity'] * item['price'] for item in items)

        cur = mysql.connection.cursor()
        cur.execute("""
            INSERT INTO pharmacy_orders (supplier_name, expected_delivery_date, total_amount)
            VALUES (%s, %s, %s)
        """, (supplier_name, expected_delivery_date, total_amount))
        pharmacy_order_id = cur.lastrowid

        for item in items:
            cur.execute("""
                INSERT INTO pharmacy_order_items (pharmacy_order_id, product_name, quantity, unit_price)
                VALUES (%s, %s, %s, %s)
            """, (
                pharmacy_order_id,
                item['name'],
                item['quantity'],
                item['price']
            ))

        mysql.connection.commit()
        cur.close()

        pdf_path = generate_pharmacy_order_pdf(
            order_id=pharmacy_order_id,
            supplier_name=supplier_name,
            expected_delivery_date=expected_delivery_date,
            items=items,
            total_amount=total_amount
        )

        return jsonify({
            "message": "Order saved successfully",
            "pdf_url": f"/download_order_pdf/{os.path.basename(pdf_path)}"
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/download_order_pdf/<filename>')
def download_order_pdf(filename):
    try:
        return send_from_directory('orders', filename, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 404



def generate_pharmacy_order_pdf(order_id, supplier_name, expected_delivery_date, items, total_amount):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Heading
    pdf.set_font("Arial", "B", 20)
    pdf.set_text_color(0, 102, 204)
    pdf.cell(0, 10, "Dogar Pharmacy", ln=True, align="C")

    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Arial", "B", 14)
    pdf.ln(5)
    pdf.cell(0, 10, f"Purchase Order #: PO-{order_id}", ln=True)

    pdf.set_font("Arial", "", 12)
    pdf.cell(0, 10, f"Expected Delivery: {expected_delivery_date}", ln=True)
    pdf.cell(0, 10, f"Order Date: {datetime.now().strftime('%d %B %Y, %I:%M %p')}", ln=True)
    pdf.ln(10)

    pdf.set_font("Arial", "B", 12)
    pdf.set_fill_color(240, 240, 255)
    pdf.cell(80, 10, "Product", 1, 0, "C", True)
    pdf.cell(30, 10, "Quantity", 1, 0, "C", True)
    pdf.cell(30, 10, "Unit Price", 1, 0, "C", True)
    pdf.cell(40, 10, "Total", 1, 1, "C", True)


    pdf.set_font("Arial", "", 12)
    for item in items:
        total = item['quantity'] * item['price']
        pdf.cell(80, 10, item['name'], 1)
        pdf.cell(30, 10, str(item['quantity']), 1, 0, "C")
        pdf.cell(30, 10, f"Rs. {item['price']}", 1, 0, "C")
        pdf.cell(40, 10, f"Rs. {total}", 1, 1, "C")


    pdf.ln(5)
    pdf.set_font("Arial", "B", 12)
    pdf.cell(140, 10, "Total Amount", 1)
    pdf.cell(40, 10, f"Rs. {total_amount:.2f}", 1, 1, "C")

    pdf_folder = "orders"
    os.makedirs(pdf_folder, exist_ok=True)
    filename = f"order_{order_id}.pdf"
    path = os.path.join(pdf_folder, filename)
    pdf.output(path)

    return path


@app.route('/api/create_payment_intent', methods=['POST'])
def create_payment_intent():
    try:
        data = request.json
        amount = data.get('amount')  
        currency = data.get('currency', 'pkr')
        cart = data.get('cart', [])

        print(f"\n=== PAYMENT INTENT DEBUG ===")
        print(f"Received data: {data}")
        print(f"Amount: {amount}, Type: {type(amount)}")
        print(f"Currency: {currency}")
        
        # Validate amount
        if not amount:
            print("ERROR: No amount provided")
            return jsonify({'error': 'Amount is required'}), 400
        
        # Convert amount to integer (Stripe requires integer cents)
        try:
            amount = int(float(amount))
        except (ValueError, TypeError) as e:
            print(f"ERROR: Invalid amount format: {e}")
            return jsonify({'error': f'Invalid amount: {str(e)}'}), 400
        
        if amount <= 0:
            print(f"ERROR: Amount must be positive: {amount}")
            return jsonify({'error': 'Amount must be greater than 0'}), 400

        print(f"Creating intent with amount={amount}, currency={currency}")
        
        intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            metadata={
                'cart_items': str(len(cart)),
                'user_id': str(session.get('user_id', 'guest'))
            }
        )

        print(f"Intent created successfully: {intent.id}")
        return jsonify({
            'client_secret': intent.client_secret,
            'payment_intent_id': intent.id
        })

    except stripe.error.InvalidRequestError as e:
        print(f"ERROR - Stripe InvalidRequestError: {e}")
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except stripe.error.AuthenticationError as e:
        print(f"ERROR - Stripe AuthenticationError: {e}")
        return jsonify({'error': 'Stripe API key invalid'}), 401
    except Exception as e:
        print(f"ERROR - Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500



@app.route('/api/expired_products', methods=['GET'])
def get_expired_products():
    try:
        current_date = datetime.now().date()
        
        cur = mysql.connection.cursor()
        cur.execute("""
            SELECT product_id, product_name, expiry_date, stock_quantity, price, image_path
            FROM products
            WHERE expiry_date < %s
            ORDER BY expiry_date ASC
        """, (current_date,))
        
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        expired_products = [dict(zip(columns, row)) for row in rows]
        
    
        for product in expired_products:
            expiry_date = product['expiry_date']
            if isinstance(expiry_date, datetime):
                expiry_datetime = expiry_date
            else:
                expiry_datetime = datetime.combine(expiry_date, datetime.min.time())
            
            days_expired = (datetime.now() - expiry_datetime).days
            product['days_expired'] = days_expired
            product['status'] = 'EXPIRED'
        
        cur.close()
        return jsonify(expired_products)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route('/api/save_customer_order', methods=['POST'])
def save_customer_order():
    data = request.json
    cart = data.get('cart', [])
    total_amount = data.get('total_amount', 0)
    paid_amount = data.get('paid_amount', 0)
    change_amount = data.get('change_amount', 0)
    payment_method = data.get('payment_method', 'stripe')
    payment_intent_id = data.get('payment_intent_id')
    card_holder = data.get('card_holder')
    card_last_four = data.get('card_last_four')

    if not cart:
        return jsonify({"error": "Cart is empty."}), 400

    try:
        cur = mysql.connection.cursor()
        
        cur.execute("""
            INSERT INTO orders (customer_id, order_date, total_amount, paid_amount, change_amount, 
                              payment_method, payment_intent_id, card_holder, card_last_four)
            VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s, %s)
        """, (session.get('user_id'), total_amount, paid_amount, change_amount, 
              payment_method, payment_intent_id, card_holder, card_last_four))
        
        order_id = cur.lastrowid

        
        for item in cart:
            cur.execute("""
                INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                order_id,
                item['product_id'],
                item['name'],
                item['quantity'],
                item['price'],
                item['price'] * item['quantity']
            ))
            
            cur.execute("""
                UPDATE products 
                SET stock_quantity = stock_quantity - %s 
                WHERE product_id = %s AND stock_quantity >= %s
            """, (item['quantity'], item['product_id'], item['quantity']))
            
            if cur.rowcount == 0:
                mysql.connection.rollback()
                cur.close()
                return jsonify({"error": f"Insufficient stock for {item['name']}"}), 400

        mysql.connection.commit()

        pdf_path = generate_customer_receipt_pdf(
            order_id=order_id,
            cart=cart,
            total_amount=total_amount,
            paid_amount=paid_amount,
            change_amount=change_amount,
            card_holder=card_holder,
            card_last_four=card_last_four
        )

        cur.close()

        return jsonify({
            "success": True,
            "order_id": order_id,
            "pdf_url": f"/download_customer_receipt/{os.path.basename(pdf_path)}"
        })

    except Exception as e:
        mysql.connection.rollback()
        return jsonify({"error": str(e)}), 500


def generate_customer_receipt_pdf(order_id, cart, total_amount, paid_amount, change_amount, card_holder, card_last_four):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    pdf.set_font("Arial", "B", 18)
    pdf.set_text_color(19, 139, 168)
    pdf.cell(0, 12, "PHARMA MASTERMIND", ln=True, align="C")

    pdf.set_font("Arial", "", 11)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 6, "Dogar Pharmacy", ln=True, align="C")
    pdf.cell(0, 6, "Bucha Chatta", ln=True, align="C")
    pdf.cell(0, 6, "License Number: 3088-6987456", ln=True, align="C")
    pdf.cell(0, 6, "Tel: 0321-1234567", ln=True, align="C")
    pdf.ln(5)
    
    
    pdf.set_draw_color(19, 139, 168)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(8)

    
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 8, f"CUSTOMER RECEIPT", ln=True, align="C")
    pdf.ln(3)
    
    pdf.set_font("Arial", "", 10)
    pdf.cell(95, 6, f"Receipt No: CR-{order_id}", border=0)
    pdf.cell(95, 6, datetime.now().strftime("%d %b %Y   %H:%M"), ln=True, align="R")
    pdf.cell(95, 6, f"Customer: {card_holder}", border=0)
    pdf.cell(95, 6, f"Card: ****{card_last_four}", ln=True, align="R")
    pdf.ln(5)

   
    pdf.set_font("Arial", "B", 10)
    pdf.set_fill_color(240, 248, 255)
    pdf.cell(25, 8, "Qty", border=1, align="C", fill=True)
    pdf.cell(105, 8, "Product Description", border=1, align="C", fill=True)
    pdf.cell(30, 8, "Unit Price", border=1, align="C", fill=True)
    pdf.cell(30, 8, "Total", border=1, align="C", fill=True)
    pdf.ln()

    
    pdf.set_font("Arial", "", 9)
    for item in cart:
        item_total = item['price'] * item['quantity']
        pdf.cell(25, 7, str(item['quantity']), border=1, align="C")
        pdf.cell(105, 7, item['name'][:45], border=1)  # Truncate long names
        pdf.cell(30, 7, f"Rs. {item['price']:.2f}", border=1, align="R")
        pdf.cell(30, 7, f"Rs. {item_total:.2f}", border=1, align="R")
        pdf.ln()

    
    pdf.ln(5)
    pdf.set_font("Arial", "", 10)
    
    
    summary_y = pdf.get_y()
    pdf.rect(130, summary_y, 60, 35)
    
    pdf.set_xy(135, summary_y + 3)
    pdf.cell(50, 6, f"Subtotal: Rs. {total_amount:.2f}", ln=True)
    pdf.set_x(135)
    pdf.cell(50, 6, f"Tax: Rs. 0.00", ln=True)
    pdf.set_x(135)
    pdf.cell(50, 6, f"Discount: Rs. 0.00", ln=True)
    pdf.set_x(135)
    pdf.set_font("Arial", "B", 10)
    pdf.cell(50, 6, f"Total: Rs. {total_amount:.2f}", ln=True)
    pdf.set_x(135)
    pdf.set_font("Arial", "", 9)
    pdf.cell(50, 6, f"Paid: Rs. {paid_amount:.2f}", ln=True)

    
    pdf.ln(8)
    pdf.set_font("Arial", "", 9)
    pdf.cell(0, 6, f"Payment Method: Credit/Debit Card (****{card_last_four})", ln=True, align="C")
    pdf.cell(0, 6, "Payment Status: APPROVED", ln=True, align="C")

    
    pdf.ln(10)
    pdf.set_font("Arial", "B", 11)
    pdf.cell(0, 8, "Thank You for Shopping with Us!", ln=True, align="C")
    pdf.set_font("Arial", "", 8)
    pdf.cell(0, 5, "For any queries, please contact us at support@pharmamaster.com", ln=True, align="C")
    pdf.cell(0, 5, "Visit us online: www.pharmamaster.com", ln=True, align="C")

    pdf_folder = "customer_receipts"
    os.makedirs(pdf_folder, exist_ok=True)
    filename = f"customer_receipt_{order_id}.pdf"
    path = os.path.join(pdf_folder, filename)
    pdf.output(path)

    return path


@app.route('/download_customer_receipt/<filename>')
def download_customer_receipt(filename):
    try:
        return send_from_directory('customer_receipts', filename, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 404



@app.route('/api/save_order', methods=['POST'])
def save_order():
    data = request.json
    cart = data.get('cart', [])
    paid_amount = data.get('paid_amount', 0)
    change_amount = data.get('change_amount', 0)

    if not cart:
        return jsonify({"error": "Cart is empty."}), 400

    try:
        total_amount = sum(item['price'] * item['quantity'] for item in cart)

        cur = mysql.connection.cursor()
        cur.execute("""
            INSERT INTO orders (order_date, total_amount, paid_amount, change_amount)
            VALUES (NOW(), %s, %s, %s)
        """, (total_amount, paid_amount, change_amount))
        order_id = cur.lastrowid

        for item in cart:
            cur.execute("""
                INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                order_id,
                item['product_id'],
                item['name'],
                item['quantity'],
                item['price'],
                item['price'] * item['quantity']
            ))

        mysql.connection.commit()
        cur.close()

        
        os.makedirs("receipts", exist_ok=True)
        pdf = FPDF()
        pdf.add_page()

        
        pdf.set_font("Arial", "B", 16)
        pdf.cell(190, 10, "DOGAR PHARMACY", ln=True, align="C")

        pdf.set_font("Arial", "", 12)
        pdf.cell(190, 8, "Bucha Chatta", ln=True, align="C")
        pdf.cell(190, 8, "License Number: 3088-6987456", ln=True, align="C")
        pdf.cell(190, 8, "Tel: 0321-1234567", ln=True, align="C")
        pdf.ln(3)
        pdf.cell(190, 0, "", ln=True, border="T")
        pdf.ln(4)

        
        pdf.set_font("Arial", "", 11)
        pdf.cell(95, 8, f"Invoice No: TI{order_id}", border=0)
        pdf.cell(95, 8, datetime.now().strftime("%d %b %Y   %H:%M"), ln=True, align="R")
        pdf.ln(4)

        
        pdf.set_font("Arial", "B", 11)
        pdf.cell(30, 8, "Qty", border=1, align="C")
        pdf.cell(100, 8, "Description", border=1, align="C")
        pdf.cell(60, 8, "Price", border=1, align="C")
        pdf.ln()

        
        pdf.set_font("Arial", "", 11)
        for item in cart:
            quantity = str(item['quantity'])
            name = item['name']
            price = f"{item['price'] * item['quantity']:.2f}"
            pdf.cell(30, 8, quantity, border=1, align="C")
            pdf.cell(100, 8, name, border=1)
            pdf.cell(60, 8, price, border=1, align="R")
            pdf.ln()

        pdf.ln(4)
        pdf.set_font("Arial", "", 11)
        pdf.cell(190, 8, f"Total: {total_amount:.2f}", ln=True, align="R")
        pdf.cell(190, 8, f"Tax Included: 0.0", ln=True, align="R")
        pdf.cell(190, 8, f"Discount: 0.0", ln=True, align="R")
        pdf.cell(190, 8, f"Paid Amount: {paid_amount:.2f}", ln=True, align="R")
        pdf.cell(190, 8, f"Change: {change_amount:.2f}", ln=True, align="R")

        
        pdf.ln(10)
        pdf.set_font("Arial", "B", 12)
        pdf.cell(190, 10, "Thank You!", ln=True, align="C")

       
        pdf_filename = f"receipt_{order_id}.pdf"
        pdf_path = os.path.join("receipts", pdf_filename)
        pdf.output(pdf_path)

        return jsonify({
            "success": True,
            "order_id": order_id,
            "pdf_url": f"/download_receipt/{pdf_filename}"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/download_receipt/<filename>')
def download_receipt(filename):
    try:
        return send_from_directory('receipts', filename, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 404



from MySQLdb.cursors import DictCursor

@app.route('/api/invoice/<order_id>')
def get_invoice(order_id):
    conn = mysql.connection
    cursor = conn.cursor(DictCursor)

    
    cursor.execute("SELECT * FROM orders WHERE order_id = %s", (order_id,))
    order = cursor.fetchone()

    if not order:
        return jsonify({"error": "Order not found"}), 404

    
    cursor.execute("SELECT * FROM order_items WHERE order_id = %s", (order_id,))
    items = cursor.fetchall()

    return jsonify({
        "order": order,
        "items": items
    }), 200



@app.route('/api/process_return', methods=['POST'])
def process_return():
    try:
        data = request.get_json()
        
        cur = mysql.connection.cursor()
        
        cur.execute("""
            INSERT INTO returns (invoice_number, product_name, original_quantity, 
                               return_quantity, unit_price, return_amount, return_reason, 
                               return_notes, return_date, processed_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s)
        """, (
            data['invoice_number'],
            data['product_name'],
            data['original_quantity'],
            data['return_quantity'],
            data['unit_price'],
            data['return_amount'],
            data['return_reason'],
            data['return_notes'],
            session.get('user_id', 'system')
        ))
        
        cur.execute("""
            UPDATE products 
            SET stock_quantity = stock_quantity + %s 
            WHERE product_name = %s
        """, (data['return_quantity'], data['product_name']))
        
        mysql.connection.commit()
        cur.close()
        
        return jsonify({"success": True, "message": "Return processed successfully"})
        
    except Exception as e:
        mysql.connection.rollback()
        return jsonify({"success": False, "message": str(e)}), 500



@app.route('/api/save_auto_order', methods=['POST'])
def save_auto_order():
    try:
        data = request.get_json()
        predictions = data.get('predictions', [])
        
        if not predictions:
            return jsonify({"success": False, "message": "No predictions provided"}), 400
        
        cur = mysql.connection.cursor()
        
        total_items = len(predictions)
        estimated_cost = sum(pred.get('estimated_cost', 0) for pred in predictions)
        
        cur.execute("""
            INSERT INTO auto_generated_order_list 
            (generation_date, processed_status, total_items, estimated_cost)
            VALUES (NOW(), 'pending', %s, %s)
        """, (total_items, estimated_cost))
        
        auto_order_id = cur.lastrowid
        
        for prediction in predictions:
            cur.execute("""
                INSERT INTO auto_order_items 
                (auto_order_id, product_id, prediction_id, quantity_to_order, status)
                VALUES (%s, %s, %s, %s, 'pending')
            """, (
                auto_order_id,
                prediction.get('product_id'),
                prediction.get('prediction_id', auto_order_id), 
                prediction.get('recommended_quantity', 0)
            ))
        
        mysql.connection.commit()
        cur.close()
        
        return jsonify({
            "success": True, 
            "message": "Auto order saved successfully",
            "auto_order_id": auto_order_id,
            "total_items": total_items,
            "estimated_cost": estimated_cost
        })
        
    except Exception as e:
        mysql.connection.rollback()
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/employees/add', methods=['POST'])
def add_employee():
    data = request.get_json()
    try:
        print("Received data:", data)
        cursor = mysql.connection.cursor()
        cursor.execute("""
            INSERT INTO employees 
            (employee_id, name, email, phone, cnic, emergency, role, salary) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data.get('id'),
            data.get('name'),
            data.get('email'),
            data.get('phone'),
            data.get('cnic'),
            data.get('emergency_contact'),
            data.get('role'),
            data.get('salary')
        ))
        mysql.connection.commit()
        cursor.close()
        return jsonify({
            'status': 'success',
            'message': 'Employee added successfully!'
        }), 200

    except Exception as e:
        print("Error while adding employee:", e)
        return jsonify({
            'status': 'error',
            'message': f'Error: {str(e)}'
        }), 500


# --- Get Employees ---
@app.route('/api/employees', methods=['GET'])
def get_employees():
    try:
        cur = mysql.connection.cursor()

        # Get employees from employees table
        cur.execute('SELECT * FROM employees')
        rows = cur.fetchall()
        col_names = [desc[0] for desc in cur.description]
        employees = [dict(zip(col_names, row)) for row in rows]

        # Get users with role 'Employee' from users table (signup users)
        cur.execute("SELECT id, username, first_name, last_name, email, role FROM users WHERE role = 'Employee'")
        user_rows = cur.fetchall()

        # Convert users to employee format
        for user in user_rows:
            user_id, username, first_name, last_name, email, role = user
            # Check if this user is already in employees table (by email or username as employee_id)
            exists = any(emp.get('email') == email or emp.get('employee_id') == username for emp in employees)
            if not exists:
                employees.append({
                    'employee_id': username,
                    'name': f"{first_name} {last_name}",
                    'email': email,
                    'phone': '-',
                    'cnic': '-',
                    'emergency': '-',
                    'role': role,
                    'salary': 0,
                    'source': 'signup'  # Mark as signup user
                })

        cur.close()
        return jsonify(employees)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- Update Employee ---
@app.route('/api/employees/<string:emp_id>', methods=['PUT'])
def update_employee(emp_id):
    try:
        data = request.json
        cur = mysql.connection.cursor()
        query = '''
            UPDATE employees
            SET name=%s, email=%s, phone=%s, cnic=%s,
                emergency=%s, role=%s, salary=%s
            WHERE employee_id=%s
        '''
        values = (
            data['name'], data['email'], data['phone'], data['cnic'],
            data['emergency_contact'], data['role'], data['salary'], emp_id
        )
        cur.execute(query, values)
        mysql.connection.commit()
        cur.close()
        return jsonify({'status': 'success', 'message': 'Employee updated successfully'})
    except Exception as e:
        print("Update error:", e)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# --- Delete Employee ---
@app.route('/api/employees/<string:emp_id>', methods=['DELETE'])
def delete_employee(emp_id):
    try:
        cur = mysql.connection.cursor()
        cur.execute("DELETE FROM employees WHERE employee_id = %s", (emp_id,))
        mysql.connection.commit()
        cur.close()
        return jsonify({'status': 'success', 'message': 'Employee deleted successfully'})
    except Exception as e:
        print("Delete error:", e)
        return jsonify({'status': 'error', 'message': str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)