let products = [];
let cart = [];
let currentPage = 1;
let paginationData = null;

document.addEventListener("DOMContentLoaded", () => {
    fetchProducts(1);
    updateCartDisplay();
    
    // Add event listeners after DOM is ready
    const categorySelect = document.getElementById("categorySelect");
    const searchInput = document.getElementById("searchInput");
    
    if (categorySelect) {
        categorySelect.addEventListener("change", () => {
            fetchAllProductsForSearch();
        });
    }
    
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            fetchAllProductsForSearch();
        });
    }
});

function fetchProducts(page = 1) {
    const perPage = 20; // Products per page
    fetch(`/api/products?page=${page}&per_page=${perPage}`)
        .then(res => res.json())
        .then(data => {
            if (data.products) {
                products = data.products;
                paginationData = data.pagination;
                currentPage = page;
                displayProducts(products);
                updateProductCount();
                updatePaginationControls();
            } else if (Array.isArray(data)) {
                // Fallback for old API format
                products = data;
                displayProducts(products);
                updateProductCount();
            }
        })
        .catch(err => {
            console.error("Error loading products:", err);
            showNotification("Error loading products. Please refresh the page.", "error");
        });
}

function updateProductCount() {
    const count = paginationData ? paginationData.total : products.length;
    document.getElementById("productCount").textContent = `${count} Products`;
}

function updatePaginationControls() {
    let paginationContainer = document.getElementById("paginationControls");
    
    if (!paginationContainer) {
        // Create pagination container if it doesn't exist
        const productCard = document.querySelector(".card");
        paginationContainer = document.createElement("div");
        paginationContainer.id = "paginationControls";
        paginationContainer.style.marginTop = "20px";
        productCard.appendChild(paginationContainer);
    }
    
    // Show pagination when not filtering
    paginationContainer.style.display = "block";
    paginationContainer.innerHTML = "";
    
    if (!paginationData || paginationData.total_pages <= 1) {
        paginationContainer.style.display = "none";
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
    
    // Clear search and category filters when navigating pages
    // This ensures we're in "browse mode" not "search mode"
    document.getElementById("searchInput").value = "";
    document.getElementById("categorySelect").value = "All Categories";
    
    fetchProducts(page);
    // Scroll to top of products section
    document.querySelector(".card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function fetchAllProductsForSearch() {
    // Progressive search - fetch and display results as they arrive
    
    // First, search current page products immediately
    applyFilters();
    
    // Then fetch remaining pages in background
    const totalPages = paginationData?.total_pages || 1;
    
    if (totalPages <= 1) return; // Only current page exists
    
    // Build full product list progressively by fetching remaining pages
    let allProducts = [...products]; // Start with current page
    
    const pagePromises = [];
    for (let page = 1; page <= totalPages; page++) {
        if (page === currentPage) continue; // Skip current page, already have it
        
        pagePromises.push(
            fetch(`/api/products?per_page=20&page=${page}`)
                .then(res => res.json())
                .then(data => {
                    if (data.products) {
                        return data.products;
                    }
                    return [];
                })
        );
    }
    
    // Fetch all pages and update display progressively
    Promise.all(pagePromises).then(results => {
        results.forEach(pageProducts => {
            allProducts = allProducts.concat(pageProducts);
        });
        
        // Update products with full list and re-apply filters
        products = allProducts;
        applyFilters();
    }).catch(err => console.error("Error fetching products for search:", err));
}

function applyFilters() {
    const category = document.getElementById("categorySelect").value;
    const searchTerm = document.getElementById("searchInput").value.toLowerCase();

    const filtered = products.filter(product => {
        const matchCategory = category === "All Categories" || product.category === category;
        const matchSearch = searchTerm === "" || 
                            product.product_name.toLowerCase().includes(searchTerm) || 
                            (product.product_id && product.product_id.toString().includes(searchTerm));
        return matchCategory && matchSearch;
    });

    displayProducts(filtered);
}

function displayProducts(products) {
    const container = document.getElementById("productContainer");
    container.innerHTML = "";
    
    // Check if user is actively filtering/searching
    const category = document.getElementById("categorySelect").value;
    const searchTerm = document.getElementById("searchInput").value.toLowerCase();
    const isFiltering = (category !== "All Categories") || (searchTerm !== "");
    
    // Hide pagination only when actively filtering/searching
    const paginationControls = document.getElementById("paginationControls");
    if (paginationControls) {
        paginationControls.style.display = isFiltering ? "none" : "block";
    }

    if (products.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-search fs-1 text-muted mb-3 d-block"></i>
                <h5 class="text-muted">No products found</h5>
                <p class="text-muted">Try adjusting your search or filter criteria</p>
            </div>
        `;
        return;
    }

    products.forEach(product => {
        const card = document.createElement("div");
        card.className = "product-card";

        const imagePath = product.image_path || '/images/default.jpg';
        const productName = product.product_name || 'Unknown Product';
        const price = parseFloat(product.price) || 0;

        card.innerHTML = `
            <img src="${imagePath}" alt="${productName}" " />
            <h3 class="product-name">${productName}</h3>
            <div class="product-price">Rs. ${price.toFixed(2)}</div>
            <div class="mb-2">
                <small class="text-muted">
                    <i class="bi bi-box-seam me-1"></i>
                    Stock: ${product.stock_quantity || 0}
                </small>
            </div>
            <button class="add-btn" onclick="addToCart(${product.product_id}, '${productName.replace(/'/g, "\\'")}', ${price})" 
                    ${(product.stock_quantity || 0) <= 0 ? 'disabled' : ''}>
                <i class="bi bi-cart-plus"></i>
                ${(product.stock_quantity || 0) <= 0 ? 'Out of Stock' : 'Add to Cart'}
            </button>
        `;

        container.appendChild(card);
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
    showNotification(`${name} added to cart!`, "success");
}

function removeFromCart(product_id) {
    const item = cart.find(item => item.product_id === product_id);
    cart = cart.filter(item => item.product_id !== product_id);
    updateCartDisplay();
    if (item) {
        showNotification(`${item.name} removed from cart`, "info");
    }
}

function clearCart() {
    cart = [];
    updateCartDisplay();
    showNotification("Cart cleared", "info");
}

function updateCartDisplay() {
    const tbody = document.getElementById("cartTableBody");
    const paymentBtn = document.getElementById("paymentBtn");
    tbody.innerHTML = "";
    let total = 0;

    if (cart.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted py-4">
                    <i class="bi bi-cart-x fs-1 d-block mb-2"></i>
                    Your cart is empty
                </td>
            </tr>
        `;
        paymentBtn.disabled = true;
        paymentBtn.classList.add('disabled');
    } else {
        paymentBtn.disabled = false;
        paymentBtn.classList.remove('disabled');
        
        cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            total += itemTotal;

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>
                    <span class="badge bg-primary rounded-pill">${item.quantity}</span>
                </td>
                <td>
                    <div class="fw-medium">${item.name}</div>
                    <small class="text-muted">Rs. ${item.price.toFixed(2)} each</small>
                </td>
                <td class="fw-bold text-success">Rs. ${itemTotal.toFixed(2)}</td>
                <td>
                    <button class="remove-item" onclick="removeFromCart(${item.product_id})" title="Remove item">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // Update totals
    document.getElementById("totalAmount").textContent = `Rs. ${total.toFixed(2)}`;
    document.getElementById("taxAmount").textContent = "Rs. 0.00";
    document.getElementById("discountAmount").textContent = "Rs. 0.00";
    document.getElementById("finalTotal").textContent = `Rs. ${total.toFixed(2)}`;
}

function proceedToPayment() {
    if (cart.length === 0) {
        showNotification("Your cart is empty!", "warning");
        return;
    }

    // Show loading modal
    const loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
    loadingModal.show();

    // Store cart data in sessionStorage for payment page
    const orderData = {
        cart: cart,
        total: cart.reduce((acc, item) => acc + item.price * item.quantity, 0),
        timestamp: new Date().toISOString()
    };
    
    sessionStorage.setItem('pendingOrder', JSON.stringify(orderData));

    // Simulate processing time then redirect to payment
    setTimeout(() => {
        loadingModal.hide();
        window.location.href = '/payment';
    }, 1500);
}

function newOrder() {
    clearCart();
}

// Alias for backward compatibility
function clearorder() {
    clearCart();
}

function showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
            ${message}
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Add some loading states and animations
document.addEventListener('DOMContentLoaded', function() {
    // Add loading animation to product container initially
    const container = document.getElementById("productContainer");
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <h5 class="text-muted">Loading products...</h5>
        </div>
    `;
});

function proceedToPayment() {
    if (cart.length === 0) {
        showNotification("Your cart is empty!", "warning");
        return;
    }

    // Show loading modal
    const loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
    loadingModal.show();

    // Store cart data in sessionStorage for payment page
    const orderData = {
        cart: cart,
        total: cart.reduce((acc, item) => acc + item.price * item.quantity, 0),
        timestamp: new Date().toISOString()
    };
    
    sessionStorage.setItem('pendingOrder', JSON.stringify(orderData));

    // Simulate processing time then redirect to payment
    setTimeout(() => {
        loadingModal.hide();
        window.location.href = '/payment';
    }, 1500);
}

function newOrder() {
    clearCart();
}

// Alias for backward compatibility
function clearorder() {
    clearCart();
}

function showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
            ${message}
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Add some loading states and animations
document.addEventListener('DOMContentLoaded', function() {
    // Add loading animation to product container initially
    const container = document.getElementById("productContainer");
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <h5 class="text-muted">Loading products...</h5>
        </div>
    `;
});