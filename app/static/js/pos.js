let products = [];
let cart = [];
let currentPage = 1;
let paginationData = null;

document.addEventListener("DOMContentLoaded", () => {
    fetchProducts(1);

    // Mobile menu toggle
    const toggleBtn = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (toggleBtn && navLinks) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navLinks.classList.toggle('active');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.navbar')) {
                navLinks.classList.remove('active');
            }
        });
    }

    
    document.getElementById("paidAmount").addEventListener("input", updateBillingSummary);

    
    document.getElementById("searchInput").addEventListener("keyup", function () {
        const filter = this.value.toLowerCase();

        
        const filteredProducts = products.filter(product =>
            product.product_name.toLowerCase().includes(filter) ||
            product.product_id.toString().includes(filter)
        );

        
        displayProducts(filteredProducts);
    });

    document.getElementById("categorySelect").addEventListener("change", function () {
        const category = this.value;

        if (category === "All Categories") {
            displayProducts(products);
        } else {
            const filteredProducts = products.filter(product =>
                product.category && product.category.toLowerCase() === category.toLowerCase()
            );
            displayProducts(filteredProducts);
        }
    });
});


function showPopup(message, type = "success") {
    const existing = document.getElementById("popupMessage");
    if (existing) existing.remove();

    const popup = document.createElement("div");
    popup.id = "popupMessage";
    popup.textContent = message;
    popup.style.position = "fixed";
    popup.style.top = "20px";
    popup.style.right = "20px";
    popup.style.padding = "15px 25px";
    popup.style.borderRadius = "5px";
    popup.style.color = "#fff";
    popup.style.fontWeight = "bold";
    popup.style.zIndex = 1000;
    popup.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
    popup.style.transition = "opacity 0.5s";

    if (type === "success") {
        popup.style.backgroundColor = "#28a745"; 
    } else if (type === "error") {
        popup.style.backgroundColor = "#dc3545"; 
    }

    document.body.appendChild(popup);

    setTimeout(() => {
        popup.style.opacity = "0";
        setTimeout(() => popup.remove(), 500);
    }, 5000);
}

function fetchProducts(page = 1) {
    const perPage = 15; // Products per page for POS
    fetch(`/api/products?page=${page}&per_page=${perPage}`)
        .then(res => res.json())
        .then(data => {
            if (data.products) {
                products = data.products;
                paginationData = data.pagination;
                currentPage = page;
                displayProducts(products);
                updatePaginationControls();
            } else if (Array.isArray(data)) {
                // Fallback for old API format
                products = data;
                displayProducts(products);
            }
        })
        .catch(err => console.error("Error loading products:", err));
}

function updatePaginationControls() {
    let paginationContainer = document.getElementById("posPaginationControls");
    
    if (!paginationContainer) {
        // Create pagination container if it doesn't exist
        const tableCard = document.querySelector(".table-responsive");
        paginationContainer = document.createElement("div");
        paginationContainer.id = "posPaginationControls";
        paginationContainer.style.marginTop = "20px";
        tableCard.parentElement.appendChild(paginationContainer);
    }
    
    paginationContainer.innerHTML = "";
    
    if (!paginationData || paginationData.total_pages <= 1) {
        return;
    }
    
    // Create pagination nav
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Page navigation");
    
    const ul = document.createElement("ul");
    ul.className = "pagination justify-content-center";
    
    // Previous button
    const prevLi = document.createElement("li");
    prevLi.className = `page-item ${!paginationData.has_prev ? 'disabled' : ''}`;
    prevLi.innerHTML = `
        <a class="page-link" href="#" onclick="goToPage(${currentPage - 1}); return false;">
            <i class="bi bi-chevron-left"></i> Previous
        </a>
    `;
    ul.appendChild(prevLi);
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(paginationData.total_pages, currentPage + 2);
    
    if (startPage > 1) {
        const firstLi = document.createElement("li");
        firstLi.className = "page-item";
        firstLi.innerHTML = `<a class="page-link" href="#" onclick="goToPage(1); return false;">1</a>`;
        ul.appendChild(firstLi);
        
        if (startPage > 2) {
            const dotsLi = document.createElement("li");
            dotsLi.className = "page-item disabled";
            dotsLi.innerHTML = `<span class="page-link">...</span>`;
            ul.appendChild(dotsLi);
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const li = document.createElement("li");
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a>`;
        ul.appendChild(li);
    }
    
    if (endPage < paginationData.total_pages) {
        if (endPage < paginationData.total_pages - 1) {
            const dotsLi = document.createElement("li");
            dotsLi.className = "page-item disabled";
            dotsLi.innerHTML = `<span class="page-link">...</span>`;
            ul.appendChild(dotsLi);
        }
        
        const lastLi = document.createElement("li");
        lastLi.className = "page-item";
        lastLi.innerHTML = `<a class="page-link" href="#" onclick="goToPage(${paginationData.total_pages}); return false;">${paginationData.total_pages}</a>`;
        ul.appendChild(lastLi);
    }
    
    // Next button
    const nextLi = document.createElement("li");
    nextLi.className = `page-item ${!paginationData.has_next ? 'disabled' : ''}`;
    nextLi.innerHTML = `
        <a class="page-link" href="#" onclick="goToPage(${currentPage + 1}); return false;">
            Next <i class="bi bi-chevron-right"></i>
        </a>
    `;
    ul.appendChild(nextLi);
    
    nav.appendChild(ul);
    paginationContainer.appendChild(nav);
}

function goToPage(page) {
    if (paginationData && (page < 1 || page > paginationData.total_pages)) {
        return;
    }
    fetchProducts(page);
    // Scroll to top of products section
    document.querySelector(".table-responsive").scrollIntoView({ behavior: "smooth", block: "start" });
}

function displayProducts(products) {
    const tbody = document.getElementById("productTableBody");
    tbody.innerHTML = "";

    products.forEach(product => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><img src="${product.image_path}" width="50"></td>
            <td>${product.product_name}</td>
            <td>${product.product_id}</td>
            <td>${product.stock_quantity}</td>
            <td>${product.price}</td>
            <td>
                <button class="btn btn-sm btn-success" onclick="addToCart(${product.product_id}, '${product.product_name.replace(/'/g, "\\'")}', ${product.price})">
                    <i class="bi bi-plus-circle"></i> Add
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function addToCart(product_id, name, price) {
    const existing = cart.find(item => item.product_id === product_id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ product_id, name, price, quantity: 1 });
    }
    updateCartDisplay();
}

function removeFromCart(product_id) {
    cart = cart.filter(item => item.product_id !== product_id);
    updateCartDisplay();
}

function clearCart() {
    cart = [];
    updateCartDisplay();
    document.getElementById("paidAmount").value = '';
    document.getElementById("returnedAmount").value = '';
}

function updateCartDisplay() {
    const tbody = document.getElementById("cartTableBody");
    tbody.innerHTML = "";
    let total = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${item.quantity}</td>
            <td>${item.name}</td>
            <td>${item.price.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeFromCart(${item.product_id})">
                    <i class="bi bi-x"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById("totalAmount").textContent = total.toFixed(2);
    document.getElementById("taxAmount").textContent = "0.00";
    document.getElementById("discountAmount").textContent = "0.00";

    updateBillingSummary();
}

function updateBillingSummary() {
    const paid = parseFloat(document.getElementById("paidAmount").value) || 0;
    const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const change = paid - total;

    document.getElementById("returnedAmount").value = change.toFixed(2);
}

async function saveOrder() {
    if (cart.length === 0) {
        showPopup("Cart is empty.", "error"); 
        return;
    }

    const paidAmount = parseFloat(document.getElementById("paidAmount").value) || 0;
    const totalAmount = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const changeAmount = paidAmount - totalAmount;

    
    if (paidAmount <= 0) {
        showPopup("Please enter a valid paid amount.", "error");
        return;
    }

    if (changeAmount < 0) {
        showPopup("Paid amount is less than total. Cannot save order.", "error");
        return;
    }

    try {
        const response = await fetch('/api/save_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cart: cart,
                paid_amount: paidAmount,
                change_amount: changeAmount
            })
        });

        const result = await response.json();

        if (result.success) {
            showPopup(`Order saved successfully! Order ID: ${result.order_id}`, "success");

            setTimeout(() => {
                window.open(result.pdf_url, '_blank');
            }, 2000);

            clearCart();
            fetchProducts(1);
        } else {
            showPopup("Error saving order: " + result.error, "error");
        }
    } catch (err) {
        console.error("Error saving order:", err);
        showPopup("Server error while saving order.", "error");
    }
}

function newOrder() {
    clearCart();
}

function displayProducts(products) {
    const tbody = document.getElementById("productTableBody");
    tbody.innerHTML = "";

    products.forEach(product => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><img src="${product.image_path}" width="50"></td>
            <td>${product.product_name}</td>
            <td>${product.product_id}</td>
            <td>${product.stock_quantity}</td>
            <td>${product.price}</td>
            <td>
                <button class="btn btn-sm btn-success" onclick="addToCart(${product.product_id}, '${product.product_name.replace(/'/g, "\\'")}', ${product.price})">
                    <i class="bi bi-plus-circle"></i> Add
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function addToCart(product_id, name, price) {
    const existing = cart.find(item => item.product_id === product_id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ product_id, name, price, quantity: 1 });
    }
    updateCartDisplay();
}

function removeFromCart(product_id) {
    cart = cart.filter(item => item.product_id !== product_id);
    updateCartDisplay();
}

function clearCart() {
    cart = [];
    updateCartDisplay();
    document.getElementById("paidAmount").value = '';
    document.getElementById("returnedAmount").value = '';
}

function updateCartDisplay() {
    const tbody = document.getElementById("cartTableBody");
    tbody.innerHTML = "";
    let total = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${item.quantity}</td>
            <td>${item.name}</td>
            <td>${item.price.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeFromCart(${item.product_id})">
                    <i class="bi bi-x"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById("totalAmount").textContent = total.toFixed(2);
    document.getElementById("taxAmount").textContent = "0.00";
    document.getElementById("discountAmount").textContent = "0.00";

    updateBillingSummary();
}

function updateBillingSummary() {
    const paid = parseFloat(document.getElementById("paidAmount").value) || 0;
    const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const change = paid - total;

    document.getElementById("returnedAmount").value = change.toFixed(2);
}

async function saveOrder() {
    if (cart.length === 0) {
        showPopup("Cart is empty.", "error"); 
        return;
    }

    const paidAmount = parseFloat(document.getElementById("paidAmount").value) || 0;
    const totalAmount = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const changeAmount = paidAmount - totalAmount;

    
    if (paidAmount <= 0) {
        showPopup("Please enter a valid paid amount.", "error");
        return;
    }

    if (changeAmount < 0) {
        showPopup("Paid amount is less than total. Cannot save order.", "error");
        return;
    }

    try {
        const response = await fetch('/api/save_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cart: cart,
                paid_amount: paidAmount,
                change_amount: changeAmount
            })
        });

        const result = await response.json();

        if (result.success) {
            showPopup(`Order saved successfully! Order ID: ${result.order_id}`, "success");

            setTimeout(() => {
                window.open(result.pdf_url, '_blank');
            }, 2000);

            clearCart();
            fetchProducts();
        } else {
            showPopup("Error saving order: " + result.error, "error");
        }
    } catch (err) {
        console.error("Error saving order:", err);
        showPopup("Server error while saving order.", "error");
    }
}

function newOrder() {
    clearCart();
}