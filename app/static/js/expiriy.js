let products = [];


async function fetchExpiryAlerts() {
    try {
        console.log('🔄 Fetching expiry alerts...');
        const response = await fetch('/expiry_alerts');
        
        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ HTTP Error:', response.status, errorText);
            const container = document.getElementById('productsContainer');
            if (container) {
                container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 20px; color: red;">Error ${response.status}: ${errorText}</p>`;
            }
            return;
        }

        const data = await response.json();
        console.log('✅ Data received:', data);

        if (data.error) {
            console.error('🚫 Backend error:', data.error);
            const container = document.getElementById('productsContainer');
            if (container) {
                container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 20px; color: red;">Error: ${data.error}</p>`;
            }
            return;
        }

        if (!Array.isArray(data)) {
            console.error('⚠️ Data is not an array:', typeof data, data);
            const container = document.getElementById('productsContainer');
            if (container) {
                container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 20px; color: red;">Invalid data format</p>';
            }
            return;
        }

        if (data.length === 0) {
            console.log('ℹ️ No products to display');
            const container = document.getElementById('productsContainer');
            if (container) {
                container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 20px;">No products found in database</p>';
            }
            return;
        }

        products = data;
        console.log('✨ Products loaded successfully:', products.length);
        
        const expiredProducts = products.filter(p => p.time_to_expiry < 0);
        const expiringProducts = products.filter(p => p.time_to_expiry >= 0);
        
        console.log('📊 Expired:', expiredProducts.length, 'Expiring:', expiringProducts.length);
        
        displayProducts(products);
    } catch (err) {
        console.error('💥 Fetch error:', err);
        console.error('Error details:', err.message, err.stack);
        const container = document.getElementById('productsContainer');
        if (container) {
            container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 20px; color: red;">Error: ${err.message}</p>`;
        }
    }
}


function getExpiryWarningClass(daysUntilExpiry) {
    if (daysUntilExpiry < 0) return 'warning-expired';
    if (daysUntilExpiry <= 1) return 'warning-day';
    if (daysUntilExpiry <= 7) return 'warning-week';
    if (daysUntilExpiry <= 30) return 'warning-month';
    if (daysUntilExpiry <= 60) return 'warning-caution';
    if (daysUntilExpiry <= 90) return 'warning-watch';
    if (daysUntilExpiry <= 180) return 'warning-attention';
    return 'warning-safe';
}


function createProductCard(product) {
    const warningClass = getExpiryWarningClass(product.time_to_expiry);
    const imageUrl = product.image_url || 'https://placehold.co/300x200';

    
    const expiryText = product.time_to_expiry < 0 
        ? `EXPIRED ${Math.abs(product.time_to_expiry)} days ago`
        : `Expires in ${product.time_to_expiry} days`;

    return `
        <div class="product-card">
            <img src="${imageUrl}" alt="${product.product_name}" 
                 onerror="this.src='https://placehold.co/300x200'">
            <div class="product-info">
                <h3>${product.product_name}</h3>
                <p>Expiry Date: ${new Date(product.expiry_date).toLocaleDateString()}</p>
                <p>Demand: ${product.demand}</p>
                <div class="expiry-warning ${warningClass}">
                    ${product.expiry_alert} — ${expiryText}
                </div>
            </div>
        </div>
    `;
}


function displayProducts(productsToShow) {
    const container = document.getElementById('productsContainer');
    container.innerHTML = productsToShow.map(product => createProductCard(product)).join('');
}


function filterProducts() {
    const timeFilterElement = document.getElementById('timeFilter');
    const searchProductElement = document.getElementById('searchProduct');
    
    if (!timeFilterElement || !searchProductElement) {
        console.warn('Filter elements not found');
        return;
    }
    
    const timeFilter = timeFilterElement.value;
    const searchText = searchProductElement.value.toLowerCase();

    const filteredProducts = products.filter(product => {
        const daysUntilExpiry = product.time_to_expiry;
        const matchesSearch =
            product.product_name.toLowerCase().includes(searchText) ||
            product.demand.toLowerCase().includes(searchText);

        switch (timeFilter) {
            case 'day':
                return daysUntilExpiry <= 1 && matchesSearch;
            case 'week':
                return daysUntilExpiry <= 7 && matchesSearch;
            case 'month':
                return daysUntilExpiry <= 30 && matchesSearch;
            case 'expired':
                return daysUntilExpiry < 0 && matchesSearch;
            default:
                return matchesSearch;
        }
    });

    displayProducts(filteredProducts);
}


// Event listeners for filters
document.addEventListener('DOMContentLoaded', function() {
    const timeFilter = document.getElementById('timeFilter');
    const searchProduct = document.getElementById('searchProduct');
    
    if (timeFilter) {
        timeFilter.addEventListener('change', filterProducts);
    }
    if (searchProduct) {
        searchProduct.addEventListener('input', filterProducts);
    }
    
    // Fetch expiry alerts on page load
    fetchExpiryAlerts();
});

// Sidebar toggle
document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (!menuToggle) {
        console.warn('Menu toggle element not found');
        return;
    }
    
    const overlay = document.createElement('div');
    overlay.classList.add('overlay');
    document.body.appendChild(overlay);

    menuToggle.addEventListener('click', () => {
        if (sidebar) {
            sidebar.classList.toggle('active');
        }
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
        if (sidebar) {
            sidebar.classList.remove('active');
        }
        overlay.classList.remove('active');
    });
});

// Toggle button for sidebar collapse
const sidebar = document.querySelector('.sidebar');
const main = document.querySelector('.main-content');
const toggleBtn = document.querySelector('.toggle-btn');

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
    }
  });
}