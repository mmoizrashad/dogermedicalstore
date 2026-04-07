document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM Loaded, Fetching Products...");
    fetchProducts(1);
    setupEventListeners();
});

let products = [];
let currentPage = 1;
let paginationData = null;

function setupEventListeners() {
   
    document.getElementById('searchInput').addEventListener('input', filterProducts);
    document.getElementById('categoryFilter').addEventListener('change', filterProducts);


    document.getElementById('uploadArea').addEventListener('click', () => {
        document.getElementById('imageInput').click();
    });   

    document.getElementById('imageInput').addEventListener('change', handleImageUpload);


    document.getElementById('addProductForm').addEventListener('submit', handleFormSubmit);
}

function fetchProducts(page = 1) {
    const perPage = 20; // Products per page for inventory
    fetch(`/api/products?page=${page}&per_page=${perPage}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Fetched Products:", data);
            
            // Handle both new paginated format and old array format
            if (data.products && Array.isArray(data.products)) {
                products = data.products;
                paginationData = data.pagination;
                currentPage = page;
                renderProducts(data.products);
                updateInventoryPaginationControls();
            } else if (Array.isArray(data)) {
                products = data;
                renderProducts(data);
            } else {
                throw new Error("Unexpected data format");
            }
        })
        .catch(error => {
            console.error("Error fetching products:", error);
            showNotification('Error fetching products', 'error');
        });
}

function renderProducts(productsToRender) {
    const tableBody = document.getElementById("productTableBody");

    if (!tableBody) {
        console.error("Table body not found!");
        return;
    }

    tableBody.innerHTML = '';

    productsToRender.forEach(product => {
        const row = document.createElement("tr");
        row.style.cursor = 'pointer';
        row.addEventListener('mouseenter', () => {
            row.style.backgroundColor = '#f8f9fa';
        });
        row.addEventListener('mouseleave', () => {
            row.style.backgroundColor = '';
        });

        const imagePath = product.image_path ? product.image_path : '/images/default.jpg';

        row.innerHTML = `
            <td><img src="${imagePath}" alt="${product.product_name}" class="product-image" ></td>
            <td>
                <div style="font-weight: 600;">${product.product_name}</div>
                <div class="category-tag">${product.category}</div>
            </td>
            <td>${product.product_id}</td>
            <td>
                <span style="color: ${product.stock_quantity < 10 ? '#e74c3c' : '#27ae60'}; font-weight: 600;">
                    ${product.stock_quantity}
                </span>
            </td>
            <td>${product.expiry_date ? formatDate(product.expiry_date) : 'N/A'}</td>
            <td>Rs. ${parseFloat(product.price || 0).toFixed(2)}</td>
            <td>Rs. ${calculateSellingPrice(product.price)}</td>
            <td>
                <button class="actions-btn" onclick="editProduct(${product.product_id})" title="Edit Product">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="actions-btn" onclick="deleteProduct(${product.product_id})" title="Delete Product" style="color: #e74c3c; margin-left: 5px;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    console.log("Products Rendered!");
}

function updateInventoryPaginationControls() {
    let paginationContainer = document.getElementById("inventoryPaginationControls");
    
    if (!paginationContainer) {
        // Create pagination container if it doesn't exist
        const tableContainer = document.querySelector(".table-container");
        paginationContainer = document.createElement("div");
        paginationContainer.id = "inventoryPaginationControls";
        paginationContainer.style.marginTop = "20px";
        paginationContainer.style.display = "flex";
        paginationContainer.style.justifyContent = "center";
        tableContainer.parentElement.appendChild(paginationContainer);
    }
    
    paginationContainer.innerHTML = "";
    
    if (!paginationData || paginationData.total_pages <= 1) {
        return;
    }
    
    // Create pagination nav
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Page navigation");
    
    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.display = "flex";
    ul.style.gap = "5px";
    ul.style.padding = "0";
    ul.style.alignItems = "center";
    
    // Previous button
    const prevLi = document.createElement("li");
    prevLi.innerHTML = `
        <button onclick="inventoryGoToPage(${currentPage - 1})" 
                style="padding: 8px 12px; border: 1px solid #ddd; background: ${!paginationData.has_prev ? '#f0f0f0' : 'white'}; cursor: ${!paginationData.has_prev ? 'not-allowed' : 'pointer'}; border-radius: 4px;"
                ${!paginationData.has_prev ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i> Prev
        </button>
    `;
    ul.appendChild(prevLi);
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(paginationData.total_pages, currentPage + 2);
    
    if (startPage > 1) {
        const firstLi = document.createElement("li");
        firstLi.innerHTML = `<button onclick="inventoryGoToPage(1)" style="padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;">1</button>`;
        ul.appendChild(firstLi);
        
        if (startPage > 2) {
            const dotsLi = document.createElement("li");
            dotsLi.innerHTML = `<span style="padding: 8px 4px;">...</span>`;
            ul.appendChild(dotsLi);
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const li = document.createElement("li");
        const isActive = i === currentPage;
        li.innerHTML = `<button onclick="inventoryGoToPage(${i})" style="padding: 8px 12px; border: 1px solid ${isActive ? '#138BA8' : '#ddd'}; background: ${isActive ? '#138BA8' : 'white'}; color: ${isActive ? 'white' : 'black'}; cursor: pointer; border-radius: 4px; font-weight: ${isActive ? 'bold' : 'normal'};">${i}</button>`;
        ul.appendChild(li);
    }
    
    if (endPage < paginationData.total_pages) {
        if (endPage < paginationData.total_pages - 1) {
            const dotsLi = document.createElement("li");
            dotsLi.innerHTML = `<span style="padding: 8px 4px;">...</span>`;
            ul.appendChild(dotsLi);
        }
        
        const lastLi = document.createElement("li");
        lastLi.innerHTML = `<button onclick="inventoryGoToPage(${paginationData.total_pages})" style="padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;">${paginationData.total_pages}</button>`;
        ul.appendChild(lastLi);
    }
    
    // Next button
    const nextLi = document.createElement("li");
    nextLi.innerHTML = `
        <button onclick="inventoryGoToPage(${currentPage + 1})" 
                style="padding: 8px 12px; border: 1px solid #ddd; background: ${!paginationData.has_next ? '#f0f0f0' : 'white'}; cursor: ${!paginationData.has_next ? 'not-allowed' : 'pointer'}; border-radius: 4px;"
                ${!paginationData.has_next ? 'disabled' : ''}>
            Next <i class="fas fa-chevron-right"></i>
        </button>
    `;
    ul.appendChild(nextLi);
    
    nav.appendChild(ul);
    paginationContainer.appendChild(nav);
}

function inventoryGoToPage(page) {
    if (paginationData && (page < 1 || page > paginationData.total_pages)) {
        return;
    }
    fetchProducts(page);
    // Scroll to top
    document.querySelector(".table-container").scrollIntoView({ behavior: "smooth", block: "start" });
}

function filterProducts() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;

    let filtered = products.filter(product => {
        const matchesSearch = product.product_name.toLowerCase().includes(searchTerm) ||
            product.product_id.toString().includes(searchTerm);

        const matchesCategory = categoryFilter === 'all' ||
            product.category.toLowerCase() === categoryFilter.toLowerCase();

        return matchesSearch && matchesCategory;
    });

    renderProducts(filtered);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date)) return "Invalid Date";
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`;
}

function calculateSellingPrice(costPrice) {
    return (parseFloat(costPrice || 0) * 1.2).toFixed(2);
}


function openAddProductModal() {
    document.getElementById('addProductModal').style.display = 'block';
    document.querySelector('#addProductModal h2').textContent = 'Add Product';
    document.getElementById('addProductForm').reset();
    document.getElementById('previewImage').style.display = 'none';

   
    document.getElementById('addProductForm').removeAttribute('data-edit-id');
}

function closeAddProductModal() {
    document.getElementById('addProductModal').style.display = 'none';
    document.getElementById('addProductForm').reset();
    document.getElementById('previewImage').style.display = 'none';
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const previewImage = document.getElementById('previewImage');
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();

    const formData = new FormData();
    const editId = event.target.getAttribute('data-edit-id');

    
    formData.append('product_name', document.getElementById('productName').value);
    
    formData.append('category', document.getElementById('category').value);
    formData.append('expiry_date', document.getElementById('expiryDate').value);
    formData.append('stock_quantity', document.getElementById('quantity').value);
    formData.append('price', document.getElementById('costPrice').value);
    formData.append('brand', 'Generic'); 
    formData.append('description', `${document.getElementById('productName').value} - ${document.getElementById('category').value}`);

 
    const imageFile = document.getElementById('imageInput').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const url = editId ? `/api/products/${editId}` : '/api/products';
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to save product');
        }

        const result = await response.json();
        showNotification(editId ? 'Product updated successfully!' : 'Product added successfully!', 'success');
        closeAddProductModal();
        fetchProducts(); 

    } catch (error) {
        console.error('Error saving product:', error);
        showNotification('Error saving product', 'error');
    }
}

async function editProduct(productId) {
    const product = products.find(p => p.product_id === productId);
    if (!product) {
        showNotification('Product not found', 'error');
        return;
    }

    document.getElementById('addProductModal').style.display = 'block';
    document.querySelector('#addProductModal h2').textContent = 'Edit Product';


    document.getElementById('productName').value = product.product_name || '';
    document.getElementById('productId').value = product.product_id || '';
    document.getElementById('category').value = product.category || '';
    document.getElementById('expiryDate').value = product.expiry_date ? product.expiry_date.split('T')[0] : '';
    document.getElementById('quantity').value = product.stock_quantity || '';
    document.getElementById('lowStockWarning').value = '10'; 
    document.getElementById('costPrice').value = product.price || '';
    document.getElementById('sellingPrice').value = calculateSellingPrice(product.price);

    
    if (product.image_path) {
        const previewImage = document.getElementById('previewImage');
        previewImage.src = product.image_path;
        previewImage.style.display = 'block';
    }

    
    document.getElementById('addProductForm').setAttribute('data-edit-id', productId);
}

async function deleteProduct(productId) {
    
    const confirmPopup = document.createElement('div');
    confirmPopup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;

    confirmPopup.innerHTML = `
        <div style="
            background: white;
            padding: 25px 30px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            max-width: 350px;
            width: 90%;
            animation: fadeIn 0.3s ease;
        ">
            <h3 style="margin-bottom: 15px; color: #333;">Are you sure?</h3>
            <p style="margin-bottom: 20px; color: #666;">This action cannot be undone.</p>
            <div style="display: flex; justify-content: center; gap: 10px;">
                <button id="confirmYes" style="
                    background: #e74c3c;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                ">Delete</button>
                <button id="confirmNo" style="
                    background: #bdc3c7;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                ">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(confirmPopup);

   
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');

    const userConfirmed = await new Promise(resolve => {
        yesBtn.onclick = () => {
            document.body.removeChild(confirmPopup);
            resolve(true);
        };
        noBtn.onclick = () => {
            document.body.removeChild(confirmPopup);
            resolve(false);
        };
    });

    if (!userConfirmed) return;

    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete product');
        }

        showNotification('Product deleted successfully!', 'success');
        fetchProducts(); 

    } catch (error) {
        console.error('Error deleting product:', error);
        showNotification('Error deleting product', 'error');
    }
}


function showNotification(message, type = 'info') {
   
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db'};
        color: white;
        border-radius: 8px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-weight: 500;
        max-width: 300px;
        animation: slideIn 0.3s ease;
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            ${message}
        </div>
    `;

    document.body.appendChild(notification);

    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 4000);
}


window.addEventListener('click', function (event) {
    const modal = document.getElementById('addProductModal');
    if (event.target === modal) {
        closeAddProductModal();
    }
});


const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .actions-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1.2rem;
        color: #666;
        transition: all 0.3s ease;
        padding: 8px;
        border-radius: 4px;
    }
    
    .actions-btn:hover {
        background-color: #f0f0f0;
        color: #0098b0;
        transform: scale(1.1);
    }
`;
document.head.appendChild(style);

document.addEventListener("DOMContentLoaded", function() {
  const toggleBtn = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  toggleBtn.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
});