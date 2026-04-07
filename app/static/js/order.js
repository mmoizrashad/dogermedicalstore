let cart = [];
let allProducts = []; // Store all products for searching

window.onload = function() {
    fetchProducts();
    loadStoredProducts();
    
    // Add search functionality
    const searchInput = document.getElementById("search-products");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const searchTerm = e.target.value.toLowerCase();
            
            if (searchTerm === "") {
                // Show all products if search is empty
                displayProducts(allProducts);
            } else {
                // Filter products based on search term
                const filtered = allProducts.filter(product => 
                    product.product_name.toLowerCase().includes(searchTerm) ||
                    (product.product_id && product.product_id.toString().includes(searchTerm)) ||
                    (product.category && product.category.toLowerCase().includes(searchTerm))
                );
                displayProducts(filtered);
            }
        });
    }
};

function loadStoredProducts() {
    const expiryProducts = sessionStorage.getItem('expiryProducts');
    if (expiryProducts) {
        const products = JSON.parse(expiryProducts);
        products.forEach(product => cart.push(product));
        sessionStorage.removeItem('expiryProducts');
        updateCartDisplay();
        showPopup('Expiry products loaded into cart!', false);
    }

    const restockProducts = sessionStorage.getItem('restockProducts');
    if (restockProducts) {
        const products = JSON.parse(restockProducts);
        products.forEach(product => cart.push(product));
        sessionStorage.removeItem('restockProducts');
        updateCartDisplay();
        showPopup('Restock products loaded into cart!', false);
    }
}


async function fetchProducts() {
    try {
        // First fetch page 1 and show immediately
        const res = await fetch("/api/products?page=1&per_page=100");
        const data = await res.json();
        
        // Handle paginated response
        if (data.products && Array.isArray(data.products)) {
            allProducts = data.products;
            displayProducts(allProducts); // Show first page immediately
            
            // Fetch remaining pages in background
            const totalPages = data.pagination?.total_pages || 1;
            if (totalPages > 1) {
                const pagePromises = [];
                for (let page = 2; page <= totalPages; page++) {
                    pagePromises.push(
                        fetch(`/api/products?page=${page}&per_page=100`)
                            .then(res => res.json())
                            .then(d => d.products || [])
                    );
                }
                
                // Get results as they come in (don't wait for all)
                Promise.all(pagePromises).then(results => {
                    results.forEach(pageProducts => {
                        allProducts = allProducts.concat(pageProducts);
                    });
                    // Update display with all products
                    displayProducts(allProducts);
                });
            }
        } else if (Array.isArray(data)) {
            // Old format - data is direct array
            allProducts = data;
            displayProducts(allProducts);
        } else {
            throw new Error("Unexpected data format");
        }
    } catch (err) {
        showPopup("Error fetching products: " + err.message, true);
    }
}


function displayProducts(products) {
    const productList = document.getElementById("product-list");
    productList.innerHTML = "";
    products.forEach(product => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
            <img src="${product.image_path}" alt="${product.product_name}" class="product-image" />
            <div class="product-info">
                <h4>${product.product_name}</h4>
                <p>${product.category}</p>
                <p>${product.price} Pkr</p>
                <button onclick="addToCart('${product.product_name}', ${product.price})">Add</button>
            </div>
        `;
        productList.appendChild(card);
    });
}


function addToCart(name, price) {
    const existing = cart.find(item => item.name === name);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ name, price, quantity: 1 });
    }
    updateCartDisplay();
}


function updateCartDisplay() {
    const orderList = document.getElementById("order-list");
    const subtotalElem = document.getElementById("subtotal");
    const discountElem = document.getElementById("discount");
    const totalElem = document.getElementById("total");

    orderList.innerHTML = "";
    let subtotal = 0;

    cart.forEach(item => {
        subtotal += item.price * item.quantity;
        const row = document.createElement("div");
        row.innerHTML = `${item.name} - ${item.quantity} x ${item.price} = ${item.quantity * item.price} Pkr`;
        orderList.appendChild(row);
    });

    const discount = 0;
    const total = subtotal - discount;

    subtotalElem.textContent = `${subtotal} Pkr`;
    discountElem.textContent = `${discount} Pkr`;
    totalElem.textContent = `${total} Pkr`;
}


document.getElementById("clear-cart").addEventListener("click", () => {
    cart = [];
    updateCartDisplay();
});


document.getElementById("confirm-order").addEventListener("click", async () => {
    if (cart.length === 0) {
        showPopup("Cart is empty.", true);
        return;
    }

    const orderData = {
        supplier_name: "Default Supplier",
        expected_delivery_date: new Date().toISOString().split('T')[0],
        items: cart
    };

    try {
        const res = await fetch('/save_pharmacy_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const data = await res.json();

        if (res.ok && data.pdf_url) {
            showPopup("Order placed successfully!", false);
            setTimeout(() => {
        window.open(data.pdf_url, '_blank'); 
    }, 3000);

            cart = [];
            updateCartDisplay();
        } else {
            showPopup("Error: " + (data.error || "PDF not generated."), true);
        }

    } catch (error) {
        showPopup("Failed to confirm order: " + error.message, true);
    }
});


function showPopup(message, isError = false) {
    const popup = document.createElement("div");
    popup.className = "popup-message";
    if (isError) popup.classList.add("popup-error");
    popup.textContent = message;
    document.body.appendChild(popup);

    
    setTimeout(() => popup.classList.add("popup-show"), 10);

    
    setTimeout(() => {
        popup.classList.remove("popup-show");
        setTimeout(() => popup.remove(), 300);
    }, 3000);
}
