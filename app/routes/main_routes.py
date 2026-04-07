
from flask import Blueprint, render_template, send_from_directory, session, redirect, url_for

routes = Blueprint('routes', __name__)


@routes.route('/')
def index():
    return render_template('customer/home.html')


@routes.route('/signup')
def signup():
    return render_template('auth/signup.html')

@routes.route('/signin')
def signin():
    return render_template('auth/signin.html')

@routes.route('/forgot_password')
def forgot_password():
    return render_template('auth/forgetpassword.html')

@routes.route('/verification')
def verification():
    return render_template('auth/verification.html')

@routes.route('/reset-password')
def reset_password_page():
    return render_template('auth/reset-password.html')

@routes.route('/dashboard')
def dashboard():
    role = session.get("role")
    if role in ["admin", "owner"]:
        return render_template("owner/ownerdashboard.html")
    elif role == "employee":
        return redirect(url_for('routes.point_of_sale'))
    elif role in ["customer", "owner","admin"]:
        return redirect(url_for('routes.customer'))
    return "Unauthorized access", 403

@routes.route('/BIexpiry')
def BIexpiry():
    role = session.get("role")
    if role in ["admin", "owner"]:
        return render_template("owner/biexpiry.html")
    return "Unauthorized access", 403

@routes.route('/customerdashboard')
def customerdashboard():
    role = session.get("role")
    if role in ["admin", "owner"]:
        return render_template("customer/customerdashboard.html")
    return "Unauthorized access", 403


@routes.route('/admininventory')
def inventory():
    if session.get("role") != "admin":
        return "Unauthorized access", 403
    return render_template("admin/admininventory.html")

@routes.route('/employes')
def employes():
    if session.get("role") != "admin":
        return "Unauthorized access", 403
    return render_template("owner/employee.html")

@routes.route('/expiry')
def expiry():
    if session.get("role") != "admin":
        return "Unauthorized access", 403
    return render_template("owner/expiriy.html")

@routes.route('/order')
def order():
    if session.get("role") != "admin":
        return "Unauthorized access", 403
    return render_template("customer/order.html")

@routes.route('/debug/session')
def debug_session():
    """Debug route to check current session"""
    return {
        "session_data": dict(session),
        "role": session.get("role"),
        "user_id": session.get("user_id"),
        "permanent": session.get("_permanent")
    }

@routes.route('/customer')
def customer():
    if session.get("role") not in ["customer", "owner", "admin"]:
        return "Unauthorized access", 403
    return render_template("customer/customer.html")

@routes.route('/customerprofile')
def customer_profile():
    if session.get("role") != "customer":
        return "Unauthorized access", 403
    return render_template("customer/customerprofile.html")


@routes.route('/adminusers')
def admin_users():
    role = session.get("role")
    if role not in ["owner", "admin"]:
        return "Unauthorized access", 403
    return render_template("admin/adminusers.html")


@routes.route('/pos')
def point_of_sale():
    if session.get("role") not in ["employee", "admin"]:
        return "Unauthorized access", 403
    return render_template('pos/pos.html')

@routes.route('/inventory')
def pos_inventory():
    if session.get("role") not in ["employee", "admin"]:
        return "Unauthorized access", 403
    return render_template('pos/inventory.html')

@routes.route('/invoice')
def pos_invoice():
    if session.get("role") not in ["employee", "admin"]:
        return "Unauthorized access", 403
    return render_template('pos/invoice.html')

@routes.route('/returns')
def pos_returns():
    if session.get("role") not in ["employee", "admin"]:
        return "Unauthorized access", 403
    return render_template('pos/returns.html')

@routes.route('/logout')
def logout():
    session.clear()   
    return redirect('/')  


@routes.route('/payment')
def payment():
    if session.get("role") not in [ "admin", "customer","owner"]:
        return "Unauthorized access", 403
    return render_template('customer/payment/index.html')


@routes.route('/css/<path:filename>')
def send_css(filename):
    return send_from_directory('app/static/css', filename)

@routes.route('/js/<path:filename>')
def send_js(filename):
    return send_from_directory('app/static/js', filename)

@routes.route('/images/<path:filename>')
def send_images(filename):
    return send_from_directory('app/static/images', filename)

@routes.route('/<filename>.js')
def serve_js_file(filename):
    return send_from_directory('app/static/js', f'{filename}.js')

@routes.route('/<filename>.css')
def serve_css_file(filename):
    return send_from_directory('app/static/css', f'{filename}.css')

@routes.route('/images/pos/<path:filename>')
def serve_images(filename):
    return send_from_directory('pos/Picture', filename)

@routes.route('/payment/<path:filename>.css')
def serve_payment_css(filename):
    return send_from_directory('app/templates/customer/payment', f'{filename}.css')

@routes.route('/payment/<path:filename>.js')
def serve_payment_js(filename):
    return send_from_directory('app/templates/customer/payment', f'{filename}.js')
@routes.route('/customer-pattern')
def customer_pattern():
    return render_template('customer/customerpurchase.html')

@routes.route('/seasonal-demand')
def seasonal_demand(): 
    return render_template('owner/forecast.html')


@routes.route('/restocking')
def restocking(): 
    return render_template('owner/restock_prediction.html')

@routes.route('/smart-recommendation')
def smart_recommendation(): 
    return render_template('owner/smartrecommendation.html')

@routes.route('/owner-approvals')
def owner_approvals():
    role = session.get("role")
    if role != "owner":
        return "Unauthorized access", 403
    return render_template('owner/owner-approvals.html')


@routes.route('/admin-approvals')
def admin_approvals():
    role = session.get("role")
    if role != "admin":
        return "Unauthorized access", 403
    return render_template('admin/admin-approvals.html')

@routes.route('/profit-margin')
def profit_margin():
    role = session.get("role")
    if role not in ["owner", "admin"]:
        return "Unauthorized access", 403
    return render_template('owner/ownerdashboard.html')