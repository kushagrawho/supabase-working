
const CUSTOMER_STORAGE_KEY = "bizpilot_customers_v1";
const CUSTOMER_NEXT_ID_KEY = "bizpilot_customer_next_id";

function loadCustomers() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_STORAGE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveCustomers(customers) {
  localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customers));
}

function escapeCustomerHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function generateCustomerId(customers) {
  let nextNumber = Number(localStorage.getItem(CUSTOMER_NEXT_ID_KEY));

  if (!Number.isInteger(nextNumber) || nextNumber < 1) {
    const largestNumber = customers.reduce((largest, customer) => {
      const match = String(customer.customerId || "").match(/^vs(\d+)$/i);
      return match ? Math.max(largest, Number(match[1])) : largest;
    }, 0);

    nextNumber = largestNumber + 1;
  }

  const customerId = "vs" + String(nextNumber).padStart(4, "0");

  localStorage.setItem(CUSTOMER_NEXT_ID_KEY, String(nextNumber + 1));

  return customerId;
}


function renderCustomersPage() {
  const customers = loadCustomers();

  let sales = [];

  try {
    sales = JSON.parse(localStorage.getItem("bizpilot_sales_v1")) || [];
    if (!Array.isArray(sales)) sales = [];
  } catch (error) {
    sales = [];
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  oneYearAgo.setHours(0, 0, 0, 0);

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value + "T00:00:00");

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function formatProfit(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });
  }

  const customerSummaries = customers.map(customer => {
    const customerSales = sales.filter(
      sale => sale.customerMobile === customer.mobile
    );

    const lastSale = customerSales.reduce((latest, sale) => {
      if (!latest || sale.date > latest.date) return sale;
      return latest;
    }, null);

    const profitLastYear = customerSales.reduce((total, sale) => {
      const saleDate = new Date(sale.date + "T00:00:00");

      if (
        !Number.isNaN(saleDate.getTime()) &&
        saleDate >= oneYearAgo &&
        saleDate <= today
      ) {
        return total + Number(sale.profit || 0);
      }

      return total;
    }, 0);

    return {
      ...customer,
      lastPurchase: lastSale ? lastSale.date : "",
      profitLastYear: profitLastYear
    };
  });

  const topCustomers = [...customerSummaries]
    .sort((a, b) => b.profitLastYear - a.profitLastYear)
    .slice(0, 5);

  const topRows = topCustomers.length
    ? topCustomers.map(customer => `
        <tr>
          <td>${escapeCustomerHTML(customer.customerId)}</td>
          <td>${escapeCustomerHTML(customer.name)}</td>
          <td>${escapeCustomerHTML(customer.mobile)}</td>
          <td><strong>${formatProfit(customer.profitLastYear)}</strong></td>
        </tr>
      `).join("")
    : `
        <tr>
          <td colspan="4" class="empty-note">
            Add customers and record sales to see your top five customers.
          </td>
        </tr>
      `;

  const customerRows = customerSummaries.length
    ? customerSummaries.map(customer => `
        <tr data-customer-row>
          <td><strong>${escapeCustomerHTML(customer.customerId)}</strong></td>
          <td>${escapeCustomerHTML(customer.mobile)}</td>
          <td>${escapeCustomerHTML(customer.name)}</td>
          <td>${formatDate(customer.lastPurchase)}</td>
          <td>${formatProfit(customer.profitLastYear)}</td>
        </tr>
      `).join("")
    : `
        <tr>
          <td colspan="5" class="empty-note">
            No customers added yet. Use the form below to add your first customer.
          </td>
        </tr>
      `;

  return `
    <div class="customer-stats">
      <div class="stat-card">
        <div class="stat-top">Total customers</div>
        <div class="stat-value">${customers.length}</div>
        <div class="stat-foot">Registered customers</div>
      </div>

      <div class="stat-card">
        <div class="stat-top">Customer identification</div>
        <div class="stat-value">Mobile</div>
        <div class="stat-foot">One unique mobile number per customer</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Top 5 customers</h3>
          <div class="panel-sub">
            Ranked by manually entered profit in the last 12 months
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer ID</th>
              <th>Customer name</th>
              <th>Mobile number</th>
              <th>Profit (last 12 months)</th>
            </tr>
          </thead>
          <tbody>
            ${topRows}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Customer list</h3>
          <div class="panel-sub">Manage your registered customers</div>
        </div>

        <button class="muted-link" id="customerExport">
          Export CSV ↓
        </button>
      </div>

      <div class="module-toolbar">
        <input
          type="search"
          class="search-input"
          id="customerSearch"
          placeholder="Search by ID, name or mobile number..."
        />

        <span class="panel-sub">
          ${customers.length} customers
        </span>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer ID</th>
              <th>Mobile number</th>
              <th>Customer name</th>
              <th>Last purchase</th>
              <th>Profit (last 12 months)</th>
            </tr>
          </thead>

          <tbody id="customerTableBody">
            ${customerRows}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Add new customer</h3>
          <div class="panel-sub">
            Customer ID will be generated automatically.
          </div>
        </div>
      </div>

      <form id="customerForm" class="customer-form">
        <div class="customer-field">
          <label for="customerMobile">Customer mobile number</label>
          <input
            type="tel"
            id="customerMobile"
            name="mobile"
            class="search-input"
            placeholder="Enter 10-digit mobile number"
            maxlength="10"
            pattern="[0-9]{10}"
            inputmode="numeric"
            required
          />
        </div>

        <div class="customer-field">
          <label for="customerName">Customer name</label>
          <input
            type="text"
            id="customerName"
            name="name"
            class="search-input"
            placeholder="Enter customer name"
            required
          />
        </div>

        <button type="submit" class="small-button">
          + Add customer
        </button>
      </form>

      <p class="panel-sub customer-note">
        Mobile numbers must be unique. Customer names can be duplicated.
      </p>
    </div>
  `;
}


// Add a customer
document.addEventListener("submit", function(event) {
  if (event.target.id !== "customerForm") return;

  event.preventDefault();

  const mobile = event.target.elements.mobile.value.trim();
  const name = event.target.elements.name.value.trim();

  if (!/^[0-9]{10}$/.test(mobile)) {
    toast("Please enter a valid 10-digit mobile number.");
    return;
  }

  if (!name) {
    toast("Customer name is required.");
    return;
  }

  const customers = loadCustomers();

  const alreadyExists = customers.some(
    customer => customer.mobile === mobile
  );

  if (alreadyExists) {
    toast("This mobile number is already registered.");
    return;
  }

  const newCustomer = {
    customerId: generateCustomerId(customers),
    mobile: mobile,
    name: name
  };

  customers.push(newCustomer);
  saveCustomers(customers);

  render("customers");
  toast("Customer added successfully.");
});

// Search customers
document.addEventListener("input", function(event) {
  if (event.target.id !== "customerSearch") return;

  const searchText = event.target.value.toLowerCase();

  document.querySelectorAll("[data-customer-row]").forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(searchText)
      ? ""
      : "none";
  });
});

// Export customers to CSV
document.addEventListener("click", function(event) {
  if (event.target.id !== "customerExport") return;

  const customers = loadCustomers();

  const headers = [
    "Customer ID",
    "Mobile number",
    "Customer name",
    "Last purchase",
    "Profit (last 12 months)"
  ];

  const rows = customers.map(customer => [
    customer.customerId,
    customer.mobile,
    customer.name,
    "",
    ""
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(value =>
      `"${String(value).replace(/"/g, '""')}"`
    ).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "customers.csv";
  link.click();

  URL.revokeObjectURL(url);

  toast("Customer CSV exported.");
});
