let allInventory = [];
let currentPage = 1;
let totalProductCount = 0;
const itemsPerPage = 20;

function fetchInventory(page = 1) {
    // Fetch only the current page - don't load all pages upfront
    fetch(`/api/products?per_page=${itemsPerPage}&page=${page}`)
        .then(response => response.json())
        .then(data => {
            // Handle paginated response
            if (data.products && Array.isArray(data.products)) {
                allInventory = data.products;
                totalProductCount = data.pagination?.total || 0;
                console.log(`Loaded page ${page}. Total products: ${totalProductCount}`);
            } else {
                allInventory = [];
                totalProductCount = 0;
            }
            
            currentPage = page;
            displayInventory();
            updateInventoryPagination();
        })
        .catch(error => {
            console.error('Error fetching inventory:', error);
        });
}


function displayInventory() {
    const inventoryGrid = document.getElementById('inventoryGrid');
    if (!inventoryGrid) return;
    inventoryGrid.innerHTML = '';

    if (allInventory.length === 0) {
        inventoryGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">No products found</div>';
        return;
    }

    allInventory.forEach(item => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${item.image_path || '/images/default.jpg'}" alt="${item.product_name}" class="product-image">
            <div class="product-info">
                <div class="product-details">
                    <h3>${item.product_name}</h3>
                    <p class="product-price">${item.price} PKR</p>
                    <p class="product-category">${item.category}</p>
                </div>
                <i class="fas fa-chevron-right chevron-right"></i>
            </div>
        `;

        card.addEventListener('click', () => showProductDetails(item));
        inventoryGrid.appendChild(card);
    });
}

function updateInventoryPagination() {
    const inventoryGrid = document.getElementById('inventoryGrid');
    if (!inventoryGrid) return;
    
    let paginationContainer = document.getElementById("inventoryPagination");
    
    if (!paginationContainer) {
        paginationContainer = document.createElement("div");
        paginationContainer.id = "inventoryPagination";
        paginationContainer.style.marginTop = "30px";
        paginationContainer.style.display = "flex";
        paginationContainer.style.justifyContent = "center";
        paginationContainer.style.gap = "8px";
        paginationContainer.style.flexWrap = "wrap";
        paginationContainer.style.padding = "20px";
        inventoryGrid.parentNode.insertBefore(paginationContainer, inventoryGrid.nextSibling);
    }
    
    paginationContainer.innerHTML = "";
    
    const totalPages = Math.ceil(totalProductCount / itemsPerPage);
    if (totalPages <= 1) return;
    
    // Previous button
    const prevBtn = document.createElement("button");
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> Prev';
    prevBtn.disabled = currentPage === 1;
    prevBtn.style.cssText = "padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;";
    prevBtn.onclick = () => goToPage(currentPage - 1);
    paginationContainer.appendChild(prevBtn);
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        const firstBtn = document.createElement("button");
        firstBtn.textContent = "1";
        firstBtn.style.cssText = "padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;";
        firstBtn.onclick = () => goToPage(1);
        paginationContainer.appendChild(firstBtn);
        
        if (startPage > 2) {
            const dots = document.createElement("span");
            dots.textContent = "...";
            dots.style.cssText = "padding: 8px 4px;";
            paginationContainer.appendChild(dots);
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        const isActive = i === currentPage;
        btn.style.cssText = `padding: 8px 12px; border: 1px solid ${isActive ? '#138BA8' : '#ddd'}; background: ${isActive ? '#138BA8' : 'white'}; color: ${isActive ? 'white' : 'black'}; cursor: pointer; border-radius: 4px; font-weight: ${isActive ? 'bold' : 'normal'};`;
        btn.onclick = () => goToPage(i);
        paginationContainer.appendChild(btn);
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const dots = document.createElement("span");
            dots.textContent = "...";
            dots.style.cssText = "padding: 8px 4px;";
            paginationContainer.appendChild(dots);
        }
        
        const lastBtn = document.createElement("button");
        lastBtn.textContent = totalPages;
        lastBtn.style.cssText = "padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;";
        lastBtn.onclick = () => goToPage(totalPages);
        paginationContainer.appendChild(lastBtn);
    }
    
    // Next button
    const nextBtn = document.createElement("button");
    nextBtn.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.style.cssText = "padding: 8px 12px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px;";
    nextBtn.onclick = () => goToPage(currentPage + 1);
    paginationContainer.appendChild(nextBtn);
}

function goToPage(page) {
    const totalPages = Math.ceil(totalProductCount / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    
    fetchInventory(page);
    document.getElementById('inventoryGrid').scrollIntoView({ behavior: 'smooth' });
}


function showProductDetails(product) {
    const modal = document.getElementById('productModal');
    if (!modal) return;
    const modalBody = modal.querySelector('.modal-body');

    modalBody.innerHTML = `
        <div class="product-detail-header">
            <img src="${product.image_path || '/images/default.jpg'}" alt="${product.product_name}" class="product-detail-image">
            <div class="product-detail-info">
                <h2>${product.product_name}</h2>
                <div class="product-detail-meta">
                    <div class="meta-item"><span class="meta-label">Price:</span><span class="meta-value">${product.price} PKR</span></div>
                    <div class="meta-item"><span class="meta-label">Category:</span><span class="meta-value">${product.category}</span></div>
                    <div class="meta-item"><span class="meta-label">Stock:</span><span class="meta-value">${product.stock_quantity} units</span></div>
                    <div class="meta-item"><span class="meta-label">Brand:</span><span class="meta-value">${product.brand}</span></div>
                    <div class="meta-item"><span class="meta-label">Expiry Date:</span><span class="meta-value">${product.expiry_date}</span></div>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'block';

    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
        closeBtn.onclick = () => modal.style.display = 'none';
    }

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}


function setupNewEventListeners() {
    const expiryBtn = document.getElementById('addExpiryProductsBtn');
    const restockBtn = document.getElementById('addRestockProductsBtn');

    if (expiryBtn) expiryBtn.addEventListener('click', addExpiryProductsToOrder);
    if (restockBtn) restockBtn.addEventListener('click', addRestockProductsToOrder);
}


async function addExpiryProductsToOrder() {
    try {
        const response = await fetch('/expiry_alerts');
        const expiryData = await response.json();

        if (expiryData.error) {
            throw new Error(expiryData.error);
        }

        const urgentExpiry = expiryData.filter(product => product.time_to_expiry <= 30);

        if (urgentExpiry.length === 0) {
            showNotification('No products expiring soon found!', 'info');
            return;
        }

        const orderProducts = urgentExpiry.map(product => ({
            name: product.product_name,
            price: 100,
            quantity: 10
        }));

        sessionStorage.setItem('expiryProducts', JSON.stringify(orderProducts));

        showNotification(`${urgentExpiry.length} expiry products added to order cart!`, 'success');

        setTimeout(() => {
            window.location.href = '/order';
        }, 1500);

    } catch (error) {
        console.error('Error fetching expiry products:', error);
        showNotification('Error loading expiry products', 'error');
    }
}


async function addRestockProductsToOrder() {
    try {
        const response = await fetch('/api/predict_restocks');
        const restockData = await response.json();

        if (restockData.error) {
            throw new Error(restockData.error);
        }

        const urgentRestock = restockData.filter(product => product.predicted_days_until_restock <= 14);

        if (urgentRestock.length === 0) {
            showNotification('No urgent restock products found!', 'info');
            return;
        }

        const orderProducts = urgentRestock.map(product => ({
            name: product.product_name,
            price: 150,
            quantity: product.recommended_quantity
        }));

        sessionStorage.setItem('restockProducts', JSON.stringify(orderProducts));

        showNotification(`${urgentRestock.length} restock products added to order cart!`, 'success');

        setTimeout(() => {
            window.location.href = '/order';
        }, 1500);

    } catch (error) {
        console.error('Error fetching restock products:', error);
        showNotification('Error loading restock products', 'error');
    }
}


function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'error' ? '#E74C3C' : type === 'success' ? '#27AE60' : type === 'warning' ? '#F39C12' : '#3498DB'};
        color: white;
        border-radius: 8px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            ${message}
        </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 3000);
}


document.addEventListener('DOMContentLoaded', () => {
    fetchInventory();
    setupNewEventListeners();

    // Mobile sidebar toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (menuToggle && sidebar) {
        const overlay = document.createElement('div');
        overlay.classList.add('overlay');
        document.body.appendChild(overlay);

        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // Desktop sidebar collapse toggle
    const toggleBtn = document.querySelector('.toggle-btn');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
});